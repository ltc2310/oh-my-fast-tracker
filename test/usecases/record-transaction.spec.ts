import { RecordTransaction } from "../../src/application/usecases/RecordTransaction";
import { Parser, ParsedExpense } from "../../src/domain/ports/Parser";
import { TransactionRepository } from "../../src/domain/ports/TransactionRepository";
import { Transaction } from "../../src/domain/entities/Transaction";

describe("RecordTransaction", () => {
  let useCase: RecordTransaction;
  let mockParser: jest.Mocked<Parser>;
  let mockRepo: jest.Mocked<TransactionRepository>;

  beforeEach(() => {
    mockParser = { parse: jest.fn() };
    mockRepo = {
      save: jest.fn(),
      findByUserAndDateRange: jest.fn(),
      findDistinctUserIds: jest.fn(),
    };
    useCase = new RecordTransaction(mockParser, mockRepo);
  });

  it("should pass parsed date as spentAt to repository", async () => {
    const yesterday = new Date("2026-07-26T12:00:00.000Z");
    mockParser.parse.mockResolvedValue([
      { amount: 25000, category: "Di chuyển", note: "hôm qua rửa xe 25k", date: yesterday },
    ]);
    mockRepo.save.mockResolvedValue({
      id: "1",
      userId: "user1",
      amount: 25000,
      category: "Di chuyển",
      note: "hôm qua rửa xe 25k",
      spentAt: yesterday,
      createdAt: new Date(),
    });

    const results = await useCase.execute("user1", "hôm qua rửa xe 25k");

    expect(results).toHaveLength(1);
    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ spentAt: yesterday })
    );
  });

  it("should default spentAt to now when no date parsed", async () => {
    mockParser.parse.mockResolvedValue([
      { amount: 50000, category: "Ăn uống", note: "ăn trưa 50k" },
    ]);
    mockRepo.save.mockImplementation(async (t) => ({
      ...t,
      id: "1",
      createdAt: new Date(),
    }));

    const before = new Date();
    await useCase.execute("user1", "ăn trưa 50k");
    const after = new Date();

    const savedArg = mockRepo.save.mock.calls[0][0];
    expect(savedArg.spentAt).toBeDefined();
    expect(savedArg.spentAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(savedArg.spentAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("should return empty array when parser finds nothing", async () => {
    mockParser.parse.mockResolvedValue([]);
    const results = await useCase.execute("user1", "hello");
    expect(results).toHaveLength(0);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it("should save multiple transactions from multi-item message", async () => {
    mockParser.parse.mockResolvedValue([
      { amount: 70000, category: "Ăn uống", note: "ăn sáng 70k" },
      { amount: 30000, category: "Di chuyển", note: "rửa xe 30k" },
    ]);
    mockRepo.save.mockImplementation(async (t) => ({
      ...t,
      id: "x",
      createdAt: new Date(),
    }));

    const results = await useCase.execute("user1", "ăn sáng 70k, rửa xe 30k");

    expect(results).toHaveLength(2);
    expect(mockRepo.save).toHaveBeenCalledTimes(2);
  });

  it("should pass spentAt for each item in multi-transaction with shared date", async () => {
    const yesterday = new Date("2026-07-26T10:00:00.000Z");
    mockParser.parse.mockResolvedValue([
      { amount: 50000, category: "Ăn uống", note: "ăn trưa 50k", date: yesterday },
      { amount: 20000, category: "Di chuyển", note: "grab 20k", date: yesterday },
    ]);
    mockRepo.save.mockImplementation(async (t) => ({
      ...t,
      id: "x",
      createdAt: new Date(),
    }));

    await useCase.execute("user1", "hôm qua ăn trưa 50k, grab 20k");

    expect(mockRepo.save).toHaveBeenCalledTimes(2);
    expect(mockRepo.save.mock.calls[0][0].spentAt).toEqual(yesterday);
    expect(mockRepo.save.mock.calls[1][0].spentAt).toEqual(yesterday);
  });
});
