import { Transaction } from "./Transaction";

export interface CategorySummary {
  category: string;
  total: number;
}

export interface WeeklySummary {
  /** Total expenses (positive amounts only). */
  total: number;
  /** Total income (from negative-amount transactions, shown as positive). Defaults to 0 if not set. */
  totalIncome?: number;
  byCategory: CategorySummary[];
  transactions: Transaction[];
  from: Date;
  to: Date;
}
