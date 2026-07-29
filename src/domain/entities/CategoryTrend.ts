export interface CategoryTrend {
  category: string;
  monthlyAmounts: number[];                   // length = months count, chronological order
  changePercent: number;                      // (avgSecondHalf - avgFirstHalf) / avgFirstHalf * 100
  direction: 'increasing' | 'decreasing' | 'stable';
  averageMonthly: number;
}
