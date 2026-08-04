import { Injectable, Inject } from "@nestjs/common";
import { BudgetLimitRepository } from "../../domain/ports/BudgetLimitRepository";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";

export interface BudgetWarning {
  category: string;
  spent: number;
  limit: number;
  percentage: number;
  level: "warning" | "exceeded";
}

/**
 * Checks if a recorded transaction pushes the user past budget thresholds.
 * Returns a warning only if the category has a budget limit AND is at/above 80%.
 * Returns null if no warning needed.
 */
@Injectable()
export class CheckBudgetAfterRecord {
  constructor(
    @Inject("BudgetLimitRepository")
    private readonly budgetRepo: BudgetLimitRepository,
    @Inject("TransactionRepository")
    private readonly transactionRepo: TransactionRepository,
  ) {}

  async execute(userId: string, category: string): Promise<BudgetWarning | null> {
    const budgetLimit = await this.budgetRepo.findByUserAndCategory(userId, category);
    if (!budgetLimit) return null;

    // Get current month spending for this category
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const transactions = await this.transactionRepo.findByUserAndDateRange(
      userId,
      monthStart,
      now,
    );

    const spent = transactions
      .filter((t) => t.category === category && t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const percentage = budgetLimit.monthlyLimit > 0
      ? (spent / budgetLimit.monthlyLimit) * 100
      : 0;

    if (percentage >= 100) {
      return {
        category,
        spent,
        limit: budgetLimit.monthlyLimit,
        percentage,
        level: "exceeded",
      };
    }

    if (percentage >= 80) {
      return {
        category,
        spent,
        limit: budgetLimit.monthlyLimit,
        percentage,
        level: "warning",
      };
    }

    return null;
  }
}
