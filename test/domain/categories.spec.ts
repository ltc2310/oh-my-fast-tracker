import {
  CATEGORIES,
  FALLBACK_CATEGORY,
  isValidCategory,
  normalizeCategory,
} from "../../src/domain/constants/categories";
import { isIncomeCategory, INCOME_CATEGORIES } from "../../src/domain/constants/income-categories";

describe("Category constants", () => {
  it("contains exactly 14 categories", () => {
    expect(CATEGORIES).toHaveLength(14);
  });

  it("has no duplicates", () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
  });

  it("every income category is also a valid category", () => {
    // Guards against the "Tiết kiệm" vs "Tiết kiệm & Đầu tư" mismatch that caused
    // savings to be stored as positive expenses.
    for (const income of INCOME_CATEGORIES) {
      expect(isValidCategory(income)).toBe(true);
    }
  });

  describe("isValidCategory", () => {
    it("accepts canonical names", () => {
      expect(isValidCategory("Ăn uống")).toBe(true);
      expect(isValidCategory("Tiết kiệm & Đầu tư")).toBe(true);
    });

    it("rejects near-misses", () => {
      expect(isValidCategory("Tiết kiệm")).toBe(false);
      expect(isValidCategory("ăn uống")).toBe(false);
      expect(isValidCategory("Food")).toBe(false);
      expect(isValidCategory("")).toBe(false);
    });
  });

  describe("normalizeCategory", () => {
    it("passes canonical names through unchanged", () => {
      for (const category of CATEGORIES) {
        expect(normalizeCategory(category)).toBe(category);
      }
    });

    it('maps "Tiết kiệm" → "Tiết kiệm & Đầu tư" (the savings sign bug)', () => {
      expect(normalizeCategory("Tiết kiệm")).toBe("Tiết kiệm & Đầu tư");
      expect(normalizeCategory("tiết kiệm")).toBe("Tiết kiệm & Đầu tư");
      expect(normalizeCategory("Đầu tư")).toBe("Tiết kiệm & Đầu tư");
      expect(normalizeCategory("savings")).toBe("Tiết kiệm & Đầu tư");
    });

    it("normalized savings is correctly detected as income", () => {
      const normalized = normalizeCategory("Tiết kiệm");
      expect(isIncomeCategory(normalized)).toBe(true);
    });

    it("maps English aliases", () => {
      expect(normalizeCategory("food")).toBe("Ăn uống");
      expect(normalizeCategory("transport")).toBe("Di chuyển");
      expect(normalizeCategory("shopping")).toBe("Mua sắm");
      expect(normalizeCategory("income")).toBe("Thu nhập");
    });

    it("maps unaccented Vietnamese aliases", () => {
      expect(normalizeCategory("an uong")).toBe("Ăn uống");
      expect(normalizeCategory("di chuyen")).toBe("Di chuyển");
      expect(normalizeCategory("suc khoe")).toBe("Sức khỏe");
      expect(normalizeCategory("sức khoẻ")).toBe("Sức khỏe");
    });

    it("trims and collapses whitespace", () => {
      expect(normalizeCategory("  Ăn uống  ")).toBe("Ăn uống");
      expect(normalizeCategory("tiết    kiệm")).toBe("Tiết kiệm & Đầu tư");
    });

    it("falls back for hallucinated categories", () => {
      expect(normalizeCategory("Chi tiêu ngẫu nhiên")).toBe(FALLBACK_CATEGORY);
      expect(normalizeCategory("SomethingMadeUp")).toBe(FALLBACK_CATEGORY);
    });

    it("falls back for empty / nullish input", () => {
      expect(normalizeCategory("")).toBe(FALLBACK_CATEGORY);
      expect(normalizeCategory(null)).toBe(FALLBACK_CATEGORY);
      expect(normalizeCategory(undefined)).toBe(FALLBACK_CATEGORY);
    });

    it("always returns a valid category, whatever the input", () => {
      const inputs = ["", "   ", "xyz", "Tiết kiệm", "FOOD", "🍜", "null", "0"];
      for (const input of inputs) {
        expect(isValidCategory(normalizeCategory(input))).toBe(true);
      }
    });
  });
});
