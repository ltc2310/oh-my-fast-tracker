/**
 * Formats a number as Vietnamese Dong (VND) currency.
 * Uses period as thousands separator and trailing " ₫" suffix.
 *
 * @example formatVND(1234567) → "1.234.567 ₫"
 * @example formatVND(0) → "0 ₫"
 * @example formatVND(1234.56) → "1.235 ₫"
 */
export function formatVND(amount: number): string {
  const rounded = Math.round(amount);
  const formatted = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${formatted} ₫`;
}
