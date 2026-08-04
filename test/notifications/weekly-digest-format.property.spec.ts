// Feature: proactive-notifications, Property 4: Week Date Range Correctness
// Feature: proactive-notifications, Property 5: Weekly Digest Content Completeness
// Feature: proactive-notifications, Property 6: Week-over-Week Comparison Formatting
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

import * as fc from 'fast-check';
import { getWeekRanges, formatDigest } from '../../src/application/usecases/SendWeeklyDigest';
import { Transaction } from '../../src/domain/entities/Transaction';
import { formatVND } from '../../src/application/services/vnd-formatter';

describe('SendWeeklyDigest — Property Tests', () => {
  // Feature: proactive-notifications, Property 4: Week Date Range Correctness
  describe('Property 4: Week Date Range Correctness', () => {
    it('should always produce Monday-Sunday boundaries for any reference date', () => {
      // Generate random dates within a reasonable range (2020-2030)
      const dateArb = fc.date({
        min: new Date('2020-01-01T00:00:00.000Z'),
        max: new Date('2030-12-31T23:59:59.999Z'),
      }).filter((d) => !isNaN(d.getTime()));

      fc.assert(
        fc.property(dateArb, (refDate: Date) => {
          const { currentWeekStart, currentWeekEnd, prevWeekStart, prevWeekEnd } =
            getWeekRanges(refDate);

          // currentWeekStart is a Monday (getDay() === 1)
          expect(currentWeekStart.getDay()).toBe(1);
          // currentWeekStart time is 00:00:00.000
          expect(currentWeekStart.getHours()).toBe(0);
          expect(currentWeekStart.getMinutes()).toBe(0);
          expect(currentWeekStart.getSeconds()).toBe(0);
          expect(currentWeekStart.getMilliseconds()).toBe(0);

          // currentWeekEnd is a Sunday (getDay() === 0)
          expect(currentWeekEnd.getDay()).toBe(0);
          // currentWeekEnd time is 23:59:59.999
          expect(currentWeekEnd.getHours()).toBe(23);
          expect(currentWeekEnd.getMinutes()).toBe(59);
          expect(currentWeekEnd.getSeconds()).toBe(59);
          expect(currentWeekEnd.getMilliseconds()).toBe(999);

          // currentWeekEnd - currentWeekStart ≈ 6 days (6 * 86400000 + 86399999 ms)
          const diffMs =
            currentWeekEnd.getTime() - currentWeekStart.getTime();
          const sixDaysMs = 6 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000 + 999;
          expect(diffMs).toBe(sixDaysMs);

          // prevWeekEnd is the Sunday immediately before currentWeekStart
          expect(prevWeekEnd.getDay()).toBe(0);
          expect(prevWeekEnd.getHours()).toBe(23);
          expect(prevWeekEnd.getMinutes()).toBe(59);
          expect(prevWeekEnd.getSeconds()).toBe(59);
          expect(prevWeekEnd.getMilliseconds()).toBe(999);
          // prevWeekEnd should be the day before currentWeekStart
          const dayBeforeMonday = new Date(currentWeekStart);
          dayBeforeMonday.setDate(dayBeforeMonday.getDate() - 1);
          dayBeforeMonday.setHours(23, 59, 59, 999);
          expect(prevWeekEnd.getTime()).toBe(dayBeforeMonday.getTime());

          // prevWeekStart is a Monday, exactly 7 days before currentWeekStart
          expect(prevWeekStart.getDay()).toBe(1);
          expect(prevWeekStart.getHours()).toBe(0);
          expect(prevWeekStart.getMinutes()).toBe(0);
          expect(prevWeekStart.getSeconds()).toBe(0);
          expect(prevWeekStart.getMilliseconds()).toBe(0);
          const sevenDaysBefore = new Date(currentWeekStart);
          sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7);
          expect(prevWeekStart.getTime()).toBe(sevenDaysBefore.getTime());
        }),
        { numRuns: 100 },
      );
    });
  });

  // Feature: proactive-notifications, Property 5: Weekly Digest Content Completeness
  describe('Property 5: Weekly Digest Content Completeness', () => {
    // Arbitrary for generating expense transactions (amount > 0)
    const categoryArb = fc.constantFrom(
      'Ăn uống', 'Di chuyển', 'Mua sắm', 'Giải trí', 'Sức khỏe',
      'Giáo dục', 'Nhà cửa', 'Con cái', 'Khác',
    );

    const expenseTransactionArb = fc.record({
      userId: fc.constant('user-1'),
      amount: fc.integer({ min: 1000, max: 10_000_000 }),
      category: categoryArb,
      note: fc.string({ minLength: 1, maxLength: 20 }),
    }) as fc.Arbitrary<Transaction>;

    it('should include total and top categories when current week has expenses', () => {
      const currentTxsArb = fc.array(expenseTransactionArb, { minLength: 1, maxLength: 20 });
      const prevTxsArb = fc.array(expenseTransactionArb, { minLength: 1, maxLength: 20 });

      fc.assert(
        fc.property(currentTxsArb, prevTxsArb, (currentTxs, prevTxs) => {
          const message = formatDigest(currentTxs, prevTxs);

          // (1) Total expense amount should be present formatted in VND
          const currentTotal = currentTxs.reduce((sum, t) => sum + t.amount, 0);
          expect(message).toContain(formatVND(currentTotal));

          // (2) Up to 3 category names from the transactions should be present
          const categoryTotals = new Map<string, number>();
          for (const t of currentTxs) {
            categoryTotals.set(t.category, (categoryTotals.get(t.category) ?? 0) + t.amount);
          }
          const top3 = Array.from(categoryTotals.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
          for (const [category] of top3) {
            expect(message).toContain(category);
          }

          // (3) Comparison line present when prevTxs has expenses
          const prevTotal = prevTxs.reduce((sum, t) => sum + t.amount, 0);
          if (prevTotal > 0) {
            const hasComparison =
              message.includes('📈 Tăng') || message.includes('📉 Giảm');
            expect(hasComparison).toBe(true);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('should return special message when current week has no expenses', () => {
      // Generate transactions with non-positive amounts (income only or empty)
      const incomeTxArb = fc.record({
        userId: fc.constant('user-1'),
        amount: fc.integer({ min: -10_000_000, max: 0 }),
        category: categoryArb,
        note: fc.string({ minLength: 1, maxLength: 20 }),
      }) as fc.Arbitrary<Transaction>;

      const currentTxsArb = fc.array(incomeTxArb, { minLength: 0, maxLength: 10 });
      const prevTxsArb = fc.array(expenseTransactionArb, { minLength: 0, maxLength: 10 });

      fc.assert(
        fc.property(currentTxsArb, prevTxsArb, (currentTxs, prevTxs) => {
          const message = formatDigest(currentTxs, prevTxs);
          expect(message).toContain(
            '📊 Tuần này bạn chưa ghi khoản chi tiêu nào',
          );
        }),
        { numRuns: 100 },
      );
    });
  });

  // Feature: proactive-notifications, Property 6: Week-over-Week Comparison Formatting
  describe('Property 6: Week-over-Week Comparison Formatting', () => {
    const categoryArb = fc.constantFrom(
      'Ăn uống', 'Di chuyển', 'Mua sắm', 'Giải trí', 'Sức khỏe',
    );

    // Helper to create a single-transaction array with a given total
    function makeTxsWithTotal(total: number, category: string): Transaction[] {
      return [{ userId: 'user-1', amount: total, category, note: 'test' }];
    }

    it('should show "📈 Tăng X%" when current > previous, with correct percentage', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 50_000_000 }),
          fc.integer({ min: 1000, max: 50_000_000 }),
          categoryArb,
          (prevTotal, extraAmount, category) => {
            // Ensure currentTotal > prevTotal
            const currentTotal = prevTotal + extraAmount;
            const currentTxs = makeTxsWithTotal(currentTotal, category);
            const prevTxs = makeTxsWithTotal(prevTotal, category);

            const message = formatDigest(currentTxs, prevTxs);

            const expectedPct = Math.round(
              ((currentTotal - prevTotal) / prevTotal) * 100,
            );
            expect(message).toContain(`📈 Tăng ${expectedPct}% so với tuần trước`);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should show "📉 Giảm X%" when current <= previous, with correct percentage', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 50_000_000 }),
          fc.integer({ min: 0, max: 50_000_000 }),
          categoryArb,
          (prevTotal, reduction, category) => {
            // Ensure currentTotal <= prevTotal (currentTotal = prevTotal - reduction, min 1 to be non-zero)
            const currentTotal = Math.max(1, prevTotal - reduction);
            // Only test when currentTotal <= prevTotal
            if (currentTotal > prevTotal) return;

            const currentTxs = makeTxsWithTotal(currentTotal, category);
            const prevTxs = makeTxsWithTotal(prevTotal, category);

            const message = formatDigest(currentTxs, prevTxs);

            const expectedPct = Math.round(
              ((prevTotal - currentTotal) / prevTotal) * 100,
            );
            expect(message).toContain(`📉 Giảm ${expectedPct}% so với tuần trước`);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should omit comparison when previous week has no expenses', () => {
      const expenseTxArb = fc.record({
        userId: fc.constant('user-1'),
        amount: fc.integer({ min: 1000, max: 10_000_000 }),
        category: categoryArb,
        note: fc.string({ minLength: 1, maxLength: 20 }),
      }) as fc.Arbitrary<Transaction>;

      fc.assert(
        fc.property(
          fc.array(expenseTxArb, { minLength: 1, maxLength: 10 }),
          (currentTxs) => {
            // Empty previous week (no expenses)
            const message = formatDigest(currentTxs, []);

            expect(message).not.toContain('📈 Tăng');
            expect(message).not.toContain('📉 Giảm');
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
