import { RegexParser, expandAbbreviations } from "../../src/infrastructure/parsers/RegexParser";

describe("RegexParser - Abbreviation Expansion", () => {
  let parser: RegexParser;

  beforeEach(() => {
    parser = new RegexParser();
  });

  describe("expandAbbreviations function", () => {
    it("should expand cf → cà phê", () => {
      expect(expandAbbreviations("cf 30k")).toBe("cà phê 30k");
    });

    it("should expand cp → cà phê", () => {
      expect(expandAbbreviations("cp 30k")).toBe("cà phê 30k");
    });

    it("should expand dt → điện thoại", () => {
      expect(expandAbbreviations("dt 500k")).toBe("điện thoại 500k");
    });

    it("should expand bv → bệnh viện", () => {
      expect(expandAbbreviations("bv 200k")).toBe("bệnh viện 200k");
    });

    it("should expand st → siêu thị", () => {
      expect(expandAbbreviations("st 100k")).toBe("siêu thị 100k");
    });

    it("should expand ks → khách sạn", () => {
      expect(expandAbbreviations("ks 1tr")).toBe("khách sạn 1tr");
    });

    it("should expand nt → nhà thuốc", () => {
      expect(expandAbbreviations("nt 50k")).toBe("nhà thuốc 50k");
    });
  });

  describe("Case insensitivity", () => {
    it("should expand uppercase CF", () => {
      const results = parser.parseWithConfidence("CF 30k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].confident).toBe(true);
    });

    it("should expand lowercase cf", () => {
      const results = parser.parseWithConfidence("cf 30k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].confident).toBe(true);
    });

    it("should expand mixed case Cf", () => {
      const results = parser.parseWithConfidence("Cf 30k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].confident).toBe(true);
    });

    it("CF, cf, and Cf all produce the same result", () => {
      const r1 = parser.parseWithConfidence("CF 30k");
      const r2 = parser.parseWithConfidence("cf 30k");
      const r3 = parser.parseWithConfidence("Cf 30k");
      expect(r1[0].category).toBe(r2[0].category);
      expect(r2[0].category).toBe(r3[0].category);
      expect(r1[0].amount).toBe(r2[0].amount);
      expect(r2[0].amount).toBe(r3[0].amount);
    });
  });

  describe("Word-boundary safety", () => {
    it("should NOT expand cf when part of a longer token (cfshop)", () => {
      const results = parser.parseWithConfidence("cfshop 50k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Khác");
      expect(results[0].confident).toBe(false);
    });

    it("should NOT expand dt within a longer token (abcdt)", () => {
      expect(expandAbbreviations("abcdt 100k")).toBe("abcdt 100k");
    });

    it("should NOT expand nt within a longer token (ntshop)", () => {
      expect(expandAbbreviations("ntshop 50k")).toBe("ntshop 50k");
    });
  });

  describe("Multiple abbreviations in one message", () => {
    it("should expand multiple abbreviations across segments", () => {
      const results = parser.parse("cf 30k, dt 500k");
      expect(results).toHaveLength(2);
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].amount).toBe(30_000);
      expect(results[1].category).toBe("Internet");
      expect(results[1].amount).toBe(500_000);
    });
  });

  describe("Category assignment via abbreviation", () => {
    it("cf → Ăn uống (cà phê)", () => {
      const results = parser.parseWithConfidence("cf 30k");
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].confident).toBe(true);
    });

    it("dt → Internet (điện thoại)", () => {
      const results = parser.parseWithConfidence("dt 200k");
      expect(results[0].category).toBe("Internet");
      expect(results[0].confident).toBe(true);
    });

    it("bv → Sức khỏe (bệnh viện)", () => {
      const results = parser.parseWithConfidence("bv 500k");
      expect(results[0].category).toBe("Sức khỏe");
      expect(results[0].confident).toBe(true);
    });

    it("st → Ăn uống (siêu thị)", () => {
      const results = parser.parseWithConfidence("st 200k");
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].confident).toBe(true);
    });

    it("ks → Khác (khách sạn - not in category keywords)", () => {
      const results = parser.parseWithConfidence("ks 1tr");
      expect(results).toHaveLength(1);
      expect(results[0].confident).toBe(false);
    });

    it("nt → Sức khỏe (nhà thuốc contains thuốc keyword)", () => {
      const results = parser.parseWithConfidence("nt 100k");
      expect(results[0].category).toBe("Sức khỏe");
      expect(results[0].confident).toBe(true);
    });
  });

  describe("Note field preserves original text", () => {
    it("should keep original abbreviation in note field", () => {
      const results = parser.parse("cf 30k");
      expect(results[0].note).toBe("cf 30k");
    });

    it("should keep original casing in note field", () => {
      const results = parser.parse("CF 30k");
      expect(results[0].note).toBe("CF 30k");
    });
  });
});
