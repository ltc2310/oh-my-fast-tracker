import { MonthlyBreakdown } from "./MonthlyBreakdown";
import { CategoryTrend } from "./CategoryTrend";

export interface TrendReport {
  userId: string;
  periodStart: string;                        // "2026-02-01" (ISO date)
  periodEnd: string;                          // "2026-07-31" (ISO date)
  monthsCount: number;

  overview: {
    totalSpent: number;
    averageMonthlySpent: number;
    highestMonth: { month: string; amount: number };
    lowestMonth: { month: string; amount: number };
    overallDirection: 'increasing' | 'decreasing' | 'stable';
    overallChangePercent: number;
    hasIncompleteData: boolean;
    monthsWithData: number;
  };

  monthlyBreakdown: MonthlyBreakdown[];       // sorted ascending by time
  categoryTrends: CategoryTrend[];            // sorted by |changePercent| descending
  topGrowingCategories: CategoryTrend[];      // top 3 increasing
  topShrinkingCategories: CategoryTrend[];    // top 3 decreasing

  generatedAt: string;                        // ISO timestamp
}
