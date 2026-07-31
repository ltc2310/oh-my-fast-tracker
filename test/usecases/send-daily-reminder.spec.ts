import { SendDailyReminder } from '../../src/application/usecases/SendDailyReminder';
import { NotificationPreferenceRepository } from '../../src/domain/ports/NotificationPreferenceRepository';
import { TransactionRepository } from '../../src/domain/ports/TransactionRepository';
import { UserRepository } from '../../src/domain/ports/UserRepository';
import { NotificationSender } from '../../src/domain/ports/NotificationSender';
import { User } from '../../src/domain/entities/User';
import { Transaction } from '../../src/domain/entities/Transaction';

describe('SendDailyReminder', () => {
  let useCase: SendDailyReminder;
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
    useCase = new SendDailyReminder(
      mockPrefRepo,
      mockTxRepo,
      mockUserRepo,
      mockNotificationSender,
    );
  });

  it('should send reminder to user with zero transactions today', async () => {
    mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1']);
    mockTxRepo.findByUserAndDateRange.mockResolvedValue([]);
    mockUserRepo.findById.mockResolvedValue(baseUser);
    mockNotificationSender.sendMessage.mockResolvedValue(undefined);

    const result = await useCase.execute();

    expect(result).toEqual({ sent: 1, skipped: 0, errors: 0 });
    expect(mockNotificationSender.sendMessage).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('Hôm nay bạn chưa ghi chi tiêu nào'),
    );
  });

  it('should skip user who has transactions today', async () => {
    const tx: Transaction = {
      id: 'tx-1',
      userId: 'user-1',
      amount: 50000,
      category: 'ăn uống',
      note: 'ăn trưa',
      spentAt: new Date(),
    };
    mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1']);
    mockTxRepo.findByUserAndDateRange.mockResolvedValue([tx]);

    const result = await useCase.execute();

    expect(result).toEqual({ sent: 0, skipped: 1, errors: 0 });
    expect(mockNotificationSender.sendMessage).not.toHaveBeenCalled();
  });

  it('should handle multiple users with mixed transaction states', async () => {
    const user2: User = { ...baseUser, id: 'user-2', channelUserId: '67890' };
    const tx: Transaction = {
      id: 'tx-1',
      userId: 'user-1',
      amount: 50000,
      category: 'ăn uống',
      note: 'ăn trưa',
      spentAt: new Date(),
    };

    mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1', 'user-2']);
    mockTxRepo.findByUserAndDateRange
      .mockResolvedValueOnce([tx])   // user-1 has transactions
      .mockResolvedValueOnce([]);     // user-2 has none
    mockUserRepo.findById.mockResolvedValue(user2);
    mockNotificationSender.sendMessage.mockResolvedValue(undefined);

    const result = await useCase.execute();

    expect(result).toEqual({ sent: 1, skipped: 1, errors: 0 });
    expect(mockNotificationSender.sendMessage).toHaveBeenCalledWith(
      '67890',
      expect.stringContaining('Hôm nay bạn chưa ghi chi tiêu nào'),
    );
  });

  it('should isolate errors per user and continue processing', async () => {
    const user2: User = { ...baseUser, id: 'user-2', channelUserId: '67890' };

    mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1', 'user-2']);
    mockTxRepo.findByUserAndDateRange
      .mockRejectedValueOnce(new Error('DB timeout'))  // user-1 fails
      .mockResolvedValueOnce([]);                       // user-2 succeeds
    mockUserRepo.findById.mockResolvedValue(user2);
    mockNotificationSender.sendMessage.mockResolvedValue(undefined);

    const result = await useCase.execute();

    expect(result).toEqual({ sent: 1, skipped: 0, errors: 1 });
    expect(mockNotificationSender.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('should return all zeros when no eligible users exist', async () => {
    mockPrefRepo.findEligibleUserIds.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual({ sent: 0, skipped: 0, errors: 0 });
    expect(mockTxRepo.findByUserAndDateRange).not.toHaveBeenCalled();
    expect(mockNotificationSender.sendMessage).not.toHaveBeenCalled();
  });

  it('should count as error when notification delivery fails', async () => {
    mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1']);
    mockTxRepo.findByUserAndDateRange.mockResolvedValue([]);
    mockUserRepo.findById.mockResolvedValue(baseUser);
    mockNotificationSender.sendMessage.mockRejectedValue(new Error('Telegram API error'));

    const result = await useCase.execute();

    expect(result).toEqual({ sent: 0, skipped: 0, errors: 1 });
  });

  it('should query date range for current day (start of day to start of next day)', async () => {
    mockPrefRepo.findEligibleUserIds.mockResolvedValue(['user-1']);
    mockTxRepo.findByUserAndDateRange.mockResolvedValue([]);
    mockUserRepo.findById.mockResolvedValue(baseUser);
    mockNotificationSender.sendMessage.mockResolvedValue(undefined);

    await useCase.execute();

    const [, from, to] = mockTxRepo.findByUserAndDateRange.mock.calls[0];
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(from.getSeconds()).toBe(0);
    // 'to' should be exactly 24 hours after 'from'
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(to.getHours()).toBe(0);
    expect(to.getMinutes()).toBe(0);
    expect(to.getSeconds()).toBe(0);
  });
});
