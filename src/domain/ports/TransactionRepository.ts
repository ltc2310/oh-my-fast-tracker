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
}


