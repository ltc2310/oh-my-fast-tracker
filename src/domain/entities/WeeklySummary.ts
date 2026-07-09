import { Transaction } from "./Transaction";

export interface CategorySummary {
  category: string;
  total: number;
}

export interface WeeklySummary {
  total: number;
  byCategory: CategorySummary[];
  transactions: Transaction[];
  from: Date;
  to: Date;
}