import { Transaction } from "../entities/Transaction";

export interface TransactionRepository {
  save(transaction: Transaction): Promise<Transaction>;
  findByUserAndDateRange(
    userId: string,
    from: Date,
    to: Date
  ): Promise<Transaction[]>;
  /** Distinct list of every user who has at least one transaction. */
  findDistinctUserIds(): Promise<string[]>;
  /** Find a transaction by its ID. Returns null if not found. */
  findById(id: string): Promise<Transaction | null>;
  /** Find the most recently created transaction for a user. Returns null if none. */
  findLastByUser(userId: string): Promise<Transaction | null>;
  /** Find the N most recent transactions for a user, ordered by spent_at desc. */
  findRecentByUser(userId: string, limit: number): Promise<Transaction[]>;
  /** Find recent transactions matching a keyword in note or category (case-insensitive partial match). */
  findByUserAndKeyword(userId: string, keyword: string, limit?: number): Promise<Transaction[]>;
  /** Update specific fields of a transaction. Returns the updated transaction. */
  update(id: string, fields: Partial<Pick<Transaction, 'amount' | 'category' | 'note' | 'spentAt'>>): Promise<Transaction>;
  /** Delete a transaction by ID. Returns true if deleted, false if not found. */
  deleteById(id: string): Promise<boolean>;
}
