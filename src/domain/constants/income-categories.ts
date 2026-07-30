/**
 * Categories that represent money coming IN (income/savings),
 * not money going out (expenses).
 *
 * When recording a transaction with one of these categories,
 * the amount should be stored as a NEGATIVE number to distinguish
 * income from expenses in aggregation logic.
 */
export const INCOME_CATEGORIES: ReadonlySet<string> = new Set([
  "Thu nhập",
  "Tiết kiệm & Đầu tư",
]);

/**
 * Check whether a category represents income (money in) rather than expense (money out).
 */
export function isIncomeCategory(category: string): boolean {
  return INCOME_CATEGORIES.has(category);
}
