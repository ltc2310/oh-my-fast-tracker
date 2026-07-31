// Feature: proactive-notifications, Property 10: Default Opt-In for Missing Preferences
// Validates: Requirements 7.5

import * as fc from 'fast-check';
import { SendDailyReminder } from '../../src/application/usecases/SendDailyReminder';
import { NotificationPreferenceRepository } from '../../src/domain/ports/NotificationPreferenceRepository';
import { TransactionRepository } from '../../src/domain/ports/TransactionRepository';
import { UserRepository } from '../../src/domain/ports/UserRepository';
import { NotificationSender } from '../../src/domain/ports/NotificationSender';
import { User } from '../../src/domain/entities/User';

describe('Property 10: Default Opt-In for Missing Preferences', () => {
  /**
   * **Validates: Requirements 7.5**
   *
   * For any whitelisted user who has no record in the notification_preferences table,
   * the system shall treat them as having all three notification types enabled,
   * making them eligible for all notification jobs.
   *
   * We test this via SendDailyReminder: when findEligibleUserIds returns user IDs
   * (which includes users with no preference record per the DB function), all of
   * those users get processed and receive notifications (assuming 0 transactions).
   */
  it('users with no preference record are treated as all-enabled and receive notifications', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-10 whitelisted users with no preference records
        fc.array(
          fc.record({
            userId: fc.uuid(),
            channelUserId: fc.string({ minLength: 5, maxLength: 20 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        async (users) => {
          // Setup mocks
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
            sendMessage: jest.fn().mockResolvedValue(undefined),
          };

          // findEligibleUserIds returns ALL user IDs — simulating that the DB function
          // includes users with no preference record (default opt-in via LEFT JOIN IS NULL check)
          const eligibleUserIds = users.map((u) => u.userId);
          mockPrefRepo.findEligibleUserIds.mockResolvedValue(eligibleUserIds);

          // Each user has zero transactions today (so reminders will be sent)
          mockTxRepo.findByUserAndDateRange.mockResolvedValue([]);

          // Each user is found in the user repository (whitelisted)
          for (const u of users) {
            const user: User = {
              id: u.userId,
              channel: 'telegram',
              channelUserId: u.channelUserId,
              channelUsername: null,
              accessStatus: 'whitelisted',
              plan: 'free',
              whitelistedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockUserRepo.findById.mockResolvedValueOnce(user);
          }

          const useCase = new SendDailyReminder(
            mockPrefRepo,
            mockTxRepo,
            mockUserRepo,
            mockNotificationSender,
          );

          const result = await useCase.execute();

          // Property: ALL users received the notification (none were filtered out)
          expect(result.sent).toBe(users.length);

          // Property: No users were skipped (all have 0 transactions)
          expect(result.skipped).toBe(0);

          // Property: No errors occurred
          expect(result.errors).toBe(0);

          // Property: sendMessage was called for EVERY user in the eligible list
          expect(mockNotificationSender.sendMessage).toHaveBeenCalledTimes(
            users.length,
          );

          // Property: each user received a message at their channel ID
          for (const u of users) {
            expect(mockNotificationSender.sendMessage).toHaveBeenCalledWith(
              u.channelUserId,
              expect.stringContaining('Hôm nay bạn chưa ghi chi tiêu nào'),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
