import {
  SendMonthlySummary,
  getCompletedMonthRange,
  formatSummary,
  ZERO_TRANSACTIONS_MESSAGE,
  BudgetLimit,
} from '../../src/application/usecases/SendMonthlySummary';
import { NotificationPreferenceRepository } from '../../src/domain/ports/NotificationPreferenceRepository';
import { TransactionRepository } from '../../src/domain/ports/TransactionRepository';
import { UserRepository } from '../../src/domain/ports/UserRepository';
import { NotificationSender } from '../../src/domain/ports/NotificationSender';
import { User } from '../../src/domain/entities/User';
import { Transaction } from '../../src/domain/entities/Transaction';
import { formatVND } from '../../src/application/services/vnd-formatter';

describe('SendMonthlySummary', () => {
  let useCase: SendMonthlySummary;
  let mockPrefRepo: jest.Mocked<NotificationPreferenceRepository>;
  let mockTxRepo: jest.Mocked<TransactionRepository>;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockNotificationSender: jest.Mocked<NotificationSender>;

  const baseUser: User = {
    id: 'user-1',
    channel: 'telegram',
    channelUserId: '12345',
    channelUsername: 'testuser',
    accessStatus: 'whitelisted',
    plan: 'free',
    whitelistedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(() => {
    mockPrefRepo = {
      findByUserId: jest.fn(),
      upsert: jest.fn(),
      findEligibleUserIds: jest.fn(),
      createDefault: jest.fn(),
    };
    mockTxRepo = {
      save: jest.fn(),
      findByUserAndDateRange: jest.fn(),
      findDistinctUserIds: jest.fn(),
      findById: jest.fn(),
      findLastByUser: jest.fn(),
      findRecentByUser: jest.fn().mockResolvedValue([]),
      findByUserAndKeyword: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      deleteById: jest.fn(),
    };
    mockUserRepo = {
      findByChannelAndUserId: jest.fn(),
      create: jest.fn(),
      updateAccessStatus: jest.fn(),
      findById: jest.fn(),
      findByStatus: jest.fn(),
    };
    mockNotificationSender = {
      sendMessage: jest.fn(),
    };
    useCase = new SendMonthlySummary(
      mockPrefRepo,
      mockTxRepo,
      mockUserRepo,
      mockNotificationSender,
    );
  });

  describe('execute', () => {
    it('should send monthly summary to eligible users with transactions', async () => {
      const txs: Transaction[] = [
        { id: 'tx-1', userId: 'user-1', amount: 100000, category: 'ăn uống', note: 'ăn trưa' },
        { id: 'tx-2', userId: 'user-1', amount: 50000, category: 'di chuyển', note: 'grab' },
      ];

      mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1']);
      mockTxRepo.findByUserAndDateRange.mockResolvedValue(txs);
      mockUserRepo.findById.mockResolvedValue(baseUser);
      mockNotificationSender.sendMessage.mockResolvedValue(undefined);

      const result = await useCase.execute();

      expect(result).toEqual({ sent: 1, errors: 0 });
      expect(mockNotificationSender.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Tổng kết tháng'),
      );
    });

    it('should send zero-transaction message when user has no transactions', async () => {
      mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1']);
      mockTxRepo.findByUserAndDateRange.mockResolvedValue([]);
      mockUserRepo.findById.mockResolvedValue(baseUser);
      mockNotificationSender.sendMessage.mockResolvedValue(undefined);

      const result = await useCase.execute();

      expect(result).toEqual({ sent: 1, errors: 0 });
      expect(mockNotificationSender.sendMessage).toHaveBeenCalledWith(
        '12345',
        ZERO_TRANSACTIONS_MESSAGE,
      );
    });

    it('should isolate errors per user and continue processing', async () => {
      const user2: User = { ...baseUser, id: 'user-2', channelUserId: '67890' };

      mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1', 'user-2']);
      mockTxRepo.findByUserAndDateRange
        .mockRejectedValueOnce(new Error('DB timeout'))
        .mockResolvedValueOnce([]);
      mockUserRepo.findById.mockResolvedValue(user2);
      mockNotificationSender.sendMessage.mockResolvedValue(undefined);

      const result = await useCase.execute();

      expect(result).toEqual({ sent: 1, errors: 1 });
      expect(mockNotificationSender.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should return all zeros when no eligible users exist', async () => {
      mockPrefRepo.findEligibleUserIds.mockResolvedValue([]);

      const result = await useCase.execute();

      expect(result).toEqual({ sent: 0, errors: 0 });
      expect(mockTxRepo.findByUserAndDateRange).not.toHaveBeenCalled();
    });

    it('should count as error when notification delivery fails', async () => {
      mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1']);
      mockTxRepo.findByUserAndDateRange.mockResolvedValue([]);
      mockUserRepo.findById.mockResolvedValue(baseUser);
      mockNotificationSender.sendMessage.mockRejectedValue(new Error('Telegram API error'));

      const result = await useCase.execute();

      expect(result).toEqual({ sent: 0, errors: 1 });
    });
  });

  describe('getCompletedMonthRange', () => {
    it('should compute January range correctly', () => {
      const ref = new Date(2025, 0, 15); // January 15, 2025
      const { monthStart, monthEnd } = getCompletedMonthRange(ref);

      expect(monthStart.getFullYear()).toBe(2025);
      expect(monthStart.getMonth()).toBe(0);
      expect(monthStart.getDate()).toBe(1);
      expect(monthStart.getHours()).toBe(0);
      expect(monthStart.getMinutes()).toBe(0);
      expect(monthStart.getSeconds()).toBe(0);

      expect(monthEnd.getFullYear()).toBe(2025);
      expect(monthEnd.getMonth()).toBe(0);
      expect(monthEnd.getDate()).toBe(31);
      expect(monthEnd.getHours()).toBe(23);
      expect(monthEnd.getMinutes()).toBe(59);
      expect(monthEnd.getSeconds()).toBe(59);
    });

    it('should compute February range in a leap year', () => {
      const ref = new Date(2024, 1, 29); // February 29, 2024 (leap year)
      const { monthStart, monthEnd } = getCompletedMonthRange(ref);

      expect(monthStart.getDate()).toBe(1);
      expect(monthStart.getMonth()).toBe(1);
      expect(monthEnd.getDate()).toBe(29);
      expect(monthEnd.getMonth()).toBe(1);
    });

    it('should compute February range in a non-leap year', () => {
      const ref = new Date(2025, 1, 15); // February 15, 2025
      const { monthStart, monthEnd } = getCompletedMonthRange(ref);

      expect(monthEnd.getDate()).toBe(28);
      expect(monthEnd.getMonth()).toBe(1);
    });

    it('should compute December range correctly', () => {
      const ref = new Date(2025, 11, 31); // December 31, 2025
      const { monthStart, monthEnd } = getCompletedMonthRange(ref);

      expect(monthStart.getMonth()).toBe(11);
      expect(monthStart.getDate()).toBe(1);
      expect(monthEnd.getMonth()).toBe(11);
      expect(monthEnd.getDate()).toBe(31);
    });
  });

  describe('formatSummary', () => {
    it('should return zero-transaction message for empty array', () => {
      const result = formatSummary([]);
      expect(result).toBe(ZERO_TRANSACTIONS_MESSAGE);
    });

    it('should include total expenses and transaction count', () => {
      const txs: Transaction[] = [
        { id: 'tx-1', userId: 'u1', amount: 100000, category: 'ăn uống', note: 'test' },
        { id: 'tx-2', userId: 'u1', amount: 50000, category: 'di chuyển', note: 'test' },
      ];

      const result = formatSummary(txs);

      expect(result).toContain('Tổng chi: ' + formatVND(150000));
      expect(result).toContain('Số giao dịch: 2');
    });

    it('should include income when negative amounts are present', () => {
      const txs: Transaction[] = [
        { id: 'tx-1', userId: 'u1', amount: 100000, category: 'ăn uống', note: 'test' },
        { id: 'tx-2', userId: 'u1', amount: -5000000, category: 'lương', note: 'lương tháng' },
      ];

      const result = formatSummary(txs);

      expect(result).toContain('Tổng chi: ' + formatVND(100000));
      expect(result).toContain('Tổng thu: ' + formatVND(5000000));
    });

    it('should not include income line when no income transactions', () => {
      const txs: Transaction[] = [
        { id: 'tx-1', userId: 'u1', amount: 100000, category: 'ăn uống', note: 'test' },
      ];

      const result = formatSummary(txs);

      expect(result).not.toContain('Tổng thu');
    });

    it('should sort categories by amount descending', () => {
      const txs: Transaction[] = [
        { id: 'tx-1', userId: 'u1', amount: 50000, category: 'di chuyển', note: 'test' },
        { id: 'tx-2', userId: 'u1', amount: 200000, category: 'ăn uống', note: 'test' },
        { id: 'tx-3', userId: 'u1', amount: 100000, category: 'giải trí', note: 'test' },
      ];

      const result = formatSummary(txs);

      const lines = result.split('\n');
      const catLines = lines.filter((l) => l.includes('•'));

      expect(catLines[0]).toContain('ăn uống');
      expect(catLines[1]).toContain('giải trí');
      expect(catLines[2]).toContain('di chuyển');
    });

    it('should include budget comparison when budgetLimits are provided', () => {
      const txs: Transaction[] = [
        { id: 'tx-1', userId: 'u1', amount: 300000, category: 'ăn uống', note: 'test' },
        { id: 'tx-2', userId: 'u1', amount: 50000, category: 'di chuyển', note: 'test' },
      ];
      const budgets: BudgetLimit[] = [
        { category: 'ăn uống', limit: 200000 },
        { category: 'di chuyển', limit: 100000 },
      ];

      const result = formatSummary(txs, budgets);

      expect(result).toContain('So sánh ngân sách');
      expect(result).toContain('ăn uống: ⚠️ Vượt ' + formatVND(100000));
      expect(result).toContain('di chuyển: ✅ Còn ' + formatVND(50000));
    });

    it('should omit budget section when budgetLimits is undefined', () => {
      const txs: Transaction[] = [
        { id: 'tx-1', userId: 'u1', amount: 100000, category: 'ăn uống', note: 'test' },
      ];

      const result = formatSummary(txs, undefined);

      expect(result).not.toContain('So sánh ngân sách');
    });

    it('should omit budget section when budgetLimits is empty array', () => {
      const txs: Transaction[] = [
        { id: 'tx-1', userId: 'u1', amount: 100000, category: 'ăn uống', note: 'test' },
      ];

      const result = formatSummary(txs, []);

      expect(result).not.toContain('So sánh ngân sách');
    });
  });
});
