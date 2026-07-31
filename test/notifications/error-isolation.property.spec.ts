// Feature: proactive-notifications, Property 1: Error Isolation
// **Validates: Requirements 1.8, 2.6, 3.7, 4.9**

import * as fc from 'fast-check';
import { SendDailyReminder } from '../../src/application/usecases/SendDailyReminder';
import { SendWeeklyDigest } from '../../src/application/usecases/SendWeeklyDigest';
import { SendMonthlySummary } from '../../src/application/usecases/SendMonthlySummary';
import { NotificationPreferenceRepository } from '../../src/domain/ports/NotificationPreferenceRepository';
import { TransactionRepository } from '../../src/domain/ports/TransactionRepository';
import { UserRepository } from '../../src/domain/ports/UserRepository';
import { NotificationSender } from '../../src/domain/ports/NotificationSender';
import { User } from '../../src/domain/entities/User';

function createMocks() {
  const mockPrefRepo: jest.Mocked<NotificationPreferenceRepository> = {
    findByUserId: jest.fn(),
    upsert: jest.fn(),
    findEligibleUserIds: jest.fn(),
    createDefault: jest.fn(),
  };
  const mockTxRepo: jest.Mocked<TransactionRepository> = {
    save: jest.fn(),
    findByUserAndDateRange: jest.fn(),
    findDistinctUserIds: jest.fn(),
    findById: jest.fn(),
    findLastByUser: jest.fn(),
    update: jest.fn(),
    deleteById: jest.fn(),
  };
  const mockUserRepo: jest.Mocked<UserRepository> = {
    findByChannelAndUserId: jest.fn(),
    create: jest.fn(),
    updateAccessStatus: jest.fn(),
    findById: jest.fn(),
    findByStatus: jest.fn(),
  };
  const mockNotificationSender: jest.Mocked<NotificationSender> = {
    sendMessage: jest.fn(),
  };
  return { mockPrefRepo, mockTxRepo, mockUserRepo, mockNotificationSender };
}

function makeUser(userId: string): User {
  return {
    id: userId,
    channel: 'telegram',
    channelUserId: `channel-${userId}`,
    channelUsername: `user-${userId}`,
    accessStatus: 'whitelisted',
    plan: 'free',
    whitelistedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };
}

describe('Property 1: Error Isolation', () => {
  // Arbitrary: generate a list of 1-10 user IDs and a subset of failure indices
  const userListAndFailures = fc
    .integer({ min: 1, max: 10 })
    .chain((n) => {
      const userIds = fc.constant(
        Array.from({ length: n }, (_, i) => `user-${i}`),
      );
      // Generate a unique sorted array of failure indices in [0, n)
      const failureIndices = fc.uniqueArray(fc.integer({ min: 0, max: n - 1 }), {
        minLength: 0,
        maxLength: n,
      });
      return fc.tuple(userIds, failureIndices);
    });

  it('SendDailyReminder: all non-failing users are processed even when some fail', async () => {
    await fc.assert(
      fc.asyncProperty(userListAndFailures, async ([userIds, failureIndices]) => {
        const { mockPrefRepo, mockTxRepo, mockUserRepo, mockNotificationSender } =
          createMocks();

        const failureSet = new Set(failureIndices);

        // All users are eligible
        mockPrefRepo.findEligibleUserIds.mockResolvedValue(userIds);

        // All users have zero transactions (so all should get reminders)
        mockTxRepo.findByUserAndDateRange.mockResolvedValue([]);

        // findById returns the user object
        mockUserRepo.findById.mockImplementation(async (userId: string) =>
          makeUser(userId),
        );

        // sendMessage throws for users at failure indices, resolves for others
        mockNotificationSender.sendMessage.mockImplementation(
          async (channelUserId: string) => {
            const idx = userIds.findIndex(
              (uid) => `channel-${uid}` === channelUserId,
            );
            if (failureSet.has(idx)) {
              throw new Error(`Simulated failure for index ${idx}`);
            }
          },
        );

        const result = await (
          new SendDailyReminder(
            mockPrefRepo,
            mockTxRepo,
            mockUserRepo,
            mockNotificationSender,
          )
        ).execute();

        // sendMessage was called for ALL users (no short-circuiting)
        expect(mockNotificationSender.sendMessage).toHaveBeenCalledTimes(
          userIds.length,
        );

        // Errors count matches failure count
        expect(result.errors).toBe(failureIndices.length);

        // Sent count matches non-failing users
        expect(result.sent).toBe(userIds.length - failureIndices.length);
      }),
      { numRuns: 100 },
    );
  });

  it('SendWeeklyDigest: all non-failing users are processed even when some fail', async () => {
    await fc.assert(
      fc.asyncProperty(userListAndFailures, async ([userIds, failureIndices]) => {
        const { mockPrefRepo, mockTxRepo, mockUserRepo, mockNotificationSender } =
          createMocks();

        const failureSet = new Set(failureIndices);

        mockPrefRepo.findEligibleUserIds.mockResolvedValue(userIds);

        // Return empty transactions so formatDigest produces a known message
        mockTxRepo.findByUserAndDateRange.mockResolvedValue([]);

        mockUserRepo.findById.mockImplementation(async (userId: string) =>
          makeUser(userId),
        );

        mockNotificationSender.sendMessage.mockImplementation(
          async (channelUserId: string) => {
            const idx = userIds.findIndex(
              (uid) => `channel-${uid}` === channelUserId,
            );
            if (failureSet.has(idx)) {
              throw new Error(`Simulated failure for index ${idx}`);
            }
          },
        );

        const result = await (
          new SendWeeklyDigest(
            mockPrefRepo,
            mockTxRepo,
            mockUserRepo,
            mockNotificationSender,
          )
        ).execute();

        // sendMessage was called for ALL users
        expect(mockNotificationSender.sendMessage).toHaveBeenCalledTimes(
          userIds.length,
        );

        // Error count matches
        expect(result.errors).toBe(failureIndices.length);

        // Sent count matches non-failing
        expect(result.sent).toBe(userIds.length - failureIndices.length);
      }),
      { numRuns: 100 },
    );
  });

  it('SendMonthlySummary: all non-failing users are processed even when some fail', async () => {
    await fc.assert(
      fc.asyncProperty(userListAndFailures, async ([userIds, failureIndices]) => {
        const { mockPrefRepo, mockTxRepo, mockUserRepo, mockNotificationSender } =
          createMocks();

        const failureSet = new Set(failureIndices);

        mockPrefRepo.findEligibleUserIds.mockResolvedValue(userIds);

        // Return empty transactions
        mockTxRepo.findByUserAndDateRange.mockResolvedValue([]);

        mockUserRepo.findById.mockImplementation(async (userId: string) =>
          makeUser(userId),
        );

        mockNotificationSender.sendMessage.mockImplementation(
          async (channelUserId: string) => {
            const idx = userIds.findIndex(
              (uid) => `channel-${uid}` === channelUserId,
            );
            if (failureSet.has(idx)) {
              throw new Error(`Simulated failure for index ${idx}`);
            }
          },
        );

        const result = await (
          new SendMonthlySummary(
            mockPrefRepo,
            mockTxRepo,
            mockUserRepo,
            mockNotificationSender,
          )
        ).execute();

        // sendMessage was called for ALL users
        expect(mockNotificationSender.sendMessage).toHaveBeenCalledTimes(
          userIds.length,
        );

        // Error count matches
        expect(result.errors).toBe(failureIndices.length);

        // Sent count matches non-failing
        expect(result.sent).toBe(userIds.length - failureIndices.length);
      }),
      { numRuns: 100 },
    );
  });
});
