import {
  GenerateTrendReport,
  MonthsBelowMinimumError,
  MonthsLimitExceededError,
} from "../../src/application/usecases/GenerateTrendReport";
import { TransactionRepository } from "../../src/domain/ports/TransactionRepository";
import { TrendAnalysisService } from "../../src/application/services/TrendAnalysisService";
import { Transaction } from "../../src/domain/entities/Transaction";

describe("GenerateTrendReport", () => {
  let useCase: GenerateTrendReport;
  let mockRepo: jest.Mocked<TransactionRepository>;
  let trendAnalysis: TrendAnalysisService;

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      findByUserAndDateRange: jest.fn(),
      findDistinctUserIds: jest.fn(),
      findById: jest.fn(),
      findLastByUser: jest.fn(),
      update: jest.fn(),
      deleteById: jest.fn(),
    };
    // Use real TrendAnalysisService — it's pure logic with no dependencies
    trendAnalysis = new TrendAnalysisService();
    useCase = new GenerateTrendReport(mockRepo, trendAnalysis);
  });

  describe("Validation (Property 7)", () => {
    it("should throw MonthsBelowMinimumError when months < 3", async () => {
      await expect(
        useCase.execute("user1", { months: 2 }),
      ).rejects.toThrow(MonthsBelowMinimumError);

      await expect(
        useCase.execute("user1", { months: 1 }),
      ).rejects.toThrow(MonthsBelowMinimumError);

      // Repository should NOT be called
      expect(mockRepo.findByUserAndDateRange).not.toHaveBeenCalled();
    });

    it("should throw MonthsLimitExceededError when months > 12", async () => {
      await expect(
        useCase.execute("user1", { months: 13 }),
      ).rejects.toThrow(MonthsLimitExceededError);

      await expect(
        useCase.execute("user1", { months: 100 }),
      ).rejects.toThrow(MonthsLimitExceededError);

      // Repository should NOT be called
      expect(mockRepo.findByUserAndDateRange).not.toHaveBeenCalled();
    });

    it("should have correct error codes and properties", async () => {
      try {
        await useCase.execute("user1", { months: 2 });
      } catch (e) {
        expect(e).toBeInstanceOf(MonthsBelowMinimumError);
        expect((e as MonthsBelowMinimumError).code).toBe("MONTHS_BELOW_MINIMUM");
        expect((e as MonthsBelowMinimumError).min).toBe(3);
      }

      try {
        await useCase.execute("user1", { months: 13 });
      } catch (e) {
        expect(e).toBeInstanceOf(MonthsLimitExceededError);
        expect((e as MonthsLimitExceededError).code).toBe("MONTHS_LIMIT_EXCEEDED");
        expect((e as MonthsLimitExceededError).max).toBe(12);
      }
    });
  });

  describe("Monthly Breakdown Completeness (Property 1)", () => {
    it("should return exactly N monthly breakdowns for months=6", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      const result = await useCase.execute("user1", {
        months: 6,
        endMonth: "2026-07",
      });

      expect(result.monthlyBreakdown).toHaveLength(6);
    });

    it("should return exactly N monthly breakdowns for months=3", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      const result = await useCase.execute("user1", {
        months: 3,
        endMonth: "2026-07",
      });

      expect(result.monthlyBreakdown).toHaveLength(3);
    });

    it("should return exactly N monthly breakdowns for months=12", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      const result = await useCase.execute("user1", {
        months: 12,
        endMonth: "2026-12",
      });

      expect(result.monthlyBreakdown).toHaveLength(12);
    });

    it("should include empty months with transactionCount=0 and totalSpent=0", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      const result = await useCase.execute("user1", {
        months: 6,
        endMonth: "2026-07",
      });

      for (const mb of result.monthlyBreakdown) {
        expect(mb.transactionCount).toBe(0);
        expect(mb.totalSpent).toBe(0);
        expect(mb.byCategory).toEqual({});
        expect(mb.topCategory).toBeNull();
      }
    });

    it("should sort monthly breakdowns in ascending chronological order", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      const result = await useCase.execute("user1", {
        months: 6,
        endMonth: "2026-07",
      });

      const months = result.monthlyBreakdown.map((mb) => mb.month);
      expect(months).toEqual([
        "2026-02",
        "2026-03",
        "2026-04",
        "2026-05",
        "2026-06",
        "2026-07",
      ]);
    });
  });

  describe("Transaction Grouping", () => {
    it("should group transactions by calendar month correctly", async () => {
      const transactions: Transaction[] = [
        {
          userId: "user1",
          amount: 50000,
          category: "Ăn uống",
          note: "lunch",
          spentAt: new Date("2026-02-15"),
        },
        {
          userId: "user1",
          amount: 30000,
          category: "Di chuyển",
          note: "taxi",
          spentAt: new Date("2026-02-20"),
        },
        {
          userId: "user1",
          amount: 100000,
          category: "Ăn uống",
          note: "dinner",
          spentAt: new Date("2026-04-10"),
        },
      ];
      mockRepo.findByUserAndDateRange.mockResolvedValue(transactions);

      const result = await useCase.execute("user1", {
        months: 6,
        endMonth: "2026-07",
      });

      // Feb has 2 transactions
      const feb = result.monthlyBreakdown.find((mb) => mb.month === "2026-02")!;
      expect(feb.transactionCount).toBe(2);
      expect(feb.totalSpent).toBe(80000);

      // Apr has 1 transaction
      const apr = result.monthlyBreakdown.find((mb) => mb.month === "2026-04")!;
      expect(apr.transactionCount).toBe(1);
      expect(apr.totalSpent).toBe(100000);

      // Other months are empty
      const mar = result.monthlyBreakdown.find((mb) => mb.month === "2026-03")!;
      expect(mar.transactionCount).toBe(0);
      expect(mar.totalSpent).toBe(0);
    });

    it("should compute byCategory correctly", async () => {
      const transactions: Transaction[] = [
        {
          userId: "user1",
          amount: 50000,
          category: "Ăn uống",
          note: "lunch",
          spentAt: new Date("2026-03-15"),
        },
        {
          userId: "user1",
          amount: 30000,
          category: "Ăn uống",
          note: "dinner",
          spentAt: new Date("2026-03-16"),
        },
        {
          userId: "user1",
          amount: 20000,
          category: "Di chuyển",
          note: "taxi",
          spentAt: new Date("2026-03-17"),
        },
      ];
      mockRepo.findByUserAndDateRange.mockResolvedValue(transactions);

      const result = await useCase.execute("user1", {
        months: 3,
        endMonth: "2026-03",
      });

      const mar = result.monthlyBreakdown.find((mb) => mb.month === "2026-03")!;
      expect(mar.byCategory["Ăn uống"]).toBe(80000);
      expect(mar.byCategory["Di chuyển"]).toBe(20000);
      expect(mar.topCategory).toEqual({ name: "Ăn uống", amount: 80000 });
    });
  });

  describe("Incomplete Data Detection (Property 8)", () => {
    it("should set hasIncompleteData=true when any month has 0 transactions", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([
        {
          userId: "user1",
          amount: 50000,
          category: "Ăn uống",
          note: "lunch",
          spentAt: new Date("2026-07-15"),
        },
      ]);

      const result = await useCase.execute("user1", {
        months: 6,
        endMonth: "2026-07",
      });

      expect(result.overview.hasIncompleteData).toBe(true);
      expect(result.overview.monthsWithData).toBe(1);
    });

    it("should set hasIncompleteData=false when all months have transactions", async () => {
      // Create transactions for each of 3 months
      const transactions: Transaction[] = [
        { userId: "user1", amount: 10000, category: "Ăn uống", note: "a", spentAt: new Date("2026-05-15") },
        { userId: "user1", amount: 20000, category: "Ăn uống", note: "b", spentAt: new Date("2026-06-15") },
        { userId: "user1", amount: 30000, category: "Ăn uống", note: "c", spentAt: new Date("2026-07-15") },
      ];
      mockRepo.findByUserAndDateRange.mockResolvedValue(transactions);

      const result = await useCase.execute("user1", {
        months: 3,
        endMonth: "2026-07",
      });

      expect(result.overview.hasIncompleteData).toBe(false);
      expect(result.overview.monthsWithData).toBe(3);
    });
  });

  describe("Single Query Guarantee (Property 11)", () => {
    it("should call repository.findByUserAndDateRange exactly once", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      await useCase.execute("user1", { months: 6, endMonth: "2026-07" });

      expect(mockRepo.findByUserAndDateRange).toHaveBeenCalledTimes(1);
    });
  });

  describe("Overview Computation", () => {
    it("should compute totalSpent and averageMonthlySpent correctly", async () => {
      const transactions: Transaction[] = [
        { userId: "user1", amount: 100000, category: "Ăn uống", note: "a", spentAt: new Date("2026-05-15") },
        { userId: "user1", amount: 200000, category: "Ăn uống", note: "b", spentAt: new Date("2026-06-15") },
        { userId: "user1", amount: 300000, category: "Ăn uống", note: "c", spentAt: new Date("2026-07-15") },
      ];
      mockRepo.findByUserAndDateRange.mockResolvedValue(transactions);

      const result = await useCase.execute("user1", {
        months: 3,
        endMonth: "2026-07",
      });

      expect(result.overview.totalSpent).toBe(600000);
      expect(result.overview.averageMonthlySpent).toBe(200000);
    });

    it("should identify highestMonth and lowestMonth correctly", async () => {
      const transactions: Transaction[] = [
        { userId: "user1", amount: 100000, category: "Ăn uống", note: "a", spentAt: new Date("2026-05-15") },
        { userId: "user1", amount: 500000, category: "Ăn uống", note: "b", spentAt: new Date("2026-06-15") },
        { userId: "user1", amount: 200000, category: "Ăn uống", note: "c", spentAt: new Date("2026-07-15") },
      ];
      mockRepo.findByUserAndDateRange.mockResolvedValue(transactions);

      const result = await useCase.execute("user1", {
        months: 3,
        endMonth: "2026-07",
      });

      expect(result.overview.highestMonth).toEqual({ month: "2026-06", amount: 500000 });
      expect(result.overview.lowestMonth).toEqual({ month: "2026-05", amount: 100000 });
    });

    it("should include generatedAt timestamp", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      const before = new Date().toISOString();
      const result = await useCase.execute("user1", { months: 3, endMonth: "2026-07" });
      const after = new Date().toISOString();

      expect(result.generatedAt).toBeDefined();
      expect(result.generatedAt >= before).toBe(true);
      expect(result.generatedAt <= after).toBe(true);
    });
  });

  describe("Period Computation", () => {
    it("should compute correct period for months=6, endMonth=2026-07", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      const result = await useCase.execute("user1", {
        months: 6,
        endMonth: "2026-07",
      });

      expect(result.periodStart).toBe("2026-02-01");
      expect(result.periodEnd).toBe("2026-07-31");
      expect(result.monthsCount).toBe(6);
    });

    it("should compute correct period for months=3, endMonth=2026-03", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      const result = await useCase.execute("user1", {
        months: 3,
        endMonth: "2026-03",
      });

      expect(result.periodStart).toBe("2026-01-01");
      expect(result.periodEnd).toBe("2026-03-31");
      expect(result.monthsCount).toBe(3);
    });

    it("should handle year boundary (endMonth=2026-02, months=6)", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      const result = await useCase.execute("user1", {
        months: 6,
        endMonth: "2026-02",
      });

      expect(result.periodStart).toBe("2025-09-01");
      expect(result.periodEnd).toBe("2026-02-28");
      expect(result.monthsCount).toBe(6);
    });

    it("should default endMonth to current month when not provided", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      const now = new Date();
      const expectedEndMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const result = await useCase.execute("user1", { months: 3 });

      // The last month in breakdown should be the current month
      const lastBreakdown = result.monthlyBreakdown[result.monthlyBreakdown.length - 1];
      expect(lastBreakdown.month).toBe(expectedEndMonth);
    });
  });

  describe("Month Labels", () => {
    it("should generate Vietnamese month labels", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      const result = await useCase.execute("user1", {
        months: 3,
        endMonth: "2026-03",
      });

      expect(result.monthlyBreakdown[0].monthLabel).toBe("Tháng 1/2026");
      expect(result.monthlyBreakdown[1].monthLabel).toBe("Tháng 2/2026");
      expect(result.monthlyBreakdown[2].monthLabel).toBe("Tháng 3/2026");
    });
  });
});
