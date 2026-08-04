import { Injectable, Inject } from "@nestjs/common";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { Transaction } from "../../domain/entities/Transaction";

export interface ListTransactionsParams {
  /** If provided, filter by date range. */
  from?: Date;
  to?: Date;
  /** If provided (without from/to), return the N most recent transactions. */
  limit?: number;
}

export interface ListTransactionsResult {
  transactions: Transaction[];
  total: number;
  totalIncome: number;
  hasMore: boolean;
}

const MAX_DISPLAY = 10;

/**
 * Lists transactions for a user, either by date range or most recent N.
 * Returns at most MAX_DISPLAY items; sets hasMore=true if truncated.
 */
@Injectable()
export class ListTransactions {
  constructor(
    @Inject("TransactionRepository")
    private readonly repository: TransactionRepository,
  ) {}

  async execute(
    userId: string,
    params: ListTransactionsParams,
  ): Promise<ListTransactionsResult> {
    let transactions: Transaction[];

    if (params.from && params.to) {
      transactions = await this.repository.findByUserAndDateRange(
        userId,
        params.from,
        params.to,
      );
    } else {
      const limit = params.limit ?? MAX_DISPLAY;
      // Fetch one extra to detect "hasMore"
      transactions = await this.repository.findRecentByUser(userId, limit + 1);
    }

    // Compute totals from full result set
    let total = 0;
    let totalIncome = 0;
    for (const t of transactions) {
      if (t.amount > 0) {
        total += t.amount;
      } else {
        totalIncome += Math.abs(t.amount);
      }
    }

    const requestedLimit = params.limit ?? MAX_DISPLAY;
    const hasMore = transactions.length > requestedLimit;

    // Truncate to display limit
    const displayTransactions = transactions.slice(0, Math.min(requestedLimit, MAX_DISPLAY));

    return {
      transactions: displayTransactions,
      total,
      totalIncome,
      hasMore,
    };
  }
}
