import { Transaction } from './Transaction';

export interface MonthlyBreakdown {
  month: string;                              // "2026-02" (YYYY-MM)
  monthLabel: string;                         // "Tháng 2/2026"
  totalSpent: number;
  totalIncome: number;
  transactionCount: number;
  byCategory: Record<string, number>;         // category name → total amount
  topCategory: { name: string; amount: number } | null;
  transactions?: Transaction[];               // raw transactions for this month (used by Excel export)
}
