import { Injectable, Inject } from "@nestjs/common";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { Transaction } from "../../domain/entities/Transaction";
import {
  MonthComparisonResult,
  CategoryDiff,
} from "../../domain/entities/MonthComparisonResult";

export interface CompareMonthsParams {
  monthA: number; // 1–12
  yearA: number; // e.g. 2025
  monthB: number; // 1–12
  yearB: number; // e.g. 2025
}

export class SameMonthError extends Error {
  readonly code = "SAME_MONTH" as const;
  constructor() {
    super("Cannot compare a month with itself");
    this.name = "SameMonthError";
  }
}

export class InvalidMonthError extends Error {
  readonly code = "INVALID_MONTH" as const;
  constructor(month: number) {
    super(`Month ${month} is outside valid range 1-12`);
    this.name = "InvalidMonthError";
  }
}

@Injectable()
export class CompareMonths {
  constructor(
    @Inject("TransactionRepository")
    private readonly repository: TransactionRepository,
  ) {}

  async execute(
    userId: string,
    params: CompareMonthsParams,
  ): Promise<MonthComparisonResult> {
    const { monthA, yearA, monthB, yearB } = params;

    // Validate month ranges
    if (monthA < 1 || monthA > 12) {
      throw new InvalidMonthError(monthA);
    }
    if (monthB < 1 || monthB > 12) {
      throw new InvalidMonthError(monthB);
    }

    // Validate different months
    if (monthA === monthB && yearA === yearB) {
      throw new SameMonthError();
    }

    // Compute date ranges for each month
    const rangeA = this.getMonthDateRange(yearA, monthA);
    const rangeB = this.getMonthDateRange(yearB, monthB);

    // Query transactions for each month
    const [transactionsA, transactionsB] = await Promise.all([
      this.repository.findByUserAndDateRange(userId, rangeA.from, rangeA.to),
      this.repository.findByUserAndDateRange(userId, rangeB.from, rangeB.to),
    ]);

    // Aggregate by category (positive amounts only)
    const byCategoryA = this.aggregateByCategory(transactionsA);
    const byCategoryB = this.aggregateByCategory(transactionsB);

    // Compute totals
    const totalSpentA = Object.values(byCategoryA).reduce((s, v) => s + v, 0);
    const totalSpentB = Object.values(byCategoryB).reduce((s, v) => s + v, 0);

    // Compute category diffs (union of all categories from both months)
    const allCategories = new Set([
      ...Object.keys(byCategoryA),
      ...Object.keys(byCategoryB),
    ]);

    const categoryDiffs: CategoryDiff[] = [];
    for (const category of allCategories) {
      const amountA = byCategoryA[category] ?? 0;
      const amountB = byCategoryB[category] ?? 0;
      const absoluteDiff = amountB - amountA;
      const percentChange = this.computePercentChange(amountA, amountB);

      categoryDiffs.push({
        category,
        amountA,
        amountB,
        absoluteDiff,
        percentChange,
      });
    }

    // Sort by |absoluteDiff| descending
    categoryDiffs.sort(
      (a, b) => Math.abs(b.absoluteDiff) - Math.abs(a.absoluteDiff),
    );

    // Compute total percent change
    const totalDifference = totalSpentB - totalSpentA;
    const totalPercentChange = this.computePercentChange(
      totalSpentA,
      totalSpentB,
    );

    // Filter transactions for expense count (positive amounts only)
    const expenseTransactionsA = transactionsA.filter((t) => t.amount > 0);
    const expenseTransactionsB = transactionsB.filter((t) => t.amount > 0);

    const result: MonthComparisonResult = {
      userId,
      monthA: {
        month: monthA,
        year: yearA,
        label: `Tháng ${monthA}/${yearA}`,
        totalSpent: totalSpentA,
        transactionCount: expenseTransactionsA.length,
        byCategory: byCategoryA,
        transactions: transactionsA,
      },
      monthB: {
        month: monthB,
        year: yearB,
        label: `Tháng ${monthB}/${yearB}`,
        totalSpent: totalSpentB,
        transactionCount: expenseTransactionsB.length,
        byCategory: byCategoryB,
        transactions: transactionsB,
      },
      totalDifference,
      totalPercentChange,
      categoryDiffs,
      generatedAt: new Date().toISOString(),
    };

    return result;
  }

  private getMonthDateRange(
    year: number,
    month: number,
  ): { from: Date; to: Date } {
    // First day of the month at 00:00:00
    const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
    // Last day of the month at 23:59:59.999
    const to = new Date(year, month, 0, 23, 59, 59, 999);
    return { from, to };
  }

  private aggregateByCategory(
    transactions: Transaction[],
  ): Record<string, number> {
    const byCategory: Record<string, number> = {};
    for (const t of transactions) {
      if (t.amount > 0) {
        byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
      }
    }
    return byCategory;
  }

  private computePercentChange(
    amountA: number,
    amountB: number,
  ): number | null {
    if (amountA === 0 && amountB === 0) {
      return 0;
    }
    if (amountA === 0 && amountB > 0) {
      return null; // "mới" — new category
    }
    if (amountB === 0 && amountA > 0) {
      return -100;
    }
    return ((amountB - amountA) / amountA) * 100;
  }
}
