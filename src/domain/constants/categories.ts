/**
 * The single source of truth for transaction categories.
 *
 * Any category string that reaches the database MUST be one of these exact
 * values. AI parsers are free-text generators, so their output is always
 * funnelled through `normalizeCategory()` before being persisted — otherwise a
 * hallucinated or mis-spelled label (e.g. "Tiết kiệm" instead of
 * "Tiết kiệm & Đầu tư") silently creates a bogus category and, worse, breaks
 * income/expense sign detection in `isIncomeCategory()`.
 */
export const CATEGORIES = [
  "Ăn uống",
  "Di chuyển",
  "Mua sắm",
  "Nhà ở",
  "Tiện ích",
  "Internet",
  "Sức khỏe",
  "Giáo dục",
  "Giải trí",
  "Con cái",
  "Chi phí cố định",
  "Tiết kiệm & Đầu tư",
  "Thu nhập",
  "Khác",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Fallback used whenever a category cannot be resolved. */
export const FALLBACK_CATEGORY: Category = "Khác";

const CATEGORY_SET: ReadonlySet<string> = new Set(CATEGORIES);

/**
 * Common aliases and near-misses produced by AI models, mapped to the canonical
 * value. Keys are compared case-insensitively after whitespace collapsing.
 */
const CATEGORY_ALIASES: ReadonlyMap<string, Category> = new Map([
  // "Tiết kiệm & Đầu tư" variants — the multimodal prompt used to emit "Tiết kiệm",
  // which broke income detection and stored savings as a positive expense.
  ["tiết kiệm", "Tiết kiệm & Đầu tư"],
  ["tiet kiem", "Tiết kiệm & Đầu tư"],
  ["đầu tư", "Tiết kiệm & Đầu tư"],
  ["dau tu", "Tiết kiệm & Đầu tư"],
  ["tiết kiệm và đầu tư", "Tiết kiệm & Đầu tư"],
  ["tiết kiệm / đầu tư", "Tiết kiệm & Đầu tư"],
  ["savings", "Tiết kiệm & Đầu tư"],
  ["investment", "Tiết kiệm & Đầu tư"],

  // Other frequently observed variants
  ["ăn", "Ăn uống"],
  ["an uong", "Ăn uống"],
  ["food", "Ăn uống"],
  ["di chuyen", "Di chuyển"],
  ["transport", "Di chuyển"],
  ["mua sam", "Mua sắm"],
  ["shopping", "Mua sắm"],
  ["nha o", "Nhà ở"],
  ["housing", "Nhà ở"],
  ["tien ich", "Tiện ích"],
  ["utilities", "Tiện ích"],
  ["suc khoe", "Sức khỏe"],
  ["sức khoẻ", "Sức khỏe"],
  ["health", "Sức khỏe"],
  ["giao duc", "Giáo dục"],
  ["education", "Giáo dục"],
  ["giai tri", "Giải trí"],
  ["entertainment", "Giải trí"],
  ["con cai", "Con cái"],
  ["children", "Con cái"],
  ["kids", "Con cái"],
  ["chi phi co dinh", "Chi phí cố định"],
  ["thu nhap", "Thu nhập"],
  ["income", "Thu nhập"],
  ["salary", "Thu nhập"],
  ["khac", "Khác"],
  ["other", "Khác"],
  ["others", "Khác"],
]);

/** Whether a string is exactly one of the canonical category names. */
export function isValidCategory(category: string): category is Category {
  return CATEGORY_SET.has(category);
}

/**
 * Coerce arbitrary text into a canonical category.
 *
 * Resolution order: exact match → alias match → FALLBACK_CATEGORY.
 * Never throws; always returns a value safe to persist.
 */
export function normalizeCategory(raw: string | null | undefined): Category {
  if (!raw) return FALLBACK_CATEGORY;

  const trimmed = raw.trim();
  if (isValidCategory(trimmed)) return trimmed;

  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  return CATEGORY_ALIASES.get(key) ?? FALLBACK_CATEGORY;
}
