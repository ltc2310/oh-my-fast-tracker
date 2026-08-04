import { SetBudgetLimit } from "../../src/application/usecases/SetBudgetLimit";
import { GetBudgetStatus } from "../../src/application/usecases/GetBudgetStatus";
import { CheckBudgetAfterRecord } from "../../src/application/usecases/CheckBudgetAfterRecord";
import { DeleteBudgetLimit } from "../../src/application/usecases/DeleteBudgetLimit";
import { BudgetLimitRepository } from "../../src/domain/ports/BudgetLimitRepository";
import { TransactionRepository } from "../../src/domain/ports/TransactionRepository";
import { BudgetLimit } from "../../src/domain/entities/BudgetLimit";
import { Transaction } from "../../src/domain/entities/Transaction";

describe("Budget Limits Use Cases", () => {
  let mockBudgetRepo: jest.Mocked<BudgetLimitRepository>;
  let mockTransactionRepo: jest.Mocked<Pick<TransactionRepository, "findByUserAndDateRange">>;

  beforeEach(() => {
    mockBudgetRepo = {
      findByUser: jest.fn().mockResolvedValue([]),
      findByUserAndCategory: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
    };
    mockTransactionRepo = {
      findByUserAndDateRange: jest.fn().mockResolvedValue([]),
    };
  });

  describe("SetBudgetLimit", () => {
    it("upserts budget limit via repository", async () => {
      const expected: BudgetLimit = { id: "bl-1", userId: "u1", category: "Ăn uống", monthlyLimit: 5000000 };
      mockBudgetRepo.upsert.mockResolvedValue(expected);

      const useCase = new SetBudgetLimit(mockBudgetRepo);
      const result = await useCase.execute("u1", "Ăn uống", 5000000);

      expect(mockBudgetRepo.upsert).toHaveBeenCalledWith("u1", "Ăn uống", 5000000);
      expect(result).toEqual(expected);
    });
  });

  describe("DeleteBudgetLimit", () => {
    it("deletes via repository", async () => {
      const useCase = new DeleteBudgetLimit(mockBudgetRepo);
      const result = await useCase.execute("u1", "Ăn uống");

      expect(mockBudgetRepo.delete).toHaveBeenCalledWith("u1", "Ăn uống");
      expect(result).toBe(true);
    });

    it("returns false when not found", async () => {
      mockBudgetRepo.delete.mockResolvedValue(false);
      const useCase = new DeleteBudgetLimit(mockBudgetRepo);
      const result = await useCase.execute("u1", "Nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("GetBudgetStatus", () => {
    it("returns empty when no budget limits set", async () => {
      const useCase = new GetBudgetStatus(
        mockBudgetRepo as unknown as BudgetLimitRepository,
        mockTransactionRepo as unknown as TransactionRepository,
      );
      const result = await useCase.execute("u1");

      expect(result.statuses).toHaveLength(0);
      expect(result.totalLimit).toBe(0);
    });

    it("computes percentage and level correctly", async () => {
      mockBudgetRepo.findByUser.mockResolvedValue([
        { id: "bl-1", userId: "u1", category: "Ăn uống", monthlyLimit: 5000000 },
        { id: "bl-2", userId: "u1", category: "Di chuyển", monthlyLimit: 2000000 },
      ]);

      const transactions: Transaction[] = [
        { id: "t1", userId: "u1", amount: 4200000, category: "Ăn uống", note: "food" },
        { id: "t2", userId: "u1", amount: 2100000, category: "Di chuyển", note: "grab" },
      ];
      mockTransactionRepo.findByUserAndDateRange.mockResolvedValue(transactions);

      const useCase = new GetBudgetStatus(
        mockBudgetRepo as unknown as BudgetLimitRepository,
        mockTransactionRepo as unknown as TransactionRepository,
      );
      const result = await useCase.execute("u1");

      expect(result.statuses).toHaveLength(2);

      const eating = result.statuses.find((s) => s.category === "Ăn uống")!;
      expect(eating.spent).toBe(4200000);
      expect(eating.percentage).toBeCloseTo(84);
      expect(eating.level).toBe("warning");

      const transport = result.statuses.find((s) => s.category === "Di chuyển")!;
      expect(transport.spent).toBe(2100000);
      expect(transport.percentage).toBeCloseTo(105);
      expect(transport.level).toBe("exceeded");

      expect(result.totalLimit).toBe(7000000);
      expect(result.totalSpent).toBe(6300000);
    });
  });

  describe("CheckBudgetAfterRecord", () => {
    it("returns null when no budget limit set for category", async () => {
      const useCase = new CheckBudgetAfterRecord(
        mockBudgetRepo as unknown as BudgetLimitRepository,
        mockTransactionRepo as unknown as TransactionRepository,
      );
      const result = await useCase.execute("u1", "Ăn uống");

      expect(result).toBeNull();
    });

    it("returns null when spending is below 80%", async () => {
      mockBudgetRepo.findByUserAndCategory.mockResolvedValue({
        id: "bl-1", userId: "u1", category: "Ăn uống", monthlyLimit: 5000000,
      });
      mockTransactionRepo.findByUserAndDateRange.mockResolvedValue([
        { id: "t1", userId: "u1", amount: 2000000, category: "Ăn uống", note: "food" },
      ]);

      const useCase = new CheckBudgetAfterRecord(
        mockBudgetRepo as unknown as BudgetLimitRepository,
        mockTransactionRepo as unknown as TransactionRepository,
      );
      const result = await useCase.execute("u1", "Ăn uống");

      expect(result).toBeNull();
    });

    it("returns warning at 80-99%", async () => {
      mockBudgetRepo.findByUserAndCategory.mockResolvedValue({
        id: "bl-1", userId: "u1", category: "Ăn uống", monthlyLimit: 5000000,
      });
      mockTransactionRepo.findByUserAndDateRange.mockResolvedValue([
        { id: "t1", userId: "u1", amount: 4200000, category: "Ăn uống", note: "food" },
      ]);

      const useCase = new CheckBudgetAfterRecord(
        mockBudgetRepo as unknown as BudgetLimitRepository,
        mockTransactionRepo as unknown as TransactionRepository,
      );
      const result = await useCase.execute("u1", "Ăn uống");

      expect(result).not.toBeNull();
      expect(result!.level).toBe("warning");
      expect(result!.percentage).toBeCloseTo(84);
    });

    it("returns exceeded at 100%+", async () => {
      mockBudgetRepo.findByUserAndCategory.mockResolvedValue({
        id: "bl-1", userId: "u1", category: "Ăn uống", monthlyLimit: 5000000,
      });
      mockTransactionRepo.findByUserAndDateRange.mockResolvedValue([
        { id: "t1", userId: "u1", amount: 5500000, category: "Ăn uống", note: "food" },
      ]);

      const useCase = new CheckBudgetAfterRecord(
        mockBudgetRepo as unknown as BudgetLimitRepository,
        mockTransactionRepo as unknown as TransactionRepository,
      );
      const result = await useCase.execute("u1", "Ăn uống");

      expect(result).not.toBeNull();
      expect(result!.level).toBe("exceeded");
      expect(result!.spent).toBe(5500000);
    });
  });
});
