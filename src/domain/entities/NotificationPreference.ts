export interface NotificationPreference {
  id?: string;
  /** References users.id */
  userId: string;
  dailyReminder: boolean;
  weeklyDigest: boolean;
  monthlySummary: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
