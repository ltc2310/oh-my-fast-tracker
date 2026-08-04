import { BotService } from "../../src/infrastructure/channels/bot.service";
import { ChannelAdapter, IncomingMessage } from "../../src/domain/ports/ChannelAdapter";
import { TokenService } from "../../src/domain/ports/TokenService";
import { RecordTransaction } from "../../src/application/usecases/RecordTransaction";
import { ListTransactions, ListTransactionsResult } from "../../src/application/usecases/ListTransactions";
import { SetBudgetLimit } from "../../src/application/usecases/SetBudgetLimit";
import { GetBudgetStatus } from "../../src/application/usecases/GetBudgetStatus";
import { CheckBudgetAfterRecord } from "../../src/application/usecases/CheckBudgetAfterRecord";
import { DeleteBudgetLimit } from "../../src/application/usecases/DeleteBudgetLimit";
import { GenerateWeeklyReport } from "../../src/application/usecases/GenerateWeeklyReport";
import { GenerateTrendReport } from "../../src/application/usecases/GenerateTrendReport";
import { CheckUserAccess } from "../../src/application/usecases/CheckUserAccess";
import { CompareMonths } from "../../src/application/usecases/CompareMonths";
import { UndoLastTransaction } from "../../src/application/usecases/UndoLastTransaction";
import { EditTransaction } from "../../src/application/usecases/EditTransaction";
import { EditIntentDetector } from "../../src/domain/ports/EditIntentDetector";
import { TransactionRepository } from "../../src/domain/ports/TransactionRepository";
import { NotificationPreferenceRepository } from "../../src/domain/ports/NotificationPreferenceRepository";
import { MultimodalParser } from "../../src/domain/ports/MultimodalParser";
import { AdminBotHandler } from "../../src/infrastructure/channels/AdminBotHandler";
import { ConfirmationManager } from "../../src/application/services/ConfirmationManager";
import { ConfigType } from "@nestjs/config";
import { appConfig } from "../../src/infrastructure/config/app.config";
import { Transaction } from "../../src/domain/entities/Transaction";

describe("BotService - List Transactions", () => {
  let botService: BotService;
  let messageHandler: (msg: IncomingMessage) => Promise<void>;

  let mockChannelAdapter: jest.Mocked<ChannelAdapter>;
  let mockListTransactions: jest.Mocked<ListTransactions>;
  let mockCheckUserAccess: jest.Mocked<CheckUserAccess>;

  const sampleResult: ListTransactionsResult = {
    transactions: [
      { id: "t1", userId: "user-uuid", amount: 50000, category: "Ăn uống", note: "ăn trưa", spentAt: new Date(2026, 7, 3, 12, 0, 0) },
      { id: "t2", userId: "user-uuid", amount: 30000, category: "Di chuyển", note: "grab", spentAt: new Date(2026, 7, 3, 8, 15, 0) },
    ],
    total: 80000,
    totalIncome: 0,
    hasMore: false,
  };

  beforeEach(() => {
    mockChannelAdapter = {
      onMessage: jest.fn((handler) => { messageHandler = handler; }),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendLink: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue(undefined),
    };

    mockCheckUserAccess = {
      execute: jest.fn().mockResolvedValue({ allowed: true, isFirstMessage: false, user: { id: "user-uuid" } }),
    } as unknown as jest.Mocked<CheckUserAccess>;

    mockListTransactions = {
      execute: jest.fn().mockResolvedValue(sampleResult),
    } as unknown as jest.Mocked<ListTransactions>;

    const mockConfig = { webviewBaseUrl: "http://localhost:3000/report" };

    botService = new BotService(
      mockChannelAdapter,
      { generateReportToken: jest.fn().mockReturnValue("t"), verifyReportToken: jest.fn(), generateToken: jest.fn(), verifyToken: jest.fn() } as unknown as TokenService,
      mockConfig as unknown as ConfigType<typeof appConfig>,
      { detect: jest.fn().mockResolvedValue(null) } as unknown as EditIntentDetector,
      { findLastByUser: jest.fn().mockResolvedValue(null), findRecentByUser: jest.fn().mockResolvedValue([]) } as unknown as TransactionRepository,
      { findByUserId: jest.fn().mockResolvedValue(null), upsert: jest.fn(), findEligibleUserIds: jest.fn().mockResolvedValue([]), createDefault: jest.fn() } as unknown as NotificationPreferenceRepository,
      { parseVoice: jest.fn().mockResolvedValue([]), parseImage: jest.fn().mockResolvedValue([]) } as unknown as MultimodalParser,
      { execute: jest.fn().mockResolvedValue([]) } as unknown as RecordTransaction,
      mockListTransactions,
      { execute: jest.fn().mockResolvedValue({}) } as unknown as SetBudgetLimit,
      { execute: jest.fn().mockResolvedValue({ statuses: [], totalLimit: 0, totalSpent: 0 }) } as unknown as GetBudgetStatus,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as CheckBudgetAfterRecord,
      { execute: jest.fn().mockResolvedValue(false) } as unknown as DeleteBudgetLimit,
      { execute: jest.fn().mockResolvedValue({ total: 0, byCategory: [], transactions: [], from: new Date(), to: new Date() }) } as unknown as GenerateWeeklyReport,
      { execute: jest.fn().mockResolvedValue({}) } as unknown as GenerateTrendReport,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as CompareMonths,
      mockCheckUserAccess,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as UndoLastTransaction,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as EditTransaction,
      { set: jest.fn(), get: jest.fn(), has: jest.fn().mockReturnValue(false), clear: jest.fn() } as unknown as ConfirmationManager,
      { isAdmin: jest.fn().mockReturnValue(false), isAdminCommand: jest.fn().mockReturnValue(false), handle: jest.fn(), notifyNewUser: jest.fn() } as unknown as AdminBotHandler,
    );

    botService.onModuleInit();
  });

  function sendMessage(text: string): Promise<void> {
    return messageHandler({ userId: "chat-123", channel: "telegram", text });
  }

  describe("today patterns", () => {
    it('"hôm nay chi gì" calls listTransactions with today range', async () => {
      await sendMessage("hôm nay chi gì");

      expect(mockListTransactions.execute).toHaveBeenCalledWith(
        "user-uuid",
        expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }),
      );
    });

    it('"hôm nay" alone triggers list', async () => {
      await sendMessage("hôm nay");

      expect(mockListTransactions.execute).toHaveBeenCalled();
    });

    it("response includes transaction details", async () => {
      await sendMessage("hôm nay chi gì");

      const sentText = mockChannelAdapter.sendText.mock.calls[0][1];
      expect(sentText).toContain("50.000");
      expect(sentText).toContain("Ăn uống");
      expect(sentText).toContain("ăn trưa");
      expect(sentText).toContain("Tổng chi: 80.000");
    });
  });

  describe("yesterday pattern", () => {
    it('"hôm qua chi gì" calls listTransactions with yesterday range', async () => {
      await sendMessage("hôm qua chi gì");

      expect(mockListTransactions.execute).toHaveBeenCalledWith(
        "user-uuid",
        expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }),
      );
    });
  });

  describe("recent N pattern", () => {
    it('"5 khoản gần nhất" calls listTransactions with limit=5', async () => {
      await sendMessage("5 khoản gần nhất");

      expect(mockListTransactions.execute).toHaveBeenCalledWith(
        "user-uuid",
        { limit: 5 },
      );
    });

    it('"lịch sử 3" calls with limit=3', async () => {
      await sendMessage("lịch sử 3");

      expect(mockListTransactions.execute).toHaveBeenCalledWith(
        "user-uuid",
        { limit: 3 },
      );
    });

    it('"xem 7 khoản" calls with limit=7', async () => {
      await sendMessage("xem 7 khoản");

      expect(mockListTransactions.execute).toHaveBeenCalledWith(
        "user-uuid",
        { limit: 7 },
      );
    });

    it("caps limit at 10", async () => {
      await sendMessage("20 khoản gần nhất");

      expect(mockListTransactions.execute).toHaveBeenCalledWith(
        "user-uuid",
        { limit: 10 },
      );
    });
  });

  describe("empty results", () => {
    it("shows encouraging message when no transactions today", async () => {
      mockListTransactions.execute.mockResolvedValue({
        transactions: [],
        total: 0,
        totalIncome: 0,
        hasMore: false,
      });

      await sendMessage("hôm nay chi gì");

      const sentText = mockChannelAdapter.sendText.mock.calls[0][1];
      expect(sentText).toContain("chưa chi gì");
    });
  });

  describe("hasMore indicator", () => {
    it("shows truncation message when hasMore=true", async () => {
      mockListTransactions.execute.mockResolvedValue({
        ...sampleResult,
        hasMore: true,
      });

      await sendMessage("hôm nay chi gì");

      const sentText = mockChannelAdapter.sendText.mock.calls[0][1];
      expect(sentText).toContain("còn nữa");
    });
  });
});
