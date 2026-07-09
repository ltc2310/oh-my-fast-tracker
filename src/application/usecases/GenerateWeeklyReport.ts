import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { WeeklySummary } from "../../domain/entities/WeeklySummary";

export class GenerateWeeklyReport {
  constructor(private readonly repository: TransactionRepository) { }

  async execute(userId: string): Promise<WeeklySummary> {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 7);

    const transactions = await this.repository.findByUserAndDateRange(
      userId,
      from,
      to
    );

    const totalsByCategory = new Map<string, number>();
    let total = 0;

    for (const t of transactions) {
      total += t.amount;
      totalsByCategory.set(
        t.category,
        (totalsByCategory.get(t.category) ?? 0) + t.amount
      );
    }

    const byCategory = Array.from(totalsByCategory.entries()).map(
      ([category, sum]) => ({ category, total: sum })
    );

    return { total, byCategory, transactions, from, to };
  }
}
