import { Injectable } from "@nestjs/common";
import { Parser, ParsedExpense } from "../../domain/ports/Parser";

/**
 * Category keyword map - tất cả category bằng tiếng Việt cho dễ hiểu.
 *
 * IMPORTANT: Categories are checked in ORDER. More specific categories
 * should come BEFORE broader ones to avoid false matches.
 */
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ["Tiết kiệm & Đầu tư", [
    "gửi tiết kiệm", "tiết kiệm", "chứng khoán", "đầu tư",
    "cổ phiếu", "bitcoin", "crypto", "vàng", "quỹ",
    "saving", "invest",
  ]],
  ["Thu nhập", [
    "thu nhập", "tiền về", "freelance", "thưởng", "lương",
    "bonus",
  ]],
  ["Nhà ở", [
    "đồ gia dụng", "phòng trọ", "thuê nhà", "tiền nhà", "nhà trọ",
    "tiền phòng", "sửa nhà", "nội thất", "ký túc",
    "rent",
  ]],
  ["Tiện ích", [
    "tiền điện", "tiền nước", "tiền gas",
    "electric", "water", "gas",
  ]],
  ["Internet", [
    "điện thoại", "internet", "gói cước", "mobile",
    "wifi", "cước", "data", "sim", "4g", "5g",
  ]],
  ["Sức khỏe", [
    "xét nghiệm", "bệnh viện", "khám bệnh", "phòng tập",
    "nha khoa", "thể dục", "vaccine", "bác sĩ",
    "thuốc", "khám", "viện", "y tế", "yoga", "nha",
    "gym",
  ]],
  ["Con cái", [
    "học phí con", "đồ chơi", "trẻ em", "em bé", "bỉm", "tã", "con",
  ]],
  ["Chi phí cố định", [
    "phí dịch vụ", "bảo hiểm", "trả góp", "nợ",
  ]],
  ["Giáo dục", [
    "online course", "khóa học", "học phí", "đào tạo",
    "coursera", "trường", "gia sư", "udemy",
    "sách", "lớp", "học", "thi",
  ]],
  ["Giải trí", [
    "youtube premium", "billiard", "concert", "giải trí",
    "netflix", "spotify", "du lịch", "karaoke",
    "phim", "game", "nhạc", "show", "bida",
    "movie",
  ]],
  ["Di chuyển", [
    "phí cầu đường", "vé máy bay", "giao hàng",
    "phí đường", "đổ xăng", "xe buýt", "máy bay",
    "đi lại", "rửa xe", "gửi xe", "vé tàu", "đi xe",
    "xe ôm", "vé xe", "xăng", "grab", "taxi", "gojek",
    "tàu", "ship", "toll", "bus",
    "parking", "uber",
  ]],
  ["Ăn uống", [
    "ăn sáng", "ăn trưa", "ăn tối", "ăn vặt", "ăn chiều",
    "bữa sáng", "bữa trưa", "bữa tối",
    "nước ngọt", "thực phẩm", "trái cây", "hoa quả",
    "hủ tiếu", "siêu thị", "sinh tố", "bánh mì",
    "trà sữa", "trà đá", "cà phê", "đồ ăn", "sữa",
    "cafe", "nhậu", "bánh", "phở", "cơm", "bún",
    "lẩu", "nấu", "thịt", "rau", "bia", "chợ", "chè",
    "trà", "mì", "ăn",
    "gà", "heo", "bò", "tôm", "cá", "trứng", "bữa", "nước",
    "breakfast", "coffee", "dinner", "lunch", "juice",
  ]],
  ["Mua sắm", [
    "quần áo", "đặt hàng", "mua sắm", "mỹ phẩm", "đồ dùng",
    "shopee", "lazada", "online", "ba lô", "order",
    "quần", "giày", "tiki", "túi", "áo", "dép",
    "son", "kem", "mua",
    "shopping",
  ]],
];

// --- Abbreviation expansion ---

const ABBREVIATION_MAP: Record<string, string> = {
  cf: "cà phê",
  cp: "cà phê",
  dt: "điện thoại",
  bv: "bệnh viện",
  st: "siêu thị",
  ks: "khách sạn",
  nt: "nhà thuốc",
  ts: "trà sữa",
};

/**
 * Expands standalone Vietnamese abbreviations to their full forms.
 * Uses whitespace-based word boundaries (not regex \b) for Vietnamese compatibility.
 * Case-insensitive matching. Abbreviations within longer tokens are NOT expanded.
 */
export function expandAbbreviations(text: string): string {
  const tokens = text.split(/(\s+)/);
  return tokens
    .map((token) => {
      const lower = token.toLowerCase();
      if (lower in ABBREVIATION_MAP) {
        return ABBREVIATION_MAP[lower];
      }
      return token;
    })
    .join("");
}

// --- Spelling normalization ---

/**
 * Collects all keywords from CATEGORY_KEYWORDS into a flat Set for quick lookup.
 * Used by normalizeSpelling to validate conditional d→gi substitution.
 */
const ALL_KEYWORDS: Set<string> = new Set(
  CATEGORY_KEYWORDS.flatMap(([, keywords]) => keywords),
);

/**
 * Checks whether a word appears as a standalone keyword or as a component
 * within a multi-word keyword in the CATEGORY_KEYWORDS map.
 */
function matchesKnownKeyword(word: string): boolean {
  if (ALL_KEYWORDS.has(word)) return true;
  for (const kw of ALL_KEYWORDS) {
    if (
      kw.startsWith(word + " ") ||
      kw.endsWith(" " + word) ||
      kw.includes(" " + word + " ")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Normalizes informal Vietnamese spellings at word-initial positions.
 * Operates on already-lowercased text.
 *
 * Unconditional substitutions (always applied at word start):
 *   f → ph, z → gi, w → qu
 *
 * Conditional substitution (only when result matches a known keyword):
 *   d → gi
 *
 * Only applies at word boundaries (start of string or preceded by whitespace).
 * Characters at non-initial positions are never transformed.
 */
export function normalizeSpelling(text: string): string {
  const tokens = text.split(/(\s+)/);

  return tokens
    .map((token) => {
      if (/^\s*$/.test(token)) return token;

      const firstChar = token[0];
      const rest = token.slice(1);

      if (firstChar === "f") return "ph" + rest;
      if (firstChar === "z") return "gi" + rest;
      if (firstChar === "w") return "qu" + rest;

      if (firstChar === "d" && matchesKnownKeyword("gi" + rest)) {
        return "gi" + rest;
      }

      return token;
    })
    .join("");
}

// --- Cross-segment connectors ---

/**
 * Vietnamese spending verbs that link a keyword-bearing segment (no amount)
 * with an adjacent amount-bearing segment.
 */
const CROSS_SEGMENT_CONNECTORS = ["hết", "tốn", "mất", "trả", "chi", "xài", "tiêu"];

/**
 * Checks whether a segment's text contains at least one recognized cross-segment
 * connector verb.
 */
function hasConnectorVerb(text: string): boolean {
  const lower = text.toLowerCase();
  return CROSS_SEGMENT_CONNECTORS.some((verb) => lower.includes(verb));
}

// --- Contextual pattern matching ---

/**
 * Emoji/symbol-to-category mapping for contextual confidence.
 * Used as a fallback when keyword matching fails but an emoji provides
 * a strong single-category signal.
 */
const CONTEXTUAL_PATTERNS: [string, string[]][] = [
  ["Ăn uống", ["🍜", "🍚", "🥗", "🍺", "🍻", "🍕", "🍔", "☕", "🧋", "🍲"]],
  ["Di chuyển", ["⛽", "🚗", "🚕", "🏍", "🚌", "✈️", "🚂"]],
  ["Mua sắm", ["🛍", "👗", "👟", "🎒", "💄"]],
  ["Giải trí", ["🎬", "🎮", "🎵", "🎤", "🎭"]],
  ["Sức khỏe", ["💊", "🏥", "🩺", "💉"]],
  ["Giáo dục", ["📚", "✏️", "🎓"]],
  ["Con cái", ["👶", "🍼", "🧒"]],
];

/**
 * Detects a category based on contextual emoji/symbol indicators in the text.
 * Returns the category name if exactly ONE category's patterns match.
 * Returns null if ZERO categories match (no emoji found).
 * Returns null if MULTIPLE categories match (ambiguous → escalate to AI).
 */
export function detectContextualCategory(text: string): string | null {
  const matchedCategories: string[] = [];

  for (const [category, emojis] of CONTEXTUAL_PATTERNS) {
    if (emojis.some((emoji) => text.includes(emoji))) {
      matchedCategories.push(category);
    }
  }

  if (matchedCategories.length === 1) {
    return matchedCategories[0];
  }

  return null;
}

// --- Amount parsing ---

// Standard units: 50k, 1tr, 30 nghìn, 2 triệu
const AMOUNT_REGEX = /(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu)/i;

// Vietnamese slang units: 1 xị = 100k, 1 chai/củ/quả = 1M, 1 tỏi = 1B
const SLANG_REGEX = /(\d+(?:[.,]\d+)?)\s*(xị|lít|lốp|chai|củ|quả|tỏi)/i;

// Fallback: bare number >= 1000 (e.g. "50000") without unit
const BARE_AMOUNT_REGEX = /(?<!\d)(\d{4,})(?!\s*(?:ngày|hôm|tuần|tháng|năm))/;

/**
 * Normalize slang units to VND.
 *
 * | Slang         | Value          |
 * |---------------|----------------|
 * | xị            | 100,000        |
 * | lít / lốp     | 100,000        |
 * | chai / củ / quả | 1,000,000    |
 * | tỏi           | 1,000,000,000  |
 */
function normalizeSlang(rawNumber: string, unit: string): number {
  const value = parseFloat(rawNumber.replace(",", "."));
  const u = unit.toLowerCase();

  if (u === "xị" || u === "lít" || u === "lốp") {
    return value * 100_000;
  }
  if (u === "chai" || u === "củ" || u === "quả") {
    return value * 1_000_000;
  }
  if (u === "tỏi") {
    return value * 1_000_000_000;
  }
  return value;
}

function normalizeAmount(rawNumber: string, unit: string): number {
  const value = parseFloat(rawNumber.replace(",", "."));
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

export function detectCategory(text: string): string | null {
  const lower = text.toLowerCase();
  let bestCategory: string | null = null;
  let bestLength = 0;

  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    for (const kw of keywords) {
      if (kw.length > bestLength && lower.includes(kw)) {
        bestLength = kw.length;
        bestCategory = category;
      }
    }
  }

  return bestCategory;
}

/**
 * Extract amount from text. Tries in order:
 * 1. Standard unit (50k, 1tr, 30 nghìn)
 * 2. Slang unit (5 xị, 2 chai, 1 tỏi)
 * 3. Bare number >= 1000 (50000)
 */
export function extractAmount(text: string): number | null {
  // 1. Standard units
  const stdMatch = text.match(AMOUNT_REGEX);
  if (stdMatch) {
    return normalizeAmount(stdMatch[1], stdMatch[2]);
  }

  // 2. Slang units
  const slangMatch = text.match(SLANG_REGEX);
  if (slangMatch) {
    return normalizeSlang(slangMatch[1], slangMatch[2]);
  }

  // 3. Bare number >= 1000
  const bareMatch = text.match(BARE_AMOUNT_REGEX);
  if (bareMatch) {
    return parseFloat(bareMatch[1]);
  }

  return null;
}

/**
 * Parse a single segment (one expense item) into a ParsedExpense.
 *
 * Pipeline:
 * 1. Extract amount from ORIGINAL text (normalization does not affect amounts)
 * 2. Preprocess a copy: lowercase → abbreviation expansion → spelling normalization
 * 3. Run keyword matching on normalized text first (priority)
 * 4. If normalization didn't help → fall back to expanded text (Req 3.5)
 * 5. If no keyword → try contextual emoji matching on original text
 * 6. If neither → "Khác" with confident=false
 * 7. Note field always contains original text.trim()
 * 8. Date detection uses original text
 */
function parseSingle(text: string, sharedDate?: Date): (ParsedExpense & { confident: boolean }) | null {
  const amount = extractAmount(text);
  if (!amount || amount <= 0) return null;

  const lowered = text.toLowerCase();
  const expanded = expandAbbreviations(lowered);
  const normalized = normalizeSpelling(expanded);

  // Keyword matching: normalized first, fall back to expanded (Req 3.5)
  const keywordCategory = detectCategory(normalized) ?? detectCategory(expanded);

  let category: string;
  let confident: boolean;

  if (keywordCategory !== null) {
    category = keywordCategory;
    confident = true;
  } else {
    const contextualCategory = detectContextualCategory(text);
    if (contextualCategory !== null) {
      category = contextualCategory;
      confident = true;
    } else {
      category = "Khác";
      confident = false;
    }
  }

  const date = detectDate(text) ?? sharedDate;

  return {
    amount,
    category,
    note: text.trim(),
    confident,
    date,
  };
}

/**
 * Splits a message into segments by comma (only when NOT inside a number like 1,5),
 * semicolon, or newline.
 */
function splitSegments(text: string): string[] {
  const segments = text
    .split(/[;\n]+/)
    .flatMap((part) => part.split(/,(?!\d)/))
    .map((s) => s.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments : [text];
}

/**
 * Combines adjacent segments where one has a keyword (no amount) and
 * the next has an amount (with a connector verb). Uses max 1 look-ahead.
 *
 * Strategy: operates on raw segment strings BEFORE parseSingle, merging
 * text so that parseSingle receives a combined segment with both keyword
 * and amount.
 *
 * Returns the merged segment list (some segments may be combined).
 */
function combineAdjacentSegments(segments: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < segments.length) {
    const current = segments[i];
    const currentAmount = extractAmount(current);
    const currentLowered = current.toLowerCase();
    const currentExpanded = expandAbbreviations(currentLowered);
    const currentNormalized = normalizeSpelling(currentExpanded);
    const currentHasKeyword = detectCategory(currentNormalized) !== null || detectCategory(currentExpanded) !== null;

    // Keyword-bearing segment with no amount → look ahead
    if (currentHasKeyword && currentAmount === null && i + 1 < segments.length) {
      const next = segments[i + 1];
      const nextAmount = extractAmount(next);
      const nextLowered = next.toLowerCase();
      const nextExpanded = expandAbbreviations(nextLowered);
      const nextNormalized = normalizeSpelling(nextExpanded);
      const nextHasKeyword = detectCategory(nextNormalized) !== null || detectCategory(nextExpanded) !== null;

      // Next segment has amount, no keyword of its own, and has a connector verb
      if (nextAmount !== null && !nextHasKeyword && hasConnectorVerb(next)) {
        result.push(current + " " + next);
        i += 2;
        continue;
      }
    }

    result.push(current);
    i++;
  }

  return result;
}

/**
 * Keyword-based parser for Vietnamese expense messages.
 * Supports:
 * - Standard units: k, nghìn, tr, triệu
 * - Slang units: xị (100k), lít/lốp (100k), chai/củ/quả (1M), tỏi (1B)
 * - Multi-transaction messages separated by commas
 * - Date detection: "hôm qua", "X ngày trước", "tuần trước", etc.
 * - Cross-segment combination: keyword + connector verb + amount
 */
@Injectable()
export class RegexParser implements Parser {
  parse(text: string): ParsedExpense[] {
    const sharedDate = detectDate(text);
    const segments = splitSegments(text);
    const combinedSegments = combineAdjacentSegments(segments);
    const results: ParsedExpense[] = [];

    for (const segment of combinedSegments) {
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
    const combinedSegments = combineAdjacentSegments(segments);
    const results: (ParsedExpense & { confident: boolean })[] = [];

    for (const segment of combinedSegments) {
      const parsed = parseSingle(segment, sharedDate);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  }
}
