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
