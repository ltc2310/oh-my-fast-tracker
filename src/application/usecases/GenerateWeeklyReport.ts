import { Injectable, Inject } from "@nestjs/common";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { WeeklySummary } from "../../domain/entities/WeeklySummary";

export interface DateRange {
  from: Date;
  to: Date;
}

@Injectable()
export class GenerateWeeklyReport {
  constructor(
    @Inject("TransactionRepository") private readonly repository: TransactionRepository
  ) {}

  /**
   * Generate a report for a given date range.
   * If no range is provided, defaults to the last 7 days.
   */
  async execute(userId: string, range?: DateRange): Promise<WeeklySummary> {
    const to = range?.to ?? new Date();
    const from = range?.from ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d;
    })();

    const transactions = await this.repository.findByUserAndDateRange(userId, from, to);

    const totalsByCategory = new Map<string, number>();
    let total = 0;
    let totalIncome = 0;

    for (const t of transactions) {
      if (t.amount > 0) {
        // Expense
        total += t.amount;
        totalsByCategory.set(
          t.category,
          (totalsByCategory.get(t.category) ?? 0) + t.amount
        );
      } else {
        // Income (stored as negative)
        totalIncome += Math.abs(t.amount);
      }
    }

    const byCategory = Array.from(totalsByCategory.entries()).map(
      ([category, sum]) => ({ category, total: sum })
    );

    return { total, totalIncome, byCategory, transactions, from, to };
  }
}
