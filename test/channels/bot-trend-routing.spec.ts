import { BotService } from "../../src/infrastructure/channels/bot.service";
import { ChannelAdapter, IncomingMessage } from "../../src/domain/ports/ChannelAdapter";
import { TokenService } from "../../src/domain/ports/TokenService";
import { RecordTransaction } from "../../src/application/usecases/RecordTransaction";
import { GenerateWeeklyReport } from "../../src/application/usecases/GenerateWeeklyReport";
import { GenerateTrendReport } from "../../src/application/usecases/GenerateTrendReport";
import { CheckUserAccess } from "../../src/application/usecases/CheckUserAccess";
import { TrendReport } from "../../src/domain/entities/TrendReport";

describe("BotService - Trend Report Routing", () => {
  let botService: BotService;
  let messageHandler: (msg: IncomingMessage) => Promise<void>;

  // Mocks
  let mockChannelAdapter: jest.Mocked<ChannelAdapter>;
  let mockTokenService: jest.Mocked<TokenService>;
  let mockRecordTransaction: jest.Mocked<RecordTransaction>;
  let mockGenerateWeeklyReport: jest.Mocked<GenerateWeeklyReport>;
  let mockGenerateTrendReport: jest.Mocked<GenerateTrendReport>;
  let mockCheckUserAccess: jest.Mocked<CheckUserAccess>;
  const mockConfig = { webviewBaseUrl: "http://localhost:3000/report" };

  const fakeTrendReport: TrendReport = {
    userId: "user-1",
    periodStart: "2024-07-01",
    periodEnd: "2024-12-31",
    monthsCount: 6,
    overview: {
      totalSpent: 6000000,
      averageMonthlySpent: 1000000,
      highestMonth: { month: "2024-12", amount: 1500000 },
      lowestMonth: { month: "2024-07", amount: 500000 },
      overallDirection: "increasing" as const,
      overallChangePercent: 25,
      hasIncompleteData: false,
      monthsWithData: 6,
    },
    monthlyBreakdown: [],
    categoryTrends: [],
    topGrowingCategories: [
      { category: "Ăn uống", monthlyAmounts: [], changePercent: 30, direction: "increasing" as const, averageMonthly: 500000 },
    ],
    topShrinkingCategories: [
      { category: "Di chuyển", monthlyAmounts: [], changePercent: -20, direction: "decreasing" as const, averageMonthly: 200000 },
    ],
    generatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockChannelAdapter = {
      onMessage: jest.fn((handler) => {
        messageHandler = handler;
      }),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendLink: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue(undefined),
    };

    mockTokenService = {
      generateReportToken: jest.fn().mockReturnValue("fake-token"),
      verifyReportToken: jest.fn(),
      generateToken: jest.fn(),
      verifyToken: jest.fn(),
    };

    mockRecordTransaction = {
      execute: jest.fn().mockResolvedValue([]),
    } as any;

    mockGenerateWeeklyReport = {
      execute: jest.fn().mockResolvedValue({ total: 0, byCategory: [], transactions: [], from: new Date(), to: new Date() }),
    } as any;

    mockGenerateTrendReport = {
      execute: jest.fn().mockResolvedValue(fakeTrendReport),
    } as any;

    mockCheckUserAccess = {
      execute: jest.fn().mockResolvedValue({ allowed: true, isFirstMessage: false, user: {} }),
    } as any;

    botService = new BotService(
      mockChannelAdapter,
      mockTokenService,
      mockConfig as any,
      { detect: jest.fn().mockResolvedValue(null) } as any, // EditIntentDetector
      { findLastByUser: jest.fn().mockResolvedValue(null) } as any, // TransactionRepository
      mockRecordTransaction,
      mockGenerateWeeklyReport,
      mockGenerateTrendReport,
      mockCheckUserAccess,
      { execute: jest.fn().mockResolvedValue(null) } as any, // UndoLastTransaction
      { execute: jest.fn().mockResolvedValue(null) } as any, // EditTransaction
    );

    botService.onModuleInit();
  });

  function sendMessage(text: string): Promise<void> {
    return messageHandler({ userId: "user-1", channel: "telegram", text });
  }

  describe("Trend report triggers", () => {
    it('"báo cáo 6 tháng" triggers trend report handler', async () => {
      await sendMessage("báo cáo 6 tháng");

      expect(mockGenerateTrendReport.execute).toHaveBeenCalledWith("user-1", { months: 6 });
      expect(mockGenerateWeeklyReport.execute).not.toHaveBeenCalled();
    });

    it('"xu hướng chi tiêu 3 tháng" triggers with months=3', async () => {
      await sendMessage("xu hướng chi tiêu 3 tháng");

      expect(mockGenerateTrendReport.execute).toHaveBeenCalledWith("user-1", { months: 3 });
      expect(mockGenerateWeeklyReport.execute).not.toHaveBeenCalled();
    });

    it('"báo cáo xu hướng" defaults to months=6', async () => {
      await sendMessage("báo cáo xu hướng");

      expect(mockGenerateTrendReport.execute).toHaveBeenCalledWith("user-1", { months: 6 });
      expect(mockGenerateWeeklyReport.execute).not.toHaveBeenCalled();
    });
  });

  describe("Range validation errors", () => {
    it('"báo cáo 2 tháng" replies with range error, GenerateTrendReport NOT called', async () => {
      await sendMessage("báo cáo 2 tháng");

      expect(mockGenerateTrendReport.execute).not.toHaveBeenCalled();
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("3 đến 12 tháng"),
      );
    });

    it('"báo cáo 18 tháng" replies with range error, GenerateTrendReport NOT called', async () => {
      await sendMessage("báo cáo 18 tháng");

      expect(mockGenerateTrendReport.execute).not.toHaveBeenCalled();
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("3 đến 12 tháng"),
      );
    });
  });

  describe("Unsupported compare months", () => {
    it('"so sánh tháng 1 với tháng 6" replies "chưa hỗ trợ", no parser/usecase call', async () => {
      await sendMessage("so sánh tháng 1 với tháng 6");

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("chưa"),
      );
      expect(mockGenerateTrendReport.execute).not.toHaveBeenCalled();
      expect(mockGenerateWeeklyReport.execute).not.toHaveBeenCalled();
      expect(mockRecordTransaction.execute).not.toHaveBeenCalled();
    });
  });

  describe("Existing weekly report routing preserved", () => {
    it('"báo cáo tháng này" still routes to existing weekly report handler (not trend)', async () => {
      await sendMessage("báo cáo tháng này");

      expect(mockGenerateWeeklyReport.execute).toHaveBeenCalled();
      expect(mockGenerateTrendReport.execute).not.toHaveBeenCalled();
    });

    it('"báo cáo tuần này" still routes to existing weekly report handler', async () => {
      await sendMessage("báo cáo tuần này");

      expect(mockGenerateWeeklyReport.execute).toHaveBeenCalled();
      expect(mockGenerateTrendReport.execute).not.toHaveBeenCalled();
    });
  });
});
