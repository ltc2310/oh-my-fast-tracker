import { TrendAnalysisService } from '../../src/application/services/TrendAnalysisService';
import { MonthlyBreakdown } from '../../src/domain/entities/MonthlyBreakdown';
import { CategoryTrend } from '../../src/domain/entities/CategoryTrend';

describe('TrendAnalysisService', () => {
  let service: TrendAnalysisService;

  beforeEach(() => {
    service = new TrendAnalysisService();
  });

  describe('analyzeOverallTrend', () => {
    it('detects increasing trend when second half avg exceeds first half by >10%', () => {
      // First half avg: (100+110+120)/3 = 110, Second half avg: (200+210+220)/3 = 210
      // Change: (210-110)/110*100 = 90.9%
      const totals = [100, 110, 120, 200, 210, 220];
      const result = service.analyzeOverallTrend(totals);
      expect(result.direction).toBe('increasing');
      expect(result.changePercent).toBeGreaterThan(10);
    });

    it('detects decreasing trend when second half avg is <-10% of first half', () => {
      // First half avg: (200+210+220)/3 = 210, Second half avg: (100+110+120)/3 = 110
      // Change: (110-210)/210*100 = -47.6%
      const totals = [200, 210, 220, 100, 110, 120];
      const result = service.analyzeOverallTrend(totals);
      expect(result.direction).toBe('decreasing');
      expect(result.changePercent).toBeLessThan(-10);
    });

    it('detects stable trend when change is within ±10%', () => {
      // First half avg: (100+102+98)/3 = 100, Second half avg: (101+99+103)/3 = 101
      // Change: (101-100)/100*100 = 1%
      const totals = [100, 102, 98, 101, 99, 103];
      const result = service.analyzeOverallTrend(totals);
      expect(result.direction).toBe('stable');
      expect(result.changePercent).toBeGreaterThanOrEqual(-10);
      expect(result.changePercent).toBeLessThanOrEqual(10);
    });

    it('excludes middle month when count is odd (7 months)', () => {
      // 7 months: first 3, skip middle (index 3), last 3
      // First half: [100, 100, 100] avg = 100
      // Middle (excluded): 9999
      // Second half: [200, 200, 200] avg = 200
      // Change: (200-100)/100*100 = 100%
      const totals = [100, 100, 100, 9999, 200, 200, 200];
      const result = service.analyzeOverallTrend(totals);
      expect(result.direction).toBe('increasing');
      expect(result.changePercent).toBeCloseTo(100);
    });

    it('returns stable with 0% change when all totals are 0', () => {
      const totals = [0, 0, 0, 0, 0, 0];
      const result = service.analyzeOverallTrend(totals);
      expect(result.direction).toBe('stable');
      expect(result.changePercent).toBe(0);
    });

    it('returns increasing with 100% change when first half is 0 and second half > 0', () => {
      const totals = [0, 0, 0, 100, 200, 300];
      const result = service.analyzeOverallTrend(totals);
      expect(result.direction).toBe('increasing');
      expect(result.changePercent).toBe(100);
    });

    it('classifies exactly +10% as stable', () => {
      // First half avg = 100, second half avg = 110 → change = 10%
      const totals = [100, 100, 100, 110, 110, 110];
      const result = service.analyzeOverallTrend(totals);
      expect(result.direction).toBe('stable');
      expect(result.changePercent).toBeCloseTo(10);
    });

    it('classifies exactly -10% as stable', () => {
      // First half avg = 100, second half avg = 90 → change = -10%
      const totals = [100, 100, 100, 90, 90, 90];
      const result = service.analyzeOverallTrend(totals);
      expect(result.direction).toBe('stable');
      expect(result.changePercent).toBeCloseTo(-10);
    });
  });

  describe('analyzeCategoryTrends', () => {
    function makeBreakdown(
      month: string,
      byCategory: Record<string, number>,
    ): MonthlyBreakdown {
      const totalSpent = Object.values(byCategory).reduce((s, v) => s + v, 0);
      const entries = Object.entries(byCategory);
      const topEntry = entries.length > 0
        ? entries.sort((a, b) => b[1] - a[1])[0]
        : null;
      return {
        month,
        monthLabel: `Tháng ${parseInt(month.split('-')[1])}/${month.split('-')[0]}`,
        totalSpent,
        totalIncome: 0,
        transactionCount: entries.length,
        byCategory,
        topCategory: topEntry ? { name: topEntry[0], amount: topEntry[1] } : null,
      };
    }

    it('excludes categories present in fewer than 3 months', () => {
      const breakdowns = [
        makeBreakdown('2026-01', { food: 100, rare: 50 }),
        makeBreakdown('2026-02', { food: 120, rare: 60 }),
        makeBreakdown('2026-03', { food: 130 }), // rare absent
        makeBreakdown('2026-04', { food: 140 }),
        makeBreakdown('2026-05', { food: 150 }),
        makeBreakdown('2026-06', { food: 160 }),
      ];

      const result = service.analyzeCategoryTrends(breakdowns);
      const categories = result.map((t) => t.category);
      expect(categories).toContain('food');
      expect(categories).not.toContain('rare');
    });

    it('builds monthlyAmounts array with N elements, 0 for missing months', () => {
      const breakdowns = [
        makeBreakdown('2026-01', { food: 100 }),
        makeBreakdown('2026-02', { food: 120 }),
        makeBreakdown('2026-03', { food: 0 }),
        makeBreakdown('2026-04', { food: 140 }),
        makeBreakdown('2026-05', { food: 150 }),
        makeBreakdown('2026-06', { food: 160 }),
      ];

      const result = service.analyzeCategoryTrends(breakdowns);
      const foodTrend = result.find((t) => t.category === 'food');
      expect(foodTrend).toBeDefined();
      expect(foodTrend!.monthlyAmounts).toHaveLength(6);
    });

    it('computes averageMonthly as sum / monthsCount', () => {
      const breakdowns = [
        makeBreakdown('2026-01', { food: 100 }),
        makeBreakdown('2026-02', { food: 200 }),
        makeBreakdown('2026-03', { food: 300 }),
        makeBreakdown('2026-04', { food: 400 }),
        makeBreakdown('2026-05', { food: 500 }),
        makeBreakdown('2026-06', { food: 600 }),
      ];

      const result = service.analyzeCategoryTrends(breakdowns);
      const foodTrend = result.find((t) => t.category === 'food');
      expect(foodTrend!.averageMonthly).toBeCloseTo(
        (100 + 200 + 300 + 400 + 500 + 600) / 6,
      );
    });

    it('sorts results by |changePercent| descending', () => {
      const breakdowns = [
        makeBreakdown('2026-01', { food: 100, rent: 500, gym: 200 }),
        makeBreakdown('2026-02', { food: 100, rent: 500, gym: 200 }),
        makeBreakdown('2026-03', { food: 100, rent: 500, gym: 200 }),
        makeBreakdown('2026-04', { food: 200, rent: 510, gym: 50 }),
        makeBreakdown('2026-05', { food: 200, rent: 510, gym: 50 }),
        makeBreakdown('2026-06', { food: 200, rent: 510, gym: 50 }),
      ];

      const result = service.analyzeCategoryTrends(breakdowns);
      for (let i = 0; i < result.length - 1; i++) {
        expect(Math.abs(result[i].changePercent)).toBeGreaterThanOrEqual(
          Math.abs(result[i + 1].changePercent),
        );
      }
    });

    it('respects custom minMonthsPresence parameter', () => {
      const breakdowns = [
        makeBreakdown('2026-01', { food: 100, rare: 50 }),
        makeBreakdown('2026-02', { food: 120, rare: 60 }),
        makeBreakdown('2026-03', { food: 130 }),
        makeBreakdown('2026-04', { food: 140 }),
        makeBreakdown('2026-05', { food: 150 }),
        makeBreakdown('2026-06', { food: 160 }),
      ];

      // With minMonthsPresence=2, 'rare' should be included
      const result = service.analyzeCategoryTrends(breakdowns, 2);
      const categories = result.map((t) => t.category);
      expect(categories).toContain('rare');
    });
  });

  describe('getTopGrowing', () => {
    it('returns only increasing categories sorted by changePercent descending', () => {
      const trends: CategoryTrend[] = [
        { category: 'a', monthlyAmounts: [], changePercent: 50, direction: 'increasing', averageMonthly: 100 },
        { category: 'b', monthlyAmounts: [], changePercent: 80, direction: 'increasing', averageMonthly: 200 },
        { category: 'c', monthlyAmounts: [], changePercent: -20, direction: 'decreasing', averageMonthly: 150 },
        { category: 'd', monthlyAmounts: [], changePercent: 5, direction: 'stable', averageMonthly: 50 },
        { category: 'e', monthlyAmounts: [], changePercent: 30, direction: 'increasing', averageMonthly: 80 },
      ];

      const result = service.getTopGrowing(trends);
      expect(result).toHaveLength(3);
      expect(result[0].category).toBe('b');
      expect(result[1].category).toBe('a');
      expect(result[2].category).toBe('e');
    });

    it('returns fewer than limit if fewer than limit categories are increasing', () => {
      const trends: CategoryTrend[] = [
        { category: 'a', monthlyAmounts: [], changePercent: 50, direction: 'increasing', averageMonthly: 100 },
        { category: 'b', monthlyAmounts: [], changePercent: -20, direction: 'decreasing', averageMonthly: 200 },
      ];

      const result = service.getTopGrowing(trends);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('a');
    });

    it('respects custom limit parameter', () => {
      const trends: CategoryTrend[] = [
        { category: 'a', monthlyAmounts: [], changePercent: 80, direction: 'increasing', averageMonthly: 100 },
        { category: 'b', monthlyAmounts: [], changePercent: 50, direction: 'increasing', averageMonthly: 200 },
        { category: 'c', monthlyAmounts: [], changePercent: 30, direction: 'increasing', averageMonthly: 150 },
        { category: 'd', monthlyAmounts: [], changePercent: 20, direction: 'increasing', averageMonthly: 80 },
      ];

      const result = service.getTopGrowing(trends, 2);
      expect(result).toHaveLength(2);
    });
  });

  describe('getTopShrinking', () => {
    it('returns only decreasing categories sorted by changePercent ascending', () => {
      const trends: CategoryTrend[] = [
        { category: 'a', monthlyAmounts: [], changePercent: -50, direction: 'decreasing', averageMonthly: 100 },
        { category: 'b', monthlyAmounts: [], changePercent: -20, direction: 'decreasing', averageMonthly: 200 },
        { category: 'c', monthlyAmounts: [], changePercent: 50, direction: 'increasing', averageMonthly: 150 },
        { category: 'd', monthlyAmounts: [], changePercent: -80, direction: 'decreasing', averageMonthly: 80 },
      ];

      const result = service.getTopShrinking(trends);
      expect(result).toHaveLength(3);
      expect(result[0].category).toBe('d'); // most negative first
      expect(result[1].category).toBe('a');
      expect(result[2].category).toBe('b');
    });

    it('returns fewer than limit if fewer categories are decreasing', () => {
      const trends: CategoryTrend[] = [
        { category: 'a', monthlyAmounts: [], changePercent: -50, direction: 'decreasing', averageMonthly: 100 },
        { category: 'b', monthlyAmounts: [], changePercent: 50, direction: 'increasing', averageMonthly: 200 },
      ];

      const result = service.getTopShrinking(trends);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('a');
    });

    it('respects custom limit parameter', () => {
      const trends: CategoryTrend[] = [
        { category: 'a', monthlyAmounts: [], changePercent: -80, direction: 'decreasing', averageMonthly: 100 },
        { category: 'b', monthlyAmounts: [], changePercent: -50, direction: 'decreasing', averageMonthly: 200 },
        { category: 'c', monthlyAmounts: [], changePercent: -30, direction: 'decreasing', averageMonthly: 150 },
        { category: 'd', monthlyAmounts: [], changePercent: -20, direction: 'decreasing', averageMonthly: 80 },
      ];

      const result = service.getTopShrinking(trends, 2);
      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('a');
      expect(result[1].category).toBe('b');
    });
  });
});
