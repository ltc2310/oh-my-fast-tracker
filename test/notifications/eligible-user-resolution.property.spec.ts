// Feature: proactive-notifications, Property 3: Eligible User Resolution
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5

import * as fc from 'fast-check';
import { AccessStatus } from '../../src/domain/entities/User';
import { NotificationPreference } from '../../src/domain/entities/NotificationPreference';

/**
 * Pure function implementing the eligible user resolution logic.
 *
 * A user is eligible to receive notification type T if and only if:
 * 1. Their access_status is 'whitelisted', AND
 * 2. Either (a) their preference record has T set to true,
 *    or (b) they have no preference record at all (default opt-in)
 */
function isEligible(
  accessStatus: AccessStatus,
  preference: Pick<NotificationPreference, 'dailyReminder' | 'weeklyDigest' | 'monthlySummary'> | null,
  notificationType: 'dailyReminder' | 'weeklyDigest' | 'monthlySummary',
): boolean {
  if (accessStatus !== 'whitelisted') return false;
  if (preference === null) return true; // default opt-in
  return preference[notificationType] === true;
}

// Arbitraries
const accessStatusArb = fc.constantFrom<AccessStatus>('whitelisted', 'pending', 'blocked');
const notificationTypeArb = fc.constantFrom<'dailyReminder' | 'weeklyDigest' | 'monthlySummary'>(
  'dailyReminder',
  'weeklyDigest',
  'monthlySummary',
);
const preferenceArb = fc.oneof(
  fc.constant(null),
  fc.record({
    dailyReminder: fc.boolean(),
    weeklyDigest: fc.boolean(),
    monthlySummary: fc.boolean(),
  }),
);

describe('Property 3: Eligible User Resolution', () => {
  /**
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
   *
   * For any user and notification type T, the user is eligible iff:
   * - access_status === 'whitelisted' AND
   * - (preference is null OR preference[T] === true)
   */
  it('user is eligible iff whitelisted AND (no preference record OR preference[type] is true)', async () => {
    fc.assert(
      fc.property(
        accessStatusArb,
        preferenceArb,
        notificationTypeArb,
        (accessStatus, preference, notificationType) => {
          const result = isEligible(accessStatus, preference, notificationType);

          const expectedEligible =
            accessStatus === 'whitelisted' &&
            (preference === null || preference[notificationType] === true);

          expect(result).toBe(expectedEligible);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.1**
   *
   * Non-whitelisted users are never eligible, regardless of preferences.
   */
  it('non-whitelisted users are never eligible regardless of preferences', () => {
    const nonWhitelistedArb = fc.constantFrom<AccessStatus>('pending', 'blocked');

    fc.assert(
      fc.property(
        nonWhitelistedArb,
        preferenceArb,
        notificationTypeArb,
        (accessStatus, preference, notificationType) => {
          const result = isEligible(accessStatus, preference, notificationType);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.5**
   *
   * Whitelisted users with no preference record are eligible for all notification types.
   */
  it('whitelisted users with no preference record are eligible for all types', () => {
    fc.assert(
      fc.property(
        notificationTypeArb,
        (notificationType) => {
          const result = isEligible('whitelisted', null, notificationType);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.2, 7.3, 7.4**
   *
   * Whitelisted users with a preference record are eligible for type T iff preference[T] is true.
   */
  it('whitelisted users with preference are eligible iff preference[type] is true', () => {
    fc.assert(
      fc.property(
        fc.record({
          dailyReminder: fc.boolean(),
          weeklyDigest: fc.boolean(),
          monthlySummary: fc.boolean(),
        }),
        notificationTypeArb,
        (preference, notificationType) => {
          const result = isEligible('whitelisted', preference, notificationType);
          expect(result).toBe(preference[notificationType]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
