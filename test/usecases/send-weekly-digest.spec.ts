import { SendWeeklyDigest, getWeekRanges, formatDigest } from '../../src/application/usecases/SendWeeklyDigest';
import { NotificationPreferenceRepository } from '../../src/domain/ports/NotificationPreferenceRepository';
import { TransactionRepository } from '../../src/domain/ports/TransactionRepository';
import { UserRepository } from '../../src/domain/ports/UserRepository';
import { NotificationSender } from '../../src/domain/ports/NotificationSender';
import { Transaction } from '../../src/domain/entities/Transaction';
import { User } from '../../src/domain/entities/User';

describe('SendWeeklyDigest', () => {
  let useCase: SendWeeklyDigest;
  let mockPrefRepo: jest.Mocked<NotificationPreferenceRepository>;
  let mockTxRepo: jest.Mocked<TransactionRepository>;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockNotificationSender: jest.Mocked<NotificationSender>;

  const baseUser: User = {
    id: 'user-1',
    channel: 'telegram',
    channelUserId: 'tg-123',
    accessStatus: 'whitelisted',
    plan: 'free',
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

    useCase = new SendWeeklyDigest(
      mockPrefRepo,
      mockTxRepo,
      mockUserRepo,
      mockNotificationSender,
    );
  });

  describe('execute', () => {
    it('should send digest to eligible users with transactions', async () => {
      mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1']);
      mockTxRepo.findByUserAndDateRange
        .mockResolvedValueOnce([
          { userId: 'user-1', amount: 100000, category: 'ăn uống', note: 'cơm' },
        ] as Transaction[])
        .mockResolvedValueOnce([]); // prev week empty
      mockUserRepo.findById.mockResolvedValue(baseUser);
      mockNotificationSender.sendMessage.mockResolvedValue(undefined);

      const result = await useCase.execute();

      expect(result.sent).toBe(1);
      expect(result.errors).toBe(0);
      expect(mockNotificationSender.sendMessage).toHaveBeenCalledWith(
        'tg-123',
        expect.stringContaining('Tổng chi'),
      );
    });

    it('should send zero-transaction message when user has no expenses', async () => {
      mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1']);
      mockTxRepo.findByUserAndDateRange.mockResolvedValue([]);
      mockUserRepo.findById.mockResolvedValue(baseUser);
      mockNotificationSender.sendMessage.mockResolvedValue(undefined);

      const result = await useCase.execute();

      expect(result.sent).toBe(1);
      expect(mockNotificationSender.sendMessage).toHaveBeenCalledWith(
        'tg-123',
        expect.stringContaining('Tuần này bạn chưa ghi khoản chi tiêu nào'),
      );
    });

    it('should isolate errors per user and continue processing', async () => {
      mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1', 'user-2']);
      mockTxRepo.findByUserAndDateRange
        .mockRejectedValueOnce(new Error('DB error')) // user-1 fails
        .mockResolvedValueOnce([
          { userId: 'user-2', amount: 50000, category: 'grab', note: '' },
        ] as Transaction[])
        .mockResolvedValueOnce([]); // prev week for user-2
      mockUserRepo.findById.mockResolvedValue({ ...baseUser, id: 'user-2', channelUserId: 'tg-456' });
      mockNotificationSender.sendMessage.mockResolvedValue(undefined);

      const result = await useCase.execute();

      expect(result.errors).toBe(1);
      expect(result.sent).toBe(1);
    });

    it('should skip user when userRepo.findById returns null', async () => {
      mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1']);
      mockTxRepo.findByUserAndDateRange.mockResolvedValue([
        { userId: 'user-1', amount: 50000, category: 'grab', note: '' },
      ] as Transaction[]);
      mockUserRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute();

      expect(result.sent).toBe(0);
      expect(result.errors).toBe(0);
      expect(mockNotificationSender.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('getWeekRanges', () => {
    it('should compute Mon–Sun range for a Sunday reference date', () => {
      // Sunday 2025-01-12
      const sunday = new Date(2025, 0, 12, 20, 0, 0);
      const ranges = getWeekRanges(sunday);

      expect(ranges.currentWeekStart.getDay()).toBe(1); // Monday
      expect(ranges.currentWeekStart.getDate()).toBe(6); // Jan 6
      expect(ranges.currentWeekStart.getHours()).toBe(0);

      expect(ranges.currentWeekEnd.getDay()).toBe(0); // Sunday
      expect(ranges.currentWeekEnd.getDate()).toBe(12); // Jan 12
      expect(ranges.currentWeekEnd.getHours()).toBe(23);
      expect(ranges.currentWeekEnd.getMinutes()).toBe(59);
    });

    it('should compute previous week as 7 days before current week', () => {
      const sunday = new Date(2025, 0, 12, 20, 0, 0);
      const ranges = getWeekRanges(sunday);

      expect(ranges.prevWeekStart.getDay()).toBe(1); // Monday
      expect(ranges.prevWeekStart.getDate()).toBe(30); // Dec 30
      expect(ranges.prevWeekStart.getMonth()).toBe(11); // December (0-indexed)

      expect(ranges.prevWeekEnd.getDay()).toBe(0); // Sunday
      expect(ranges.prevWeekEnd.getDate()).toBe(5); // Jan 5
      expect(ranges.prevWeekEnd.getHours()).toBe(23);
    });

    it('should handle Wednesday as reference date', () => {
      // Wednesday 2025-01-08
      const wednesday = new Date(2025, 0, 8, 14, 30, 0);
      const ranges = getWeekRanges(wednesday);

      expect(ranges.currentWeekStart.getDate()).toBe(6); // Monday Jan 6
      expect(ranges.currentWeekEnd.getDate()).toBe(12); // Sunday Jan 12
    });

    it('should handle Monday as reference date', () => {
      // Monday 2025-01-06
      const monday = new Date(2025, 0, 6, 8, 0, 0);
      const ranges = getWeekRanges(monday);

      expect(ranges.currentWeekStart.getDate()).toBe(6); // Monday Jan 6
      expect(ranges.currentWeekEnd.getDate()).toBe(12); // Sunday Jan 12
    });
  });

  describe('formatDigest', () => {
    it('should return zero-transaction message when no expenses exist', () => {
      const result = formatDigest([], []);
      expect(result).toBe(
        '📊 Tuần này bạn chưa ghi khoản chi tiêu nào. Hãy bắt đầu ghi lại chi tiêu để theo dõi tài chính nhé!',
      );
    });

    it('should return zero-transaction message when only income exists (no expenses)', () => {
      const txs: Transaction[] = [
        { userId: 'u1', amount: -5000000, category: 'lương', note: 'salary' },
      ];
      const result = formatDigest(txs, []);
      expect(result).toBe(
        '📊 Tuần này bạn chưa ghi khoản chi tiêu nào. Hãy bắt đầu ghi lại chi tiêu để theo dõi tài chính nhé!',
      );
    });

    it('should include total and top 3 categories', () => {
      const currentTxs: Transaction[] = [
        { userId: 'u1', amount: 100000, category: 'ăn uống', note: '' },
        { userId: 'u1', amount: 80000, category: 'grab', note: '' },
        { userId: 'u1', amount: 50000, category: 'cà phê', note: '' },
        { userId: 'u1', amount: 30000, category: 'khác', note: '' },
      ];

      const result = formatDigest(currentTxs, []);

      expect(result).toContain('260.000 ₫');
      expect(result).toContain('ăn uống');
      expect(result).toContain('grab');
      expect(result).toContain('cà phê');
      // 4th category should not be in top 3
      expect(result).not.toContain('khác');
    });

    it('should show increase percentage when current > previous', () => {
      const currentTxs: Transaction[] = [
        { userId: 'u1', amount: 200000, category: 'ăn uống', note: '' },
      ];
      const prevTxs: Transaction[] = [
        { userId: 'u1', amount: 100000, category: 'ăn uống', note: '' },
      ];

      const result = formatDigest(currentTxs, prevTxs);

      expect(result).toContain('📈 Tăng 100% so với tuần trước');
    });

    it('should show decrease percentage when current < previous', () => {
      const currentTxs: Transaction[] = [
        { userId: 'u1', amount: 50000, category: 'ăn uống', note: '' },
      ];
      const prevTxs: Transaction[] = [
        { userId: 'u1', amount: 100000, category: 'ăn uống', note: '' },
      ];

      const result = formatDigest(currentTxs, prevTxs);

      expect(result).toContain('📉 Giảm 50% so với tuần trước');
    });

    it('should show decrease 0% when current equals previous', () => {
      const currentTxs: Transaction[] = [
        { userId: 'u1', amount: 100000, category: 'ăn uống', note: '' },
      ];
      const prevTxs: Transaction[] = [
        { userId: 'u1', amount: 100000, category: 'ăn uống', note: '' },
      ];

      const result = formatDigest(currentTxs, prevTxs);

      expect(result).toContain('📉 Giảm 0% so với tuần trước');
    });

    it('should omit comparison when previous week has zero expenses', () => {
      const currentTxs: Transaction[] = [
        { userId: 'u1', amount: 150000, category: 'ăn uống', note: '' },
      ];
      const prevTxs: Transaction[] = []; // no previous week data

      const result = formatDigest(currentTxs, prevTxs);

      expect(result).toContain('150.000 ₫');
      expect(result).not.toContain('so với tuần trước');
      expect(result).not.toContain('📈');
      expect(result).not.toContain('📉');
    });

    it('should omit comparison when previous week only has income (no expenses)', () => {
      const currentTxs: Transaction[] = [
        { userId: 'u1', amount: 100000, category: 'ăn uống', note: '' },
      ];
      const prevTxs: Transaction[] = [
        { userId: 'u1', amount: -3000000, category: 'lương', note: '' },
      ];

      const result = formatDigest(currentTxs, prevTxs);

      expect(result).not.toContain('so với tuần trước');
    });
  });
});
