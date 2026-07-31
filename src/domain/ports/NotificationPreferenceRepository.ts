import { NotificationPreference } from '../entities/NotificationPreference';

export interface NotificationPreferenceRepository {
  /** Find preference for a user. Returns null if no record exists. */
  findByUserId(userId: string): Promise<NotificationPreference | null>;

  /** Create or update preference for a user (upsert on user_id). */
  upsert(
    userId: string,
    fields: Partial<Pick<NotificationPreference, 'dailyReminder' | 'weeklyDigest' | 'monthlySummary'>>,
  ): Promise<NotificationPreference>;

  /**
   * Find all users with a specific notification type enabled.
   * Returns user IDs (joined with users table where access_status = 'whitelisted').
   */
  findEligibleUserIds(
    notificationType: 'dailyReminder' | 'weeklyDigest' | 'monthlySummary',
  ): Promise<string[]>;

  /** Create default preference (all enabled) for a user. */
  createDefault(userId: string): Promise<NotificationPreference>;
}
