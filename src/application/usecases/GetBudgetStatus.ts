import { Injectable, Inject } from "@nestjs/common";
import { BudgetLimitRepository } from "../../domain/ports/BudgetLimitRepository";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";

export interface CategoryBudgetStatus {
  category: string;
  monthlyLimit: number;
  spent: number;
  percentage: number;
  /** "ok" (<80%), "warning" (80-99%), "exceeded" (>=100%) */
  level: "ok" | "warning" | "exceeded";
}

export interface BudgetStatusResult {
  statuses: CategoryBudgetStatus[];
  totalLimit: number;
  totalSpent: number;
}

@Injectable()
export class GetBudgetStatus {
  constructor(
    @Inject("BudgetLimitRepository")
    private readonly budgetRepo: BudgetLimitRepository,
    @Inject("TransactionRepository")
    private readonly transactionRepo: TransactionRepository,
  ) {}

  async execute(userId: string): Promise<BudgetStatusResult> {
    const limits = await this.budgetRepo.findByUser(userId);
    if (limits.length === 0) {
      return { statuses: [], totalLimit: 0, totalSpent: 0 };
    }

    // Get current month date range
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const monthEnd = now;

    const transactions = await this.transactionRepo.findByUserAndDateRange(
      userId,
      monthStart,
      monthEnd,
    );

    // Aggregate spending by category (expenses only)
    const spentByCategory = new Map<string, number>();
    for (const t of transactions) {
      if (t.amount > 0) {
        spentByCategory.set(
          t.category,
          (spentByCategory.get(t.category) ?? 0) + t.amount,
        );
      }
    }

    const statuses: CategoryBudgetStatus[] = limits.map((limit) => {
      const spent = spentByCategory.get(limit.category) ?? 0;
      const percentage = limit.monthlyLimit > 0 ? (spent / limit.monthlyLimit) * 100 : 0;

      let level: "ok" | "warning" | "exceeded";
      if (percentage >= 100) {
        level = "exceeded";
      } else if (percentage >= 80) {
        level = "warning";
      } else {
        level = "ok";
      }

      return {
        category: limit.category,
        monthlyLimit: limit.monthlyLimit,
        spent,
        percentage,
        level,
      };
    });

    const totalLimit = limits.reduce((sum, l) => sum + l.monthlyLimit, 0);
    const totalSpent = statuses.reduce((sum, s) => sum + s.spent, 0);

    return { statuses, totalLimit, totalSpent };
  }
}
