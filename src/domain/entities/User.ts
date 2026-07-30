/** Represents the access control status of a user. */
export type AccessStatus = 'pending' | 'whitelisted' | 'blocked';

/** Represents the subscription tier of a user. */
export type SubscriptionPlan = 'free' | 'pro' | 'max';

export interface User {
  id?: string;
  channel: string;
  channelUserId: string;
  channelUsername?: string | null;
  accessStatus: AccessStatus;
  plan: SubscriptionPlan;
  /** When the user was approved for access. */
  whitelistedAt?: Date | null;
  /** When the user's plan was last changed. */
  planUpdatedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}
