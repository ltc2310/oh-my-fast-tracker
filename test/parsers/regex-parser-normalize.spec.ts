import { RegexParser, normalizeSpelling } from "../../src/infrastructure/parsers/RegexParser";

describe("RegexParser - Spelling Normalization", () => {
  let parser: RegexParser;

  beforeEach(() => {
    parser = new RegexParser();
  });

  describe("normalizeSpelling function", () => {
    it("f → ph: fở → phở", () => {
      expect(normalizeSpelling("fở")).toBe("phở");
    });

    it("z → gi: zải trí → giải trí", () => {
      expect(normalizeSpelling("zải trí")).toBe("giải trí");
    });

    it("w → qu: wần áo → quần áo", () => {
      expect(normalizeSpelling("wần áo")).toBe("quần áo");
    });

    it("d → gi (conditional): dải trí → giải trí (matches keyword)", () => {
      expect(normalizeSpelling("dải trí")).toBe("giải trí");
    });

    it("d → gi NOT applied when result isn't a keyword: dở stays dở", () => {
      expect(normalizeSpelling("dở")).toBe("dở");
    });
  });

  describe("f → ph normalization in parsing", () => {
    it("fở 50k → Ăn uống (phở is a keyword)", () => {
      const results = parser.parseWithConfidence("fở 50k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].confident).toBe(true);
    });
  });

  describe("z → gi normalization in parsing", () => {
    it("zải trí 100k → Giải trí (giải trí is a keyword)", () => {
      const results = parser.parseWithConfidence("zải trí 100k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Giải trí");
      expect(results[0].confident).toBe(true);
    });
  });

  describe("w → qu normalization in parsing", () => {
    it("wần áo 200k → Mua sắm (quần áo is a keyword)", () => {
      const results = parser.parseWithConfidence("wần áo 200k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Mua sắm");
      expect(results[0].confident).toBe(true);
    });
  });

  describe("d → gi conditional normalization in parsing", () => {
    it("dải trí 100k → Giải trí (giải trí is a keyword)", () => {
      const results = parser.parseWithConfidence("dải trí 100k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Giải trí");
      expect(results[0].confident).toBe(true);
    });

    it("dở 50k → does NOT normalize (giở is not a keyword)", () => {
      const results = parser.parseWithConfidence("dở 50k");
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Khác");
      expect(results[0].confident).toBe(false);
    });
  });

  describe("Word-boundary safety", () => {
    it("should NOT normalize f at non-initial positions", () => {
      expect(normalizeSpelling("café")).toBe("café");
    });

    it("should NOT normalize z at non-initial positions", () => {
      expect(normalizeSpelling("pizza")).toBe("pizza");
    });

    it("should only normalize word-initial characters", () => {
      expect(normalizeSpelling("abcf xyz")).toBe("abcf xyz");
    });

    it("should normalize each word independently", () => {
      expect(normalizeSpelling("fở zải")).toBe("phở giải");
    });
  });

  describe("Fallback behavior", () => {
    it("when normalization doesn't help, original text matching works", () => {
      const results = parser.parseWithConfidence("ăn trưa 50k");
      expect(results[0].category).toBe("Ăn uống");
      expect(results[0].confident).toBe(true);
    });

    it("unrecognized text with no normalization benefit stays Khác", () => {
      const results = parser.parseWithConfidence("xyzabc 50k");
      expect(results[0].category).toBe("Khác");
      expect(results[0].confident).toBe(false);
    });
  });

  describe("Note field preserves original text", () => {
    it("should keep informal spelling in note field after normalization", () => {
      const results = parser.parse("fở 50k");
      expect(results[0].note).toBe("fở 50k");
    });

    it("should keep original z-spelling in note field", () => {
      const results = parser.parse("zải trí 100k");
      expect(results[0].note).toBe("zải trí 100k");
    });
  });
});
