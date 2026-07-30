export interface Transaction {
  id?: string;
  userId: string;
  amount: number;
  category: string;
  note: string;
  /** The channel this transaction originated from (e.g., 'telegram'). */
  channel?: string;
  /** The actual date the money was spent (can be in the past). */
  spentAt?: Date;
  /** When the record was created in the system (always now). */
  createdAt?: Date;
}
