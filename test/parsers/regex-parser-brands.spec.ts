import { RegexParser, detectBrand, resolveCategory, detectCategory } from "../../src/infrastructure/parsers/RegexParser";
import { CATEGORIES } from "../../src/domain/constants/categories";

describe("RegexParser — brand recognition", () => {
  let parser: RegexParser;

  beforeEach(() => {
    parser = new RegexParser();
  });

  /** Helper: parse a single-expense message and return its category. */
  const categoryOf = (text: string): string | undefined => parser.parse(text)[0]?.category;

  describe("Ăn uống brands", () => {
    const brands: [string, string][] = [
      ["kfc 120k", "KFC"],
      ["lotteria 95k", "Lotteria"],
      ["jollibee 110k", "Jollibee"],
      ["pizza hut 250k", "Pizza Hut"],
      ["pizza 4p's 450k", "Pizza 4P's"],
      ["phúc long 65k", "Phúc Long (with diacritics)"],
      ["phuc long 65k", "Phuc Long (without diacritics)"],
      ["highlands 55k", "Highlands"],
      ["highlands coffee 55k", "Highlands Coffee"],
      ["starbucks 95k", "Starbucks"],
      ["the coffee house 60k", "The Coffee House"],
      ["katinat 55k", "Katinat"],
      ["trung nguyên 40k", "Trung Nguyên"],
      ["cộng cà phê 45k", "Cộng Cà Phê"],
      ["phê la 50k", "Phê La"],
      ["mixue 25k", "Mixue"],
      ["gong cha 50k", "Gong Cha"],
      ["koi thé 55k", "Koi Thé"],
      ["tocotoco 40k", "TocoToco"],
      ["ding tea 45k", "Ding Tea"],
      ["haidilao 800k", "Haidilao"],
      ["hai di lao 800k", "Hai Di Lao (spaced)"],
      ["kichi kichi 350k", "Kichi Kichi"],
      ["gogi house 500k", "Gogi House"],
      ["manwah 450k", "Manwah"],
      ["sumo bbq 400k", "Sumo BBQ"],
      ["king bbq 380k", "King BBQ"],
      ["món huế 120k", "Món Huế"],
      ["phở 24 70k", "Phở 24"],
      ["tous les jours 85k", "Tous Les Jours"],
      ["paris baguette 90k", "Paris Baguette"],
      ["baskin robbins 120k", "Baskin Robbins"],
      ["circle k 45k", "Circle K"],
      ["gs25 30k", "GS25"],
      ["familymart 35k", "FamilyMart"],
      ["ministop 28k", "Ministop"],
      ["winmart 320k", "WinMart"],
      ["bách hoá xanh 250k", "Bách Hoá Xanh"],
      ["bach hoa xanh 250k", "Bach Hoa Xanh (no diacritics)"],
      ["big c 450k", "Big C"],
      ["lotte mart 300k", "Lotte Mart"],
      ["aeon 500k", "Aeon"],
      ["grabfood 85k", "GrabFood"],
      ["shopeefood 75k", "ShopeeFood"],
      ["baemin 65k", "Baemin"],
    ];

    for (const [message, label] of brands) {
      it(`"${message}" → Ăn uống (${label})`, () => {
        expect(categoryOf(message)).toBe("Ăn uống");
      });
    }
  });

  describe("brands in other categories", () => {
    const cases: [string, string][] = [
      // Di chuyển
      ["xanh sm 45k", "Di chuyển"],
      ["vinasun 120k", "Di chuyển"],
      ["mai linh 95k", "Di chuyển"],
      ["vietjet 1tr", "Di chuyển"],
      ["phương trang 250k", "Di chuyển"],
      ["petrolimex 500k", "Di chuyển"],
      // Mua sắm
      ["shopee 350k", "Mua sắm"],
      ["lazada 200k", "Mua sắm"],
      ["uniqlo 590k", "Mua sắm"],
      ["zara 890k", "Mua sắm"],
      ["nike 1tr2", "Mua sắm"],
      ["watsons 180k", "Mua sắm"],
      ["hasaki 250k", "Mua sắm"],
      ["fpt shop 2tr", "Mua sắm"],
      ["điện máy xanh 5tr", "Mua sắm"],
      // Giải trí
      ["cgv 120k", "Giải trí"],
      ["galaxy cinema 100k", "Giải trí"],
      ["steam 300k", "Giải trí"],
      ["garena 100k", "Giải trí"],
      ["vinwonders 800k", "Giải trí"],
      // Sức khỏe
      ["pharmacity 95k", "Sức khỏe"],
      ["long châu 120k", "Sức khỏe"],
      ["vinmec 2tr", "Sức khỏe"],
      ["california fitness 800k", "Sức khỏe"],
      // Internet
      ["viettel 200k", "Internet"],
      ["mobifone 100k", "Internet"],
      ["fpt telecom 250k", "Internet"],
      // Giáo dục
      ["duolingo 200k", "Giáo dục"],
      ["vus 5tr", "Giáo dục"],
      // Nhà ở
      ["ikea 1tr5", "Nhà ở"],
      ["jysk 900k", "Nhà ở"],
      // Chi phí cố định
      ["prudential 2tr", "Chi phí cố định"],
      ["manulife 3tr", "Chi phí cố định"],
      // Tiết kiệm & Đầu tư
      ["ssi 5tr", "Tiết kiệm & Đầu tư"],
      ["vndirect 10tr", "Tiết kiệm & Đầu tư"],
      ["finhay 1tr", "Tiết kiệm & Đầu tư"],
    ];

    for (const [message, expected] of cases) {
      it(`"${message}" → ${expected}`, () => {
        expect(categoryOf(message)).toBe(expected);
      });
    }
  });

  describe("longest-match disambiguation", () => {
    it('"lotte" alone → Ăn uống (Lotteria / Lotte Mart)', () => {
      expect(categoryOf("lotte 150k")).toBe("Ăn uống");
    });

    it('"lotte mart" → Ăn uống (groceries)', () => {
      expect(categoryOf("lotte mart 300k")).toBe("Ăn uống");
    });

    it('"lotte cinema" → Giải trí (longer brand wins over "lotte")', () => {
      expect(categoryOf("lotte cinema 120k")).toBe("Giải trí");
    });

    it('"grab" → Di chuyển (keyword)', () => {
      expect(categoryOf("grab 30k")).toBe("Di chuyển");
    });

    it('"grabfood" → Ăn uống (longer brand wins over "grab" keyword)', () => {
      expect(categoryOf("grabfood 85k")).toBe("Ăn uống");
    });

    it('"grab food" (spaced) → Ăn uống', () => {
      expect(categoryOf("grab food 85k")).toBe("Ăn uống");
    });
  });

  describe("spelling normalization must not mangle Latin brand names", () => {
    // normalizeSpelling rewrites word-initial f→ph, z→gi, w→qu.
    // Brands are matched against RAW text, so these must still resolve.
    const cases: [string, string][] = [
      ["fpt shop 2tr", "Mua sắm"],      // would become "phpt shop"
      ["fpt telecom 250k", "Internet"], // would become "phpt telecom"
      ["familymart 35k", "Ăn uống"],    // would become "phamilymart"
      ["fanny 60k", "Ăn uống"],         // would become "phanny"
      ["zara 890k", "Mua sắm"],         // would become "giara"
      ["watsons 180k", "Mua sắm"],      // would become "quatsons"
      ["wrap & roll 150k", "Ăn uống"],  // would become "qurap"
    ];

    for (const [message, expected] of cases) {
      it(`"${message}" → ${expected}`, () => {
        expect(categoryOf(message)).toBe(expected);
      });
    }
  });

  describe("brands combined with normal text", () => {
    it("brand with a leading verb", () => {
      expect(categoryOf("ăn kfc 120k")).toBe("Ăn uống");
    });

    it("brand with a date reference", () => {
      const result = parser.parse("hôm qua phúc long 65k");
      expect(result[0].category).toBe("Ăn uống");
      expect(result[0].date).toBeInstanceOf(Date);
    });

    it("multiple brands in one message", () => {
      const result = parser.parse("kfc 120k, phúc long 65k, grab 30k");

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ amount: 120000, category: "Ăn uống" });
      expect(result[1]).toMatchObject({ amount: 65000, category: "Ăn uống" });
      expect(result[2]).toMatchObject({ amount: 30000, category: "Di chuyển" });
    });

    it("brand names are case-insensitive", () => {
      expect(categoryOf("KFC 120k")).toBe("Ăn uống");
      expect(categoryOf("Highlands Coffee 55k")).toBe("Ăn uống");
      expect(categoryOf("HAIDILAO 800k")).toBe("Ăn uống");
    });
  });

  describe("parseWithConfidence marks brand matches as confident", () => {
    it("brand match does not escalate to AI", () => {
      const results = parser.parseWithConfidence("kfc 120k");
      expect(results[0].confident).toBe(true);
    });

    it("unknown merchant is still not confident", () => {
      const results = parser.parseWithConfidence("xyzabc 120k");
      expect(results[0].confident).toBe(false);
      expect(results[0].category).toBe("Khác");
    });
  });

  describe("detectBrand / resolveCategory helpers", () => {
    it("detectBrand returns null for non-brand text", () => {
      expect(detectBrand("ăn trưa")).toBeNull();
    });

    it("detectBrand recognises a bare brand name", () => {
      expect(detectBrand("kfc")).toBe("Ăn uống");
    });

    it("detectCategory (keyword-only) does NOT match brands", () => {
      expect(detectCategory("kfc")).toBeNull();
    });

    it("resolveCategory handles brands and keywords", () => {
      expect(resolveCategory("kfc")).toBe("Ăn uống");
      expect(resolveCategory("ăn uống")).toBe("Ăn uống");
      expect(resolveCategory("hoàn toàn không liên quan")).toBeNull();
    });

    it("every brand maps to a canonical category", () => {
      const samples = ["kfc", "shopee", "cgv", "pharmacity", "viettel", "ssi", "ikea", "prudential", "duolingo", "xanh sm"];
      for (const brand of samples) {
        const category = detectBrand(brand);
        expect(category).not.toBeNull();
        expect(CATEGORIES).toContain(category as (typeof CATEGORIES)[number]);
      }
    });
  });
});
