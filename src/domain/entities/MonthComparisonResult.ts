import { Transaction } from './Transaction';

export interface CategoryDiff {
  category: string;
  amountA: number;           // total in month A (0 if absent)
  amountB: number;           // total in month B (0 if absent)
  absoluteDiff: number;      // amountB - amountA
  percentChange: number | null; // null when amountA = 0 and amountB > 0 ("mới")
}

export interface MonthComparisonResult {
  userId: string;
  monthA: {
    month: number;           // 1–12
    year: number;
    label: string;           // "Tháng 7/2025"
    totalSpent: number;
    transactionCount: number;
    byCategory: Record<string, number>;
    transactions: Transaction[];
  };
  monthB: {
    month: number;
    year: number;
    label: string;
    totalSpent: number;
    transactionCount: number;
    byCategory: Record<string, number>;
    transactions: Transaction[];
  };
  totalDifference: number;       // monthB.totalSpent - monthA.totalSpent
  totalPercentChange: number | null;
  categoryDiffs: CategoryDiff[]; // sorted by |absoluteDiff| descending
  generatedAt: string;           // ISO timestamp
}
