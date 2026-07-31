// Feature: proactive-notifications, Property 2: Daily Reminder Conditional
// Validates: Requirements 2.2, 2.3

import * as fc from 'fast-check';
import { SendDailyReminder } from '../../src/application/usecases/SendDailyReminder';
import { NotificationPreferenceRepository } from '../../src/domain/ports/NotificationPreferenceRepository';
import { TransactionRepository } from '../../src/domain/ports/TransactionRepository';
import { UserRepository } from '../../src/domain/ports/UserRepository';
import { NotificationSender } from '../../src/domain/ports/NotificationSender';
import { Transaction } from '../../src/domain/entities/Transaction';
import { User } from '../../src/domain/entities/User';

describe('Property 2: Daily Reminder Conditional', () => {
  /**
   * **Validates: Requirements 2.2, 2.3**
   *
   * For any set of eligible users, each with a random number of transactions today:
   * - A reminder is sent if and only if the user has zero transactions
   * - No reminder is sent for users with one or more transactions
   */
  it('sends reminder iff user has zero transactions today', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-10 users, each with 0-5 transactions
        fc.array(
          fc.record({
            userId: fc.uuid(),
            channelUserId: fc.string({ minLength: 5, maxLength: 20 }),
            transactionCount: fc.nat({ max: 5 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        async (userScenarios) => {
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

          // All users are eligible (returned by findEligibleUserIds)
          const eligibleUserIds = userScenarios.map((s) => s.userId);
          mockPrefRepo.findEligibleUserIds.mockResolvedValue(eligibleUserIds);

          // For each user, return the appropriate number of transactions
          for (const scenario of userScenarios) {
            const transactions: Transaction[] = Array.from(
              { length: scenario.transactionCount },
              (_, i) => ({
                id: `tx-${scenario.userId}-${i}`,
                userId: scenario.userId,
                amount: 50000,
                category: 'ăn uống',
                note: 'test',
                spentAt: new Date(),
              }),
            );
            mockTxRepo.findByUserAndDateRange.mockResolvedValueOnce(transactions);

            // Only set up user lookup for users with 0 transactions (those who will get reminders)
            if (scenario.transactionCount === 0) {
              const user: User = {
                id: scenario.userId,
                channel: 'telegram',
                channelUserId: scenario.channelUserId,
                channelUsername: null,
                accessStatus: 'whitelisted',
                plan: 'free',
                whitelistedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              mockUserRepo.findById.mockResolvedValueOnce(user);
            }
          }

          const useCase = new SendDailyReminder(
            mockPrefRepo,
            mockTxRepo,
            mockUserRepo,
            mockNotificationSender,
          );

          const result = await useCase.execute();

          // Compute expected outcomes
          const usersWithZeroTx = userScenarios.filter(
            (s) => s.transactionCount === 0,
          );
          const usersWithTx = userScenarios.filter(
            (s) => s.transactionCount > 0,
          );

          // Property: sent count equals users with zero transactions
          expect(result.sent).toBe(usersWithZeroTx.length);

          // Property: skipped count equals users with transactions
          expect(result.skipped).toBe(usersWithTx.length);

          // Property: sendMessage called exactly for users with 0 transactions
          expect(mockNotificationSender.sendMessage).toHaveBeenCalledTimes(
            usersWithZeroTx.length,
          );

          // Property: each user with 0 transactions received the reminder
          for (const scenario of usersWithZeroTx) {
            expect(mockNotificationSender.sendMessage).toHaveBeenCalledWith(
              scenario.channelUserId,
              expect.stringContaining('Hôm nay bạn chưa ghi chi tiêu nào'),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
