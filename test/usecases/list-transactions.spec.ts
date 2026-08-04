import { ListTransactions } from "../../src/application/usecases/ListTransactions";
import { TransactionRepository } from "../../src/domain/ports/TransactionRepository";
import { Transaction } from "../../src/domain/entities/Transaction";

describe("ListTransactions", () => {
  let useCase: ListTransactions;
  let mockRepo: jest.Mocked<Pick<TransactionRepository, "findByUserAndDateRange" | "findRecentByUser">>;

  const now = new Date(2026, 7, 3, 15, 0, 0); // Aug 3, 2026

  const sampleTransactions: Transaction[] = [
    { id: "t1", userId: "user-1", amount: 50000, category: "Ăn uống", note: "ăn trưa", spentAt: new Date(2026, 7, 3, 12, 0, 0) },
    { id: "t2", userId: "user-1", amount: 30000, category: "Di chuyển", note: "grab", spentAt: new Date(2026, 7, 3, 8, 15, 0) },
    { id: "t3", userId: "user-1", amount: -20000000, category: "Thu nhập", note: "lương", spentAt: new Date(2026, 7, 1, 9, 0, 0) },
  ];

  beforeEach(() => {
    mockRepo = {
      findByUserAndDateRange: jest.fn().mockResolvedValue(sampleTransactions.slice(0, 2)),
      findRecentByUser: jest.fn().mockResolvedValue(sampleTransactions),
    };

    useCase = new ListTransactions(mockRepo as unknown as TransactionRepository);
  });

  describe("by date range", () => {
    it("returns transactions within date range", async () => {
      const from = new Date(2026, 7, 3, 0, 0, 0);
      const to = new Date(2026, 7, 3, 23, 59, 59);

      const result = await useCase.execute("user-1", { from, to });

      expect(mockRepo.findByUserAndDateRange).toHaveBeenCalledWith("user-1", from, to);
      expect(result.transactions).toHaveLength(2);
      expect(result.total).toBe(80000);
      expect(result.totalIncome).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it("computes totalIncome from negative amounts", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue(sampleTransactions);

      const result = await useCase.execute("user-1", {
        from: new Date(2026, 7, 1),
        to: new Date(2026, 7, 3, 23, 59, 59),
      });

      expect(result.total).toBe(80000);
      expect(result.totalIncome).toBe(20000000);
    });
  });

  describe("by recent limit", () => {
    it("returns N most recent transactions", async () => {
      const result = await useCase.execute("user-1", { limit: 5 });

      expect(mockRepo.findRecentByUser).toHaveBeenCalledWith("user-1", 6); // limit+1 for hasMore check
      expect(result.transactions).toHaveLength(3);
      expect(result.hasMore).toBe(false);
    });

    it("sets hasMore=true when more transactions exist", async () => {
      // Simulate 6 results returned for limit=5
      const manyTx: Transaction[] = Array.from({ length: 6 }, (_, i) => ({
        id: `t${i}`,
        userId: "user-1",
        amount: 10000,
        category: "Ăn uống",
        note: `item ${i}`,
        spentAt: new Date(2026, 7, 3, 12 - i, 0, 0),
      }));
      mockRepo.findRecentByUser.mockResolvedValue(manyTx);

      const result = await useCase.execute("user-1", { limit: 5 });

      expect(result.transactions).toHaveLength(5);
      expect(result.hasMore).toBe(true);
    });

    it("defaults to 10 when no limit specified", async () => {
      const result = await useCase.execute("user-1", {});

      expect(mockRepo.findRecentByUser).toHaveBeenCalledWith("user-1", 11); // 10+1
    });
  });

  describe("empty results", () => {
    it("returns empty list with zero totals", async () => {
      mockRepo.findByUserAndDateRange.mockResolvedValue([]);

      const result = await useCase.execute("user-1", {
        from: new Date(2026, 7, 3, 0, 0, 0),
        to: new Date(2026, 7, 3, 23, 59, 59),
      });

      expect(result.transactions).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalIncome).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });
});
