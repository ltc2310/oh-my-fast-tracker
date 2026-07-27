import { Injectable } from "@nestjs/common";
import { Parser, ParsedExpense } from "../../domain/ports/Parser";

/**
 * Category keyword map - tất cả category bằng tiếng Việt cho dễ hiểu.
 *
 * IMPORTANT: Categories are checked in ORDER. More specific categories
 * should come BEFORE broader ones to avoid false matches.
 * e.g. "Con cái" (sữa) before "Mua sắm" (mua), "Giáo dục" (sách) before "Mua sắm" (mua)
 */
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ["Thu nhập", [
    "lương", "thưởng", "freelance",
    "thu nhập", "tiền về", "bonus",
  ]],
  ["Nhà ở", [
    "thuê nhà", "tiền nhà", "nhà trọ", "phòng trọ",
    "tiền phòng", "ký túc",
  ]],
  ["Tiện ích", [
    "tiền điện", "tiền nước", "tiền gas",
    "gas",
  ]],
  ["Internet", [
    "internet", "wifi", "4g", "5g", "sim",
    "điện thoại", "cước", "data",
  ]],
  ["Sức khỏe", [
    "bệnh viện", "bác sĩ", "khám bệnh", "khám",
    "thuốc", "viện", "y tế", "nha khoa", "nha",
    "xét nghiệm", "vaccine",
  ]],
  ["Con cái", [
    "học phí con", "đồ chơi",
    "sữa", "bỉm", "tã",
    "trẻ em", "em bé",
  ]],
  ["Chi phí cố định", [
    "bảo hiểm", "trả góp", "nợ",
    "phí dịch vụ",
  ]],
  ["Giáo dục", [
    "khóa học", "học phí", "học",
    "sách", "trường", "lớp", "gia sư",
    "thi", "đào tạo",
  ]],
  ["Giải trí", [
    "netflix", "spotify", "youtube premium",
    "phim", "game", "du lịch", "karaoke",
    "concert", "giải trí",
  ]],
  ["Di chuyển", [
    "đổ xăng", "xăng", "grab", "taxi", "gửi xe",
    "rửa xe", "xe buýt", "xe ôm",
    "bus", "vé xe", "vé máy bay", "máy bay",
    "tàu", "ship", "giao hàng", "phí đường", "đi lại",
  ]],
  ["Ăn uống", [
    "ăn sáng", "ăn trưa", "ăn tối", "ăn vặt", "ăn",
    "cà phê", "cafe", "coffee", "trà sữa", "trà đá",
    "bún", "phở", "cơm", "bánh mì", "bánh",
    "nhậu", "lẩu", "hủ tiếu", "mì",
    "chợ", "siêu thị", "đồ ăn", "thực phẩm",
    "nấu", "thịt", "rau", "trái cây", "hoa quả",
    "gà", "heo", "bò", "tôm", "cá", "trứng",
    "bia", "nước ngọt", "sinh tố", "juice",
  ]],
  ["Mua sắm", [
    "quần áo", "quần", "áo", "giày", "dép",
    "shopee", "lazada", "tiki", "túi", "ba lô",
    "mỹ phẩm", "son", "kem", "đồ dùng",
    "mua sắm", "mua",
  ]],
];

// Matches a number + Vietnamese shorthand unit
// Supports decimal with dot or comma: "1.5tr", "1,5tr"
const AMOUNT_REGEX = /(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu)/i;

// Fallback: bare number >= 1000 (e.g. "50000") without unit
const BARE_AMOUNT_REGEX = /(?<!\d)(\d{4,})(?!\s*(?:ngày|hôm|tuần|tháng|năm))/;

/**
 * Detects relative date references in Vietnamese text.
 * Returns the actual Date the expense occurred, or undefined if "today"/no reference.
 */
export function detectDate(text: string): Date | undefined {
  const lower = text.toLowerCase();
  const now = new Date();

  // "hôm qua" / "hq"
  if (/hôm\s*qua|hq\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d;
  }

  // "hôm kia"
  if (/hôm\s*kia/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 2);
    return d;
  }

  // "X ngày trước" / "X hôm trước"
  const daysAgoMatch = lower.match(/(\d+)\s*(?:ngày|hôm)\s*trước/);
  if (daysAgoMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(daysAgoMatch[1], 10));
    return d;
  }

  // "tuần trước"
  if (/tuần\s*trước/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }

  // "tháng trước"
  if (/tháng\s*trước/.test(lower)) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d;
  }

  return undefined;
}

function normalizeAmount(rawNumber: string, unit?: string): number {
  const value = parseFloat(rawNumber.replace(",", "."));
  if (!unit) return value;

  const normalizedUnit = unit.toLowerCase();
  if (
    normalizedUnit === "k" ||
    normalizedUnit.startsWith("ngh") ||
    normalizedUnit.startsWith("ngà")
  ) {
    return value * 1_000;
  }
  if (normalizedUnit === "tr" || normalizedUnit.startsWith("triệu")) {
    return value * 1_000_000;
  }
  return value;
}

function detectCategory(text: string): string | null {
  const lower = text.toLowerCase();

  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    // Sort longest-first so multi-word phrases match before subsets
    const sorted = [...keywords].sort((a, b) => b.length - a.length);
    if (sorted.some((kw) => lower.includes(kw))) {
      return category;
    }
  }

  return null;
}

/**
 * Parse a single segment (one expense item) into a ParsedExpense.
 */
function parseSingle(text: string, sharedDate?: Date): (ParsedExpense & { confident: boolean }) | null {
  // Try amount with unit first (50k, 1tr, 30 nghìn)
  let match = text.match(AMOUNT_REGEX);
  let amount: number;

  if (match) {
    amount = normalizeAmount(match[1], match[2]);
  } else {
    // Fallback: bare number >= 1000 without unit (e.g. "50000")
    const bareMatch = text.match(BARE_AMOUNT_REGEX);
    if (!bareMatch) return null;
    amount = parseFloat(bareMatch[1]);
  }

  if (!amount || amount <= 0) return null;

  const category = detectCategory(text);
  const date = detectDate(text) ?? sharedDate;

  return {
    amount,
    category: category ?? "Khác",
    note: text.trim(),
    confident: category !== null,
    date,
  };
}

/**
 * Splits a message into segments by comma (only when NOT inside a number like 1,5),
 * semicolon, or newline.
 */
function splitSegments(text: string): string[] {
  // Split by semicolon or newline first
  // For commas: only split if comma is NOT between digits (to preserve "1,5tr")
  const segments = text
    .split(/[;\n]+/)
    .flatMap((part) => part.split(/,(?!\d)/))
    .map((s) => s.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments : [text];
}

/**
 * Keyword-based parser for Vietnamese expense messages.
 * Supports multi-transaction messages separated by commas.
 * Supports date detection: "hôm qua", "X ngày trước", "tuần trước", etc.
 */
@Injectable()
export class RegexParser implements Parser {
  parse(text: string): ParsedExpense[] {
    const sharedDate = detectDate(text);
    const segments = splitSegments(text);
    const results: ParsedExpense[] = [];

    for (const segment of segments) {
      const parsed = parseSingle(segment, sharedDate);
      if (parsed) {
        results.push({
          amount: parsed.amount,
          category: parsed.category,
          note: parsed.note,
          date: parsed.date,
        });
      }
    }

    return results;
  }

  /**
   * Exposed for HybridParser: returns confidence info for each segment.
   */
  parseWithConfidence(text: string): (ParsedExpense & { confident: boolean })[] {
    const sharedDate = detectDate(text);
    const segments = splitSegments(text);
    const results: (ParsedExpense & { confident: boolean })[] = [];

    for (const segment of segments) {
      const parsed = parseSingle(segment, sharedDate);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  }
}
