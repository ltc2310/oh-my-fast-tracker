// Feature: proactive-notifications, Property 7: Month Date Range Correctness
// Feature: proactive-notifications, Property 8: Monthly Summary Content Completeness
// Feature: proactive-notifications, Property 9: Budget Status Formatting

import * as fc from 'fast-check';
import {
  getCompletedMonthRange,
  formatSummary,
  BudgetLimit,
} from '../../src/application/usecases/SendMonthlySummary';
import { Transaction } from '../../src/domain/entities/Transaction';
import { formatVND } from '../../src/application/services/vnd-formatter';

/**
 * Helper: returns the correct last day of a given month/year.
 */
function lastDayOfMonth(year: number, month: number): number {
  // month is 0-indexed; day 0 of next month = last day of current month
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Arbitrary: generates a valid Date within a reasonable range.
 */
const arbDate = fc
  .date({
    min: new Date(2000, 0, 1),
    max: new Date(2099, 11, 31),
  })
  .filter((d) => !isNaN(d.getTime()));

/**
 * Arbitrary: generates a non-empty category string.
 */
const arbCategory: fc.Arbitrary<string> = fc.constantFrom(
  'Ăn uống',
  'Di chuyển',
  'Mua sắm',
  'Giải trí',
  'Hóa đơn',
  'Sức khỏe',
  'Giáo dục',
  'Khác',
);

/**
 * Arbitrary: generates a transaction with positive amount (expense).
 */
const arbExpenseTransaction = fc
  .record({
    amount: fc.integer({ min: 1, max: 100_000_000 }),
    category: arbCategory,
    note: fc.string({ minLength: 1, maxLength: 20 }),
  })
  .map(
    ({ amount, category, note }): Transaction => ({
      userId: 'user-1',
      amount,
      category,
      note,
    }),
  );

/**
 * Arbitrary: generates a transaction with negative amount (income).
 */
const arbIncomeTransaction = fc
  .record({
    amount: fc.integer({ min: 1, max: 100_000_000 }),
    category: fc.constant('Thu nhập'),
    note: fc.string({ minLength: 1, maxLength: 20 }),
  })
  .map(
    ({ amount, category, note }): Transaction => ({
      userId: 'user-1',
      amount: -amount,
      category,
      note,
    }),
  );

/**
 * Arbitrary: generates a non-empty array of transactions (mix of expenses and income).
 */
const arbTransactions = fc
  .array(fc.oneof(arbExpenseTransaction, arbIncomeTransaction), {
    minLength: 1,
    maxLength: 50,
  })
  .filter((txs) => txs.some((tx) => tx.amount > 0)); // ensure at least one expense

describe('SendMonthlySummary Property Tests', () => {
  // Property 7: Month Date Range Correctness
  // **Validates: Requirements 4.1**
  describe('Property 7: Month Date Range Correctness', () => {
    it('monthStart is always 1st of the month at 00:00:00.000', () => {
      fc.assert(
        fc.property(arbDate, (date) => {
          const { monthStart } = getCompletedMonthRange(date);

          expect(monthStart.getFullYear()).toBe(date.getFullYear());
          expect(monthStart.getMonth()).toBe(date.getMonth());
          expect(monthStart.getDate()).toBe(1);
          expect(monthStart.getHours()).toBe(0);
          expect(monthStart.getMinutes()).toBe(0);
          expect(monthStart.getSeconds()).toBe(0);
          expect(monthStart.getMilliseconds()).toBe(0);
        }),
        { numRuns: 100 },
      );
    });

    it('monthEnd is always the last day of the month at 23:59:59.999', () => {
      fc.assert(
        fc.property(arbDate, (date) => {
          const { monthEnd } = getCompletedMonthRange(date);

          const expectedLastDay = lastDayOfMonth(
            date.getFullYear(),
            date.getMonth(),
          );

          expect(monthEnd.getFullYear()).toBe(date.getFullYear());
          expect(monthEnd.getMonth()).toBe(date.getMonth());
          expect(monthEnd.getDate()).toBe(expectedLastDay);
          expect(monthEnd.getHours()).toBe(23);
          expect(monthEnd.getMinutes()).toBe(59);
          expect(monthEnd.getSeconds()).toBe(59);
          expect(monthEnd.getMilliseconds()).toBe(999);
        }),
        { numRuns: 100 },
      );
    });

    it('monthEnd is in the same month as monthStart', () => {
      fc.assert(
        fc.property(arbDate, (date) => {
          const { monthStart, monthEnd } = getCompletedMonthRange(date);
          expect(monthEnd.getMonth()).toBe(monthStart.getMonth());
          expect(monthEnd.getFullYear()).toBe(monthStart.getFullYear());
        }),
        { numRuns: 100 },
      );
    });

    it('monthEnd date matches correct last day for that month (28/29/30/31)', () => {
      fc.assert(
        fc.property(arbDate, (date) => {
          const { monthEnd } = getCompletedMonthRange(date);
          const year = date.getFullYear();
          const month = date.getMonth();

          const expectedLastDay = lastDayOfMonth(year, month);
          expect(monthEnd.getDate()).toBe(expectedLastDay);

          // Verify the expected last day is one of 28, 29, 30, 31
          expect([28, 29, 30, 31]).toContain(expectedLastDay);
        }),
        { numRuns: 100 },
      );
    });
  });

  // Property 8: Monthly Summary Content Completeness
  // **Validates: Requirements 4.2**
  describe('Property 8: Monthly Summary Content Completeness', () => {
    it('message contains total expenses formatted in VND', () => {
      fc.assert(
        fc.property(arbTransactions, (txs) => {
          const message = formatSummary(txs);
          const totalExpenses = txs
            .filter((tx) => tx.amount > 0)
            .reduce((sum, tx) => sum + tx.amount, 0);

          expect(message).toContain(formatVND(totalExpenses));
        }),
        { numRuns: 100 },
      );
    });

    it('message contains total income if income transactions are present', () => {
      fc.assert(
        fc.property(arbTransactions, (txs) => {
          const message = formatSummary(txs);
          const totalIncome = txs
            .filter((tx) => tx.amount < 0)
            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          if (totalIncome > 0) {
            expect(message).toContain(formatVND(totalIncome));
          }
        }),
        { numRuns: 100 },
      );
    });

    it('message contains the transaction count', () => {
      fc.assert(
        fc.property(arbTransactions, (txs) => {
          const message = formatSummary(txs);
          expect(message).toContain(`${txs.length}`);
        }),
        { numRuns: 100 },
      );
    });

    it('message contains all expense category names', () => {
      fc.assert(
        fc.property(arbTransactions, (txs) => {
          const message = formatSummary(txs);
          const expenseCategories = new Set(
            txs.filter((tx) => tx.amount > 0).map((tx) => tx.category),
          );

          for (const category of expenseCategories) {
            expect(message).toContain(category);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  // Property 9: Budget Status Formatting
  // **Validates: Requirements 4.4, 4.5**
  describe('Property 9: Budget Status Formatting', () => {
    it('shows "⚠️ Vượt" with excess amount when spending > limit', () => {
      fc.assert(
        fc.property(
          arbCategory,
          fc.integer({ min: 2, max: 100_000_000 }),
          fc.integer({ min: 1, max: 99_999_999 }),
          (category, spending, limitVal) => {
            // Ensure spending > limit
            const actualLimit = Math.min(limitVal, spending - 1);
            if (actualLimit <= 0) return; // skip degenerate case

            const transactions: Transaction[] = [
              { userId: 'user-1', amount: spending, category, note: 'test' },
            ];
            const budgetLimits: BudgetLimit[] = [
              { category, limit: actualLimit },
            ];

            const message = formatSummary(transactions, budgetLimits);
            const excess = spending - actualLimit;

            expect(message).toContain('⚠️ Vượt');
            expect(message).toContain(formatVND(excess));
          },
        ),
        { numRuns: 100 },
      );
    });

    it('shows "✅ Còn" with remaining amount when spending <= limit', () => {
      fc.assert(
        fc.property(
          arbCategory,
          fc.integer({ min: 1, max: 50_000_000 }),
          fc.integer({ min: 0, max: 100_000_000 }),
          (category, spending, extraLimit) => {
            // Ensure limit >= spending
            const limit = spending + extraLimit;
            if (limit <= 0) return; // skip degenerate

            const transactions: Transaction[] = [
              { userId: 'user-1', amount: spending, category, note: 'test' },
            ];
            const budgetLimits: BudgetLimit[] = [{ category, limit }];

            const message = formatSummary(transactions, budgetLimits);
            const remaining = limit - spending;

            expect(message).toContain('✅ Còn');
            expect(message).toContain(formatVND(remaining));
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
