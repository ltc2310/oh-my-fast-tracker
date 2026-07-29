import { Injectable, Inject } from "@nestjs/common";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { TrendAnalysisService } from "../services/TrendAnalysisService";
import { TrendReport } from "../../domain/entities/TrendReport";
import { MonthlyBreakdown } from "../../domain/entities/MonthlyBreakdown";
import { Transaction } from "../../domain/entities/Transaction";

export interface TrendReportParams {
  months: number;
  endMonth?: string; // "YYYY-MM", defaults to current month
}

export class MonthsBelowMinimumError extends Error {
  readonly code = "MONTHS_BELOW_MINIMUM" as const;
  readonly min = 3;

  constructor() {
    super("Months parameter must be at least 3");
    this.name = "MonthsBelowMinimumError";
  }
}

export class MonthsLimitExceededError extends Error {
  readonly code = "MONTHS_LIMIT_EXCEEDED" as const;
  readonly max = 12;

  constructor() {
    super("Months parameter must not exceed 12");
    this.name = "MonthsLimitExceededError";
  }
}

@Injectable()
export class GenerateTrendReport {
  constructor(
    @Inject("TransactionRepository")
    private readonly repository: TransactionRepository,
    private readonly trendAnalysis: TrendAnalysisService,
  ) {}

  async execute(
    userId: string,
    params: TrendReportParams,
  ): Promise<TrendReport> {
    const { months, endMonth } = params;

    // Validate months ∈ [3, 12]
    if (months < 3) {
      throw new MonthsBelowMinimumError();
    }
    if (months > 12) {
      throw new MonthsLimitExceededError();
    }

    // Parse endMonth (default: current month)
    const end = endMonth ? this.parseYearMonth(endMonth) : this.getCurrentYearMonth();

    // Compute periodEnd as last day of endMonth
    const periodEnd = this.getLastDayOfMonth(end.year, end.month);

    // Compute periodStart as first day of (endMonth - months + 1)
    const startDate = new Date(end.year, end.month - months, 1); // month is 0-indexed in Date
    const periodStart = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      1,
    );

    // Fetch all transactions in range — single query
    const transactions = await this.repository.findByUserAndDateRange(
      userId,
      periodStart,
      periodEnd,
    );

    // Group transactions by calendar month (YYYY-MM key)
    const transactionsByMonth = this.groupByMonth(transactions);

    // Build MonthlyBreakdown[] for all N months (including empty ones)
    const monthlyBreakdown = this.buildMonthlyBreakdowns(
      periodStart,
      months,
      transactionsByMonth,
    );

    // Extract monthly totals for overall trend analysis
    const monthlyTotals = monthlyBreakdown.map((mb) => mb.totalSpent);

    // Analyze overall trend
    const overallTrend = this.trendAnalysis.analyzeOverallTrend(monthlyTotals);

    // Analyze category trends
    const categoryTrends =
      this.trendAnalysis.analyzeCategoryTrends(monthlyBreakdown);

    // Get top growing and shrinking
    const topGrowingCategories = this.trendAnalysis.getTopGrowing(categoryTrends);
    const topShrinkingCategories =
      this.trendAnalysis.getTopShrinking(categoryTrends);

    // Compute overview
    const totalSpent = monthlyTotals.reduce((sum, v) => sum + v, 0);
    const averageMonthlySpent = totalSpent / months;

    const highestMonth = this.findHighestMonth(monthlyBreakdown);
    const lowestMonth = this.findLowestMonth(monthlyBreakdown);

    const monthsWithData = monthlyBreakdown.filter(
      (mb) => mb.transactionCount > 0,
    ).length;
    const hasIncompleteData = monthsWithData < months;

    // Format period strings
    const periodStartStr = this.formatDateISO(periodStart);
    const periodEndStr = this.formatDateISO(periodEnd);

    const report: TrendReport = {
      userId,
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      monthsCount: months,
      overview: {
        totalSpent,
        averageMonthlySpent,
        highestMonth,
        lowestMonth,
        overallDirection: overallTrend.direction,
        overallChangePercent: overallTrend.changePercent,
        hasIncompleteData,
        monthsWithData,
      },
      monthlyBreakdown,
      categoryTrends,
      topGrowingCategories,
      topShrinkingCategories,
      generatedAt: new Date().toISOString(),
    };

    return report;
  }

  private parseYearMonth(yearMonth: string): { year: number; month: number } {
    const [yearStr, monthStr] = yearMonth.split("-");
    return { year: parseInt(yearStr, 10), month: parseInt(monthStr, 10) };
  }

  private getCurrentYearMonth(): { year: number; month: number } {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  private getLastDayOfMonth(year: number, month: number): Date {
    // month is 1-indexed here; Date constructor month is 0-indexed
    // new Date(year, month, 0) gives last day of the previous month (which is our target month)
    return new Date(year, month, 0, 23, 59, 59, 999);
  }

  private groupByMonth(transactions: Transaction[]): Map<string, Transaction[]> {
    const map = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const date = t.spentAt ?? t.createdAt ?? new Date();
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(t);
    }
    return map;
  }

  private buildMonthlyBreakdowns(
    periodStart: Date,
    months: number,
    transactionsByMonth: Map<string, Transaction[]>,
  ): MonthlyBreakdown[] {
    const breakdowns: MonthlyBreakdown[] = [];

    for (let i = 0; i < months; i++) {
      const date = new Date(
        periodStart.getFullYear(),
        periodStart.getMonth() + i,
        1,
      );
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // 1-indexed
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const monthLabel = `Tháng ${month}/${year}`;

      const monthTransactions = transactionsByMonth.get(key) ?? [];

      let totalSpent = 0;
      let totalIncome = 0;
      const byCategory: Record<string, number> = {};

      for (const t of monthTransactions) {
        if (t.amount > 0) {
          totalSpent += t.amount;
          byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
        } else {
          totalIncome += Math.abs(t.amount);
        }
      }

      // Determine top category
      let topCategory: { name: string; amount: number } | null = null;
      const categoryEntries = Object.entries(byCategory);
      if (categoryEntries.length > 0) {
        categoryEntries.sort((a, b) => b[1] - a[1]);
        topCategory = { name: categoryEntries[0][0], amount: categoryEntries[0][1] };
      }

      breakdowns.push({
        month: key,
        monthLabel,
        totalSpent,
        totalIncome,
        transactionCount: monthTransactions.length,
        byCategory,
        topCategory,
        transactions: monthTransactions,
      });
    }

    return breakdowns;
  }

  private findHighestMonth(
    breakdowns: MonthlyBreakdown[],
  ): { month: string; amount: number } {
    let highest = { month: breakdowns[0]?.month ?? "", amount: 0 };
    for (const mb of breakdowns) {
      if (mb.totalSpent > highest.amount) {
        highest = { month: mb.month, amount: mb.totalSpent };
      }
    }
    return highest;
  }

  private findLowestMonth(
    breakdowns: MonthlyBreakdown[],
  ): { month: string; amount: number } {
    if (breakdowns.length === 0) {
      return { month: "", amount: 0 };
    }
    let lowest = { month: breakdowns[0].month, amount: breakdowns[0].totalSpent };
    for (const mb of breakdowns) {
      if (mb.totalSpent < lowest.amount) {
        lowest = { month: mb.month, amount: mb.totalSpent };
      }
    }
    return lowest;
  }

  private formatDateISO(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}
