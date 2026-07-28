import { RegexParser } from "../../src/infrastructure/parsers/RegexParser";

describe("RegexParser - Compound Patterns & Cross-Segment Combination", () => {
  let parser: RegexParser;

  beforeEach(() => {
    parser = new RegexParser();
  });

  describe("Cross-segment with connector verbs", () => {
    it("đi ăn, hết 200k → Ăn uống, 200k, confident", () => {
      const results = parser.parseWithConfidence("đi ăn, hết 200k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].amount).toBe(200_000);
      expect(results[0].confident).toBe(true);
    });

    it("connector: hết - đi chợ, hết 100k", () => {
      const results = parser.parseWithConfidence("đi chợ, hết 100k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].amount).toBe(100_000);
      expect(results[0].confident).toBe(true);
    });

    it("connector: tốn - mua giày, tốn 500k", () => {
      const results = parser.parseWithConfidence("mua giày, tốn 500k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Mua sắm");
      expect(results[0].amount).toBe(500_000);
      expect(results[0].confident).toBe(true);
    });

    it("connector: mất - đổ xăng, mất 200k", () => {
      const results = parser.parseWithConfidence("đổ xăng, mất 200k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Di chuyển");
      expect(results[0].amount).toBe(200_000);
      expect(results[0].confident).toBe(true);
    });

    it("connector: trả - thuê nhà, trả 5tr", () => {
      const results = parser.parseWithConfidence("thuê nhà, trả 5tr");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Nhà ở");
      expect(results[0].amount).toBe(5_000_000);
      expect(results[0].confident).toBe(true);
    });

    it("connector: chi - vé phim, chi 100k", () => {
      const results = parser.parseWithConfidence("vé phim, chi 100k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Giải trí");
      expect(results[0].amount).toBe(100_000);
      expect(results[0].confident).toBe(true);
    });

    it("connector: xài - cafe, xài 50k", () => {
      const results = parser.parseWithConfidence("cafe, xài 50k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].amount).toBe(50_000);
      expect(results[0].confident).toBe(true);
    });

    it("connector: tiêu - grab, tiêu 30k", () => {
      const results = parser.parseWithConfidence("grab, tiêu 30k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Di chuyển");
      expect(results[0].amount).toBe(30_000);
      expect(results[0].confident).toBe(true);
    });
  });

  describe("No-connector rejection", () => {
    it("đi ăn, 200k → segments NOT combined without connector", () => {
      const results = parser.parseWithConfidence("đi ăn, 200k");
      const amountSegment = results.find((r) => r.amount === 200_000);
      expect(amountSegment).toBeDefined();
      expect(amountSegment!.category).toBe("Khác");
      expect(amountSegment!.confident).toBe(false);
    });
  });

  describe("Amount-first patterns (single segment)", () => {
    it("200k ăn trưa → Ăn uống, 200k", () => {
      const results = parser.parseWithConfidence("200k ăn trưa");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].amount).toBe(200_000);
      expect(results[0].confident).toBe(true);
    });

    it("50k grab → Di chuyển, 50k", () => {
      const results = parser.parseWithConfidence("50k grab");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Di chuyển");
      expect(results[0].amount).toBe(50_000);
      expect(results[0].confident).toBe(true);
    });

    it("1tr thuê nhà → Nhà ở, 1,000,000", () => {
      const results = parser.parseWithConfidence("1tr thuê nhà");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Nhà ở");
      expect(results[0].amount).toBe(1_000_000);
      expect(results[0].confident).toBe(true);
    });
  });

  describe("Multi-segment look-ahead boundary", () => {
    it("only combines 1 segment ahead, not further", () => {
      // "đi ăn" (keyword, no amount) → looks 1 ahead at "mua giày" (keyword, no amount) → no combine
      // "mua giày" (keyword, no amount) → looks 1 ahead at "hết 200k" (amount + connector) → combine
      // Result: "mua giày" + "hết 200k" → Mua sắm 200k
      const results = parser.parseWithConfidence("đi ăn, mua giày, hết 200k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Mua sắm");
      expect(results[0].amount).toBe(200_000);
    });
  });

  describe("English keyword mappings", () => {
    it("lunch 50k → Ăn uống", () => {
      const results = parser.parseWithConfidence("lunch 50k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].confident).toBe(true);
    });

    it("dinner 100k → Ăn uống", () => {
      const results = parser.parseWithConfidence("dinner 100k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].confident).toBe(true);
    });

    it("gym 100k → Sức khỏe", () => {
      const results = parser.parseWithConfidence("gym 100k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Sức khỏe");
      expect(results[0].confident).toBe(true);
    });

    it("parking 30k → Di chuyển", () => {
      const results = parser.parseWithConfidence("parking 30k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Di chuyển");
      expect(results[0].confident).toBe(true);
    });

    it("uber 40k → Di chuyển", () => {
      const results = parser.parseWithConfidence("uber 40k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Di chuyển");
      expect(results[0].confident).toBe(true);
    });

    it("rent 5tr → Nhà ở", () => {
      const results = parser.parseWithConfidence("rent 5tr");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Nhà ở");
      expect(results[0].confident).toBe(true);
    });

    it("shopping 200k → Mua sắm", () => {
      const results = parser.parseWithConfidence("shopping 200k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Mua sắm");
      expect(results[0].confident).toBe(true);
    });

    it("movie 80k → Giải trí", () => {
      const results = parser.parseWithConfidence("movie 80k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Giải trí");
      expect(results[0].confident).toBe(true);
    });

    it("electric 500k → Tiện ích", () => {
      const results = parser.parseWithConfidence("electric 500k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Tiện ích");
      expect(results[0].confident).toBe(true);
    });

    it("water 100k → Tiện ích", () => {
      const results = parser.parseWithConfidence("water 100k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Tiện ích");
      expect(results[0].confident).toBe(true);
    });
  });

  describe("Category priority ordering (Vietnamese over English)", () => {
    it("Vietnamese keyword takes priority over English in same segment", () => {
      const results = parser.parseWithConfidence("phở lunch 50k");
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].confident).toBe(true);
    });

    it("longest keyword wins when categories differ", () => {
      // "shopping" (8 chars) → Mua sắm beats "grab" (4 chars) → Di chuyển
      const results = parser.parseWithConfidence("grab shopping 50k");
      expect(results[0].category).toBe("Mua sắm");
      expect(results[0].confident).toBe(true);
    });

    it("longest keyword wins: multi-word keyword beats shorter", () => {
      // "thuê nhà" (8 chars) → Nhà ở beats "electric" (8 chars) → Tiện ích
      // When tied on length, first match found wins (Nhà ở checked before Tiện ích)
      const results = parser.parseWithConfidence("thuê nhà electric 300k");
      expect(results[0].category).toBe("Nhà ở");
      expect(results[0].confident).toBe(true);
    });
  });
});
