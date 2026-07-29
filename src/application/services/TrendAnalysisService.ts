import { Injectable } from '@nestjs/common';
import { MonthlyBreakdown } from '../../domain/entities/MonthlyBreakdown';
import { CategoryTrend } from '../../domain/entities/CategoryTrend';

@Injectable()
export class TrendAnalysisService {
  analyzeOverallTrend(monthlyTotals: number[]): {
    direction: 'increasing' | 'decreasing' | 'stable';
    changePercent: number;
  } {
    const n = monthlyTotals.length;
    const halfSize = Math.floor(n / 2);

    const firstHalf = monthlyTotals.slice(0, halfSize);
    const secondHalf = monthlyTotals.slice(n % 2 === 0 ? halfSize : halfSize + 1);

    const avgFirstHalf =
      firstHalf.length > 0
        ? firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length
        : 0;
    const avgSecondHalf =
      secondHalf.length > 0
        ? secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length
        : 0;

    if (avgFirstHalf === 0 && avgSecondHalf === 0) {
      return { direction: 'stable', changePercent: 0 };
    }

    if (avgFirstHalf === 0 && avgSecondHalf > 0) {
      return { direction: 'increasing', changePercent: 100 };
    }

    const changePercent =
      ((avgSecondHalf - avgFirstHalf) / avgFirstHalf) * 100;

    let direction: 'increasing' | 'decreasing' | 'stable';
    if (changePercent > 10) {
      direction = 'increasing';
    } else if (changePercent < -10) {
      direction = 'decreasing';
    } else {
      direction = 'stable';
    }

    return { direction, changePercent };
  }

  analyzeCategoryTrends(
    monthlyBreakdowns: MonthlyBreakdown[],
    minMonthsPresence: number = 3,
  ): CategoryTrend[] {
    const monthsCount = monthlyBreakdowns.length;

    // Collect all unique categories across all months
    const allCategories = new Set<string>();
    for (const breakdown of monthlyBreakdowns) {
      for (const category of Object.keys(breakdown.byCategory)) {
        allCategories.add(category);
      }
    }

    const results: CategoryTrend[] = [];

    for (const category of allCategories) {
      // Build monthlyAmounts array (0 for months without that category)
      const monthlyAmounts = monthlyBreakdowns.map(
        (breakdown) => breakdown.byCategory[category] ?? 0,
      );

      // Count months where category is present (non-zero)
      const presenceCount = monthlyAmounts.filter((a) => a > 0).length;

      // Filter out categories appearing in fewer than minMonthsPresence months
      if (presenceCount < minMonthsPresence) {
        continue;
      }

      // Compute trend using the same half-period algorithm
      const { direction, changePercent } =
        this.analyzeOverallTrend(monthlyAmounts);

      // Compute averageMonthly as sum / monthsCount
      const sum = monthlyAmounts.reduce((acc, v) => acc + v, 0);
      const averageMonthly = sum / monthsCount;

      results.push({
        category,
        monthlyAmounts,
        changePercent,
        direction,
        averageMonthly,
      });
    }

    // Sort by |changePercent| descending
    results.sort(
      (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent),
    );

    return results;
  }

  getTopGrowing(trends: CategoryTrend[], limit: number = 3): CategoryTrend[] {
    return trends
      .filter((t) => t.direction === 'increasing')
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, limit);
  }

  getTopShrinking(
    trends: CategoryTrend[],
    limit: number = 3,
  ): CategoryTrend[] {
    return trends
      .filter((t) => t.direction === 'decreasing')
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, limit);
  }
}
