import { RegexParser, detectDate } from "../../src/infrastructure/parsers/RegexParser";

describe("RegexParser", () => {
  let parser: RegexParser;

  beforeEach(() => {
    parser = new RegexParser();
  });

  describe("Amount parsing", () => {
    it("should parse amount with k suffix", () => {
      const results = parser.parse("ăn trưa 50k");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(50_000);
    });

    it("should parse amount with tr suffix", () => {
      const results = parser.parse("thuê nhà 5tr");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(5_000_000);
    });

    it("should parse amount with nghìn suffix", () => {
      const results = parser.parse("cafe 30 nghìn");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(30_000);
    });

    it("should parse amount with triệu suffix", () => {
      const results = parser.parse("thuê nhà 3 triệu");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(3_000_000);
    });

    it("should parse decimal amounts", () => {
      const results = parser.parse("xăng 1,5tr");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(1_500_000);
    });

    it("should return empty for text without amount", () => {
      const results = parser.parse("hello world");
      expect(results).toHaveLength(0);
    });

    it("should return empty for zero amount", () => {
      const results = parser.parse("ăn 0k");
      expect(results).toHaveLength(0);
    });
  });

  describe("Category detection", () => {
    it("should detect Ăn uống", () => {
      const results = parser.parse("ăn trưa 50k");
      expect(results[0].category).toBe("Ăn uống");
    });

    it("should detect Ăn uống from chợ keyword", () => {
      const results = parser.parse("đi chợ 100k");
      expect(results[0].category).toBe("Ăn uống");
    });

    it("should detect Di chuyển", () => {
      const results = parser.parse("đổ xăng 200k");
      expect(results[0].category).toBe("Di chuyển");
    });

    it("should detect Di chuyển from rửa xe", () => {
      const results = parser.parse("rửa xe 30k");
      expect(results[0].category).toBe("Di chuyển");
    });

    it("should detect Di chuyển from gửi xe", () => {
      const results = parser.parse("gửi xe 10k");
      expect(results[0].category).toBe("Di chuyển");
    });

    it("should detect Mua sắm", () => {
      const results = parser.parse("mua giày 500k");
      expect(results[0].category).toBe("Mua sắm");
    });

    it("should detect Nhà ở", () => {
      const results = parser.parse("thuê nhà 5tr");
      expect(results[0].category).toBe("Nhà ở");
    });

    it("should detect Tiện ích", () => {
      const results = parser.parse("tiền điện 300k");
      expect(results[0].category).toBe("Tiện ích");
    });

    it("should detect Internet", () => {
      const results = parser.parse("wifi 200k");
      expect(results[0].category).toBe("Internet");
    });

    it("should detect Sức khỏe", () => {
      const results = parser.parse("thuốc 150k");
      expect(results[0].category).toBe("Sức khỏe");
    });

    it("should detect Giáo dục", () => {
      const results = parser.parse("sách giáo khoa 80k");
      expect(results[0].category).toBe("Giáo dục");
    });

    it("should detect Giải trí", () => {
      const results = parser.parse("vé phim 100k");
      expect(results[0].category).toBe("Giải trí");
    });

    it("should detect Con cái", () => {
      const results = parser.parse("bỉm cho bé 200k");
      expect(results[0].category).toBe("Con cái");
    });

    it("should detect Chi phí cố định", () => {
      const results = parser.parse("bảo hiểm 1tr");
      expect(results[0].category).toBe("Chi phí cố định");
    });

    it("should detect Thu nhập", () => {
      const results = parser.parse("lương 15tr");
      expect(results[0].category).toBe("Thu nhập");
    });

    it("should fallback to Khác for unknown text", () => {
      const results = parser.parse("xyz 50k");
      expect(results[0].category).toBe("Khác");
    });

    it("should prefer longer keyword match (ăn sáng over ăn)", () => {
      const results = parser.parse("ăn sáng 30k");
      expect(results[0].category).toBe("Ăn uống");
    });
  });

  describe("Multi-transaction parsing", () => {
    it("should parse comma-separated transactions", () => {
      const results = parser.parse("ăn sáng 70k, rửa xe 30k, gửi xe 10k");
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual(expect.objectContaining({ amount: 70_000, category: "Ăn uống" }));
      expect(results[1]).toEqual(expect.objectContaining({ amount: 30_000, category: "Di chuyển" }));
      expect(results[2]).toEqual(expect.objectContaining({ amount: 10_000, category: "Di chuyển" }));
    });

    it("should parse semicolon-separated transactions", () => {
      const results = parser.parse("cafe 30k; grab 25k");
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(expect.objectContaining({ amount: 30_000, category: "Ăn uống" }));
      expect(results[1]).toEqual(expect.objectContaining({ amount: 25_000, category: "Di chuyển" }));
    });

    it("should parse newline-separated transactions", () => {
      const results = parser.parse("ăn trưa 50k\ngrab 20k");
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(expect.objectContaining({ amount: 50_000, category: "Ăn uống" }));
      expect(results[1]).toEqual(expect.objectContaining({ amount: 20_000, category: "Di chuyển" }));
    });

    it("should handle single transaction (no separator)", () => {
      const results = parser.parse("ăn trưa 50k");
      expect(results).toHaveLength(1);
    });

    it("should skip segments without amounts", () => {
      const results = parser.parse("ăn trưa 50k, hello world, grab 20k");
      expect(results).toHaveLength(2);
    });
  });

  describe("parseWithConfidence", () => {
    it("should mark known categories as confident", () => {
      const results = parser.parseWithConfidence("ăn trưa 50k");
      expect(results[0].confident).toBe(true);
    });

    it("should mark unknown categories as not confident", () => {
      const results = parser.parseWithConfidence("xyz 50k");
      expect(results[0].confident).toBe(false);
      expect(results[0].category).toBe("Khác");
    });

    it("should handle multi-transaction with mixed confidence", () => {
      const results = parser.parseWithConfidence("ăn trưa 50k, random 20k");
      expect(results).toHaveLength(2);
      expect(results[0].confident).toBe(true);
      expect(results[1].confident).toBe(false);
    });
  });
});

describe("detectDate", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should detect 'hôm qua' as yesterday", () => {
    const date = detectDate("hôm qua đi chợ 100k");
    expect(date).toBeDefined();
    expect(date!.getDate()).toBe(26);
    expect(date!.getMonth()).toBe(6); // July = 6
  });

  it("should detect 'hôm kia' as 2 days ago", () => {
    const date = detectDate("hôm kia ăn trưa 50k");
    expect(date).toBeDefined();
    expect(date!.getDate()).toBe(25);
  });

  it("should detect '3 ngày trước'", () => {
    const date = detectDate("3 ngày trước mua sách 80k");
    expect(date).toBeDefined();
    expect(date!.getDate()).toBe(24);
  });

  it("should detect '7 ngày trước'", () => {
    const date = detectDate("7 ngày trước grab 30k");
    expect(date).toBeDefined();
    expect(date!.getDate()).toBe(20);
  });

  it("should detect '2 hôm trước'", () => {
    const date = detectDate("2 hôm trước cafe 25k");
    expect(date).toBeDefined();
    expect(date!.getDate()).toBe(25);
  });

  it("should detect 'tuần trước'", () => {
    const date = detectDate("tuần trước mua giày 500k");
    expect(date).toBeDefined();
    expect(date!.getDate()).toBe(20);
  });

  it("should detect 'tháng trước'", () => {
    const date = detectDate("tháng trước thuê nhà 5tr");
    expect(date).toBeDefined();
    expect(date!.getMonth()).toBe(5); // June = 5
  });

  it("should return undefined for today / no time reference", () => {
    const date = detectDate("ăn trưa 50k");
    expect(date).toBeUndefined();
  });

  it("should handle 'hq' abbreviation", () => {
    const date = detectDate("hq cafe 30k");
    expect(date).toBeDefined();
    expect(date!.getDate()).toBe(26);
  });
});

describe("RegexParser date integration", () => {
  let parser: RegexParser;

  beforeEach(() => {
    parser = new RegexParser();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should set date on parsed expense for 'hôm qua'", () => {
    const results = parser.parse("hôm qua ăn trưa 50k");
    expect(results).toHaveLength(1);
    expect(results[0].date).toBeDefined();
    expect(results[0].date!.getDate()).toBe(26);
  });

  it("should set date on parsed expense for '3 ngày trước'", () => {
    const results = parser.parse("3 ngày trước grab 20k");
    expect(results).toHaveLength(1);
    expect(results[0].date).toBeDefined();
    expect(results[0].date!.getDate()).toBe(24);
  });

  it("should not set date for today's expense", () => {
    const results = parser.parse("ăn trưa 50k");
    expect(results).toHaveLength(1);
    expect(results[0].date).toBeUndefined();
  });

  it("should apply shared date from full text to all segments", () => {
    const results = parser.parse("hôm qua ăn trưa 50k, grab 20k");
    expect(results).toHaveLength(2);
    expect(results[0].date!.getDate()).toBe(26);
    expect(results[1].date!.getDate()).toBe(26);
  });

  it("should detect 'tuần trước' across multi-transaction", () => {
    const results = parser.parse("tuần trước: cafe 30k, phở 45k");
    expect(results).toHaveLength(2);
    expect(results[0].date!.getDate()).toBe(20);
    expect(results[1].date!.getDate()).toBe(20);
  });
});

describe("RegexParser - Slang units", () => {
  let parser: RegexParser;

  beforeEach(() => {
    parser = new RegexParser();
  });

  describe("Xị (100k each)", () => {
    it("should parse 1 xị as 100,000", () => {
      const results = parser.parse("nhậu 1 xị");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(100_000);
    });

    it("should parse 5 xị as 500,000", () => {
      const results = parser.parse("nhậu 5 xị");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(500_000);
    });
  });

  describe("Lít / Lốp (100k each)", () => {
    it("should parse 1 lít as 100,000", () => {
      const results = parser.parse("nhậu 1 lít");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(100_000);
    });

    it("should parse 3 lốp as 300,000", () => {
      const results = parser.parse("ăn 3 lốp");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(300_000);
    });
  });

  describe("Chai / Củ / Quả (1M each)", () => {
    it("should parse 1 chai as 1,000,000", () => {
      const results = parser.parse("mua đồ 1 chai");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(1_000_000);
    });

    it("should parse 2 củ as 2,000,000", () => {
      const results = parser.parse("thuê nhà 2 củ");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(2_000_000);
    });

    it("should parse 5 quả as 5,000,000", () => {
      const results = parser.parse("mua giày 5 quả");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(5_000_000);
    });
  });

  describe("Tỏi (1B each)", () => {
    it("should parse 1 tỏi as 1,000,000,000", () => {
      const results = parser.parse("mua đất 1 tỏi");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(1_000_000_000);
    });
  });

  describe("Decimal slang", () => {
    it("should parse 1,5 củ as 1,500,000", () => {
      const results = parser.parse("sửa xe 1,5 củ");
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(1_500_000);
    });
  });
});

describe("RegexParser - Bug Condition: trà sữa miscategorized as Con cái", () => {
  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * Bug Condition Exploration Test:
   * "trà sữa" is incorrectly categorized as "Con cái" because keyword "sữa"
   * in "Con cái" (index 6) matches before "trà sữa" in "Ăn uống" (index 11).
   * Additionally, "ts" is not in ABBREVIATION_MAP so it doesn't expand to "trà sữa".
   *
   * These tests encode the EXPECTED (correct) behavior.
   * They will FAIL on unfixed code, proving the bug exists.
   */
  let parser: RegexParser;

  beforeEach(() => {
    parser = new RegexParser();
  });

  it('should categorize "trà sữa 50k" as "Ăn uống" (not "Con cái")', () => {
    const results = parser.parse("trà sữa 50k");
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Ăn uống");
  });

  it('should categorize "ts 30k" as "Ăn uống" via abbreviation expansion', () => {
    const results = parser.parse("ts 30k");
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Ăn uống");
  });

  it('should categorize "uống trà sữa hết 35k" as "Ăn uống" (not "Con cái")', () => {
    const results = parser.parse("uống trà sữa hết 35k");
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Ăn uống");
  });

  it('should return confident=true with category "Ăn uống" for "trà sữa 50k"', () => {
    const results = parser.parseWithConfidence("trà sữa 50k");
    expect(results).toHaveLength(1);
    expect(results[0].confident).toBe(true);
    expect(results[0].category).toBe("Ăn uống");
  });
});

describe("RegexParser - Preservation Property Tests: baseline behavior to preserve after fix", () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   *
   * Preservation property tests: these capture the current CORRECT behavior
   * that MUST be preserved after the "trà sữa" bug fix is applied.
   * All tests pass on unfixed code.
   */
  let parser: RegexParser;

  beforeEach(() => {
    parser = new RegexParser();
  });

  describe("Property 2a: 'sữa' alone (without 'trà sữa') maps to 'Ăn uống'; with 'con'/'cho con' maps to 'Con cái'", () => {
    /**
     * **Validates: Requirements 3.1, 3.2**
     *
     * Standalone "sữa" (without "trà sữa") categorizes as "Ăn uống".
     * Only when combined with "con"/"cho con" does it become "Con cái".
     */
    it("property: any text with 'sữa' alone (no 'trà sữa', no 'con') categorizes as 'Ăn uống'", () => {
      const fc = require("fast-check");

      // Generate text fragments that include "sữa" but never "trà sữa" and no "con" keyword
      const suaPrefixes = fc.constantFrom(
        "mua", "mua thêm", "đi mua", "cần mua", "cần", "tốn tiền", ""
      );
      const suaSuffixes = fc.constantFrom(
        "bột", "hộp", ""
      );
      const amounts = fc.constantFrom("50k", "100k", "200k", "30k", "150k", "80k", "1tr");

      const suaInputArb = fc.tuple(suaPrefixes, suaSuffixes, amounts).map(
        ([prefix, suffix, amount]: [string, string, string]) => {
          const parts = [prefix, "sữa", suffix, amount].filter(Boolean);
          return parts.join(" ");
        }
      );

      fc.assert(
        fc.property(suaInputArb, (input: string) => {
          // Ensure our generated input doesn't accidentally contain "trà sữa"
          if (input.toLowerCase().includes("trà sữa")) return true; // skip
          const results = parser.parse(input);
          if (results.length === 0) return true; // no amount parsed → skip
          return results[0].category === "Ăn uống";
        }),
        { numRuns: 200 }
      );
    });

    it("property: baby-item keywords (bỉm, tã, đồ chơi, trẻ em) categorize as 'Con cái'", () => {
      const fc = require("fast-check");

      const babyKeywords = fc.constantFrom("bỉm", "tã", "đồ chơi", "trẻ em", "em bé");
      const amounts = fc.constantFrom("50k", "100k", "200k", "150k", "300k");
      const prefixes = fc.constantFrom("cho bé", "cần thêm", "");

      const babyInputArb = fc.tuple(prefixes, babyKeywords, amounts).map(
        ([prefix, keyword, amount]: [string, string, string]) => {
          const parts = [prefix, keyword, amount].filter(Boolean);
          return parts.join(" ");
        }
      );

      fc.assert(
        fc.property(babyInputArb, (input: string) => {
          const results = parser.parse(input);
          if (results.length === 0) return true; // skip if no amount parsed
          return results[0].category === "Con cái";
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 2b: Existing abbreviations expansion and categorization unchanged", () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * For all existing abbreviations (cf, cp, dt, bv, st, ks, nt),
     * expansion and categorization remain unchanged.
     */
    it("property: existing abbreviations produce correct categories", () => {
      const fc = require("fast-check");

      // Map abbreviation → expected category (observed on unfixed code)
      const abbreviationExpected: [string, string][] = [
        ["cf", "Ăn uống"],     // cf → cà phê → Ăn uống
        ["cp", "Ăn uống"],     // cp → cà phê → Ăn uống
        ["dt", "Internet"],    // dt → điện thoại → Internet
        ["bv", "Sức khỏe"],   // bv → bệnh viện → Sức khỏe
        ["st", "Ăn uống"],    // st → siêu thị → Ăn uống
        ["nt", "Sức khỏe"],   // nt → nhà thuốc → matches "thuốc" → Sức khỏe
      ];

      const abbrevArb = fc.constantFrom(...abbreviationExpected);
      const amounts = fc.constantFrom("30k", "50k", "100k", "200k", "500k", "1tr");

      fc.assert(
        fc.property(abbrevArb, amounts, (
          [abbrev, expectedCategory]: [string, string],
          amount: string
        ) => {
          const input = `${abbrev} ${amount}`;
          const results = parser.parse(input);
          if (results.length === 0) return true;
          return results[0].category === expectedCategory;
        }),
        { numRuns: 100 }
      );
    });

    it("property: 'ks' abbreviation categorizes as 'Khác' (khách sạn not in category keywords)", () => {
      const fc = require("fast-check");

      const amounts = fc.constantFrom("100k", "200k", "500k", "1tr", "2tr");

      fc.assert(
        fc.property(amounts, (amount: string) => {
          const input = `ks ${amount}`;
          const results = parser.parseWithConfidence(input);
          if (results.length === 0) return true;
          return results[0].category === "Khác" && results[0].confident === false;
        }),
        { numRuns: 20 }
      );
    });
  });

  describe("Property 2c: Other category keywords remain correctly categorized", () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * For all other category keywords (cà phê, phở, cơm, xăng, grab, etc.),
     * detectCategory returns the same result as before.
     */
    it("property: 'Ăn uống' keywords categorize correctly", () => {
      const fc = require("fast-check");

      const foodKeywords = fc.constantFrom(
        "cà phê", "phở", "cơm", "bún", "lẩu", "nhậu",
        "trà đá", "bánh mì", "ăn trưa", "ăn sáng", "ăn tối"
      );
      const amounts = fc.constantFrom("30k", "50k", "100k", "200k");

      fc.assert(
        fc.property(foodKeywords, amounts, (keyword: string, amount: string) => {
          const input = `${keyword} ${amount}`;
          const results = parser.parse(input);
          if (results.length === 0) return true;
          return results[0].category === "Ăn uống";
        }),
        { numRuns: 100 }
      );
    });

    it("property: 'Di chuyển' keywords categorize correctly", () => {
      const fc = require("fast-check");

      const transportKeywords = fc.constantFrom(
        "xăng", "grab", "taxi", "rửa xe", "gửi xe", "đổ xăng"
      );
      const amounts = fc.constantFrom("20k", "50k", "100k", "200k");

      fc.assert(
        fc.property(transportKeywords, amounts, (keyword: string, amount: string) => {
          const input = `${keyword} ${amount}`;
          const results = parser.parse(input);
          if (results.length === 0) return true;
          return results[0].category === "Di chuyển";
        }),
        { numRuns: 100 }
      );
    });

    it("property: other category keywords produce expected categories", () => {
      const fc = require("fast-check");

      // Keyword → expected category (observed on unfixed code)
      const keywordCategoryPairs: [string, string][] = [
        ["thuê nhà", "Nhà ở"],
        ["tiền điện", "Tiện ích"],
        ["wifi", "Internet"],
        ["thuốc", "Sức khỏe"],
        ["sách", "Giáo dục"],
        ["vé phim", "Giải trí"],
        ["bảo hiểm", "Chi phí cố định"],
        ["lương", "Thu nhập"],
        ["mua giày", "Mua sắm"],
        ["tiết kiệm", "Tiết kiệm & Đầu tư"],
      ];

      const pairArb = fc.constantFrom(...keywordCategoryPairs);
      const amounts = fc.constantFrom("50k", "100k", "200k", "500k", "1tr");

      fc.assert(
        fc.property(pairArb, amounts, (
          [keyword, expectedCategory]: [string, string],
          amount: string
        ) => {
          const input = `${keyword} ${amount}`;
          const results = parser.parse(input);
          if (results.length === 0) return true;
          return results[0].category === expectedCategory;
        }),
        { numRuns: 100 }
      );
    });
  });

  // Concrete observation tests for documentation
  describe("Concrete observations (baseline)", () => {
    it('detectCategory("sữa 50k") → "Ăn uống"', () => {
      const results = parser.parse("sữa 50k");
      expect(results[0].category).toBe("Ăn uống");
    });

    it('detectCategory("sữa bỉm 100k") → "Con cái"', () => {
      const results = parser.parse("sữa bỉm 100k");
      expect(results[0].category).toBe("Con cái");
    });

    it('detectCategory("bỉm cho bé 200k") → "Con cái"', () => {
      const results = parser.parse("bỉm cho bé 200k");
      expect(results[0].category).toBe("Con cái");
    });

    it('detectCategory("tã 150k") → "Con cái"', () => {
      const results = parser.parse("tã 150k");
      expect(results[0].category).toBe("Con cái");
    });

    it('detectCategory("cà phê 30k") → "Ăn uống"', () => {
      const results = parser.parse("cà phê 30k");
      expect(results[0].category).toBe("Ăn uống");
    });

    it('detectCategory("phở 50k") → "Ăn uống"', () => {
      const results = parser.parse("phở 50k");
      expect(results[0].category).toBe("Ăn uống");
    });

    it('parser.parse("cf 30k") → category "Ăn uống"', () => {
      const results = parser.parse("cf 30k");
      expect(results[0].category).toBe("Ăn uống");
    });

    it('parser.parse("dt 500k") → category "Internet"', () => {
      const results = parser.parse("dt 500k");
      expect(results[0].category).toBe("Internet");
    });
  });
});

describe("RegexParser - Tiết kiệm & Đầu tư category", () => {
  let parser: RegexParser;

  beforeEach(() => {
    parser = new RegexParser();
  });

  it("should detect tiết kiệm", () => {
    const results = parser.parse("tiết kiệm 5tr");
    expect(results[0].category).toBe("Tiết kiệm & Đầu tư");
  });

  it("should detect đầu tư", () => {
    const results = parser.parse("đầu tư chứng khoán 10tr");
    expect(results[0].category).toBe("Tiết kiệm & Đầu tư");
  });

  it("should detect crypto", () => {
    const results = parser.parse("mua crypto 2 củ");
    expect(results[0].category).toBe("Tiết kiệm & Đầu tư");
  });

  it("should detect gửi tiết kiệm", () => {
    const results = parser.parse("gửi tiết kiệm 20tr");
    expect(results[0].category).toBe("Tiết kiệm & Đầu tư");
  });
});
