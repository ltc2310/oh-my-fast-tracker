import { Parser, ParsedExpense } from "../../domain/ports/Parser";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "ăn uống": ["ăn", "cơm", "trưa", "tối", "sáng", "cafe", "cà phê", "trà sữa", "nhậu"],
  "di chuyển": ["xăng", "grab", "taxi", "xe ôm", "bus", "gửi xe"],
  "mua sắm": ["áo", "quần", "giày", "dép", "mua", "shopee", "lazada"],
  "hóa đơn": ["điện", "nước", "internet", "wifi", "tiền nhà", "thuê nhà"],
  "giải trí": ["phim", "game", "netflix", "spotify"],
};

// Matches a number + Vietnamese shorthand unit, e.g. "50k", "1tr2", "300.000", "1 triệu"
// NOTE: keywords and units below stay in Vietnamese on purpose — they match
// the real Vietnamese text that users type ("ăn trưa 50k").
const AMOUNT_REGEX = /(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu)?/i;

function normalizeAmount(rawNumber: string, unit?: string): number {
  const value = parseFloat(rawNumber.replace(",", "."));
  if (!unit) return value;

  const normalizedUnit = unit.toLowerCase();
  if (normalizedUnit === "k" || normalizedUnit.startsWith("ngh") || normalizedUnit.startsWith("ngà")) {
    return value * 1_000;
  }
  if (normalizedUnit === "tr" || normalizedUnit.startsWith("triệu")) {
    return value * 1_000_000;
  }
  return value;
}

function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      return category;
    }
  }
  return "khác";
}

/**
 * Current implementation of the Parser interface.
 * This is the swap point: write an AIParser that implements the same
 * interface, change one line in the composition root (main.ts), done —
 * no changes needed in any use case.
 */
export class RegexParser implements Parser {
  parse(text: string): ParsedExpense | null {
    const match = text.match(AMOUNT_REGEX);
    if (!match) return null;

    const amount = normalizeAmount(match[1], match[2]);
    if (!amount || amount <= 0) return null;

    return {
      amount,
      category: detectCategory(text),
      note: text.trim(),
    };
  }
}
