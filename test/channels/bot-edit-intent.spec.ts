import { BotService } from "../../src/infrastructure/channels/bot.service";
import { ChannelAdapter, IncomingMessage } from "../../src/domain/ports/ChannelAdapter";
import { TokenService } from "../../src/domain/ports/TokenService";
import { EditIntentDetector, EditIntentResult } from "../../src/domain/ports/EditIntentDetector";
import { TransactionRepository } from "../../src/domain/ports/TransactionRepository";
import { RecordTransaction } from "../../src/application/usecases/RecordTransaction";
import { SetBudgetLimit } from "../../src/application/usecases/SetBudgetLimit";
import { GetBudgetStatus } from "../../src/application/usecases/GetBudgetStatus";
import { CheckBudgetAfterRecord } from "../../src/application/usecases/CheckBudgetAfterRecord";
import { DeleteBudgetLimit } from "../../src/application/usecases/DeleteBudgetLimit";
import { ListTransactions } from "../../src/application/usecases/ListTransactions";
import { GenerateWeeklyReport } from "../../src/application/usecases/GenerateWeeklyReport";
import { GenerateTrendReport } from "../../src/application/usecases/GenerateTrendReport";
import { CheckUserAccess } from "../../src/application/usecases/CheckUserAccess";
import { UndoLastTransaction } from "../../src/application/usecases/UndoLastTransaction";
import { EditTransaction } from "../../src/application/usecases/EditTransaction";
import { CompareMonths } from "../../src/application/usecases/CompareMonths";
import { Transaction } from "../../src/domain/entities/Transaction";
import { NotificationPreferenceRepository } from "../../src/domain/ports/NotificationPreferenceRepository";
import { MultimodalParser } from "../../src/domain/ports/MultimodalParser";
import { DeleteTransaction } from "../../src/application/usecases/DeleteTransaction";
import { PendingEditManager } from "../../src/application/services/PendingEditManager";
import { AdminBotHandler } from "../../src/infrastructure/channels/AdminBotHandler";
import { ConfirmationManager } from "../../src/application/services/ConfirmationManager";
import { ConfigType } from "@nestjs/config";
import { appConfig } from "../../src/infrastructure/config/app.config";

describe("BotService - Edit Intent Flow", () => {
  let botService: BotService;
  let messageHandler: (msg: IncomingMessage) => Promise<void>;

  // Mocks
  let mockChannelAdapter: jest.Mocked<ChannelAdapter>;
  let mockTokenService: jest.Mocked<TokenService>;
  let mockEditIntentDetector: jest.Mocked<EditIntentDetector>;
  let mockTransactionRepository: jest.Mocked<Pick<TransactionRepository, "findLastByUser" | "findRecentByUser">>;
  let mockRecordTransaction: jest.Mocked<RecordTransaction>;
  let mockGenerateWeeklyReport: jest.Mocked<GenerateWeeklyReport>;
  let mockGenerateTrendReport: jest.Mocked<GenerateTrendReport>;
  let mockCheckUserAccess: jest.Mocked<CheckUserAccess>;
  let mockUndoLastTransaction: jest.Mocked<UndoLastTransaction>;
  let mockEditTransaction: jest.Mocked<EditTransaction>;

  const mockConfig = { webviewBaseUrl: "http://localhost:3000/report" };

  const fakeTransaction: Transaction = {
    id: "tx-123",
    userId: "user-1",
    amount: 50000,
    category: "Ăn uống",
    note: "ăn trưa",
    spentAt: new Date(),
    createdAt: new Date(),
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

    mockEditIntentDetector = {
      detect: jest.fn().mockResolvedValue(null),
    };

    mockTransactionRepository = {
      findLastByUser: jest.fn().mockResolvedValue(fakeTransaction),
      findRecentByUser: jest.fn().mockResolvedValue([]),
    };

    mockRecordTransaction = {
      execute: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<RecordTransaction>;

    mockGenerateWeeklyReport = {
      execute: jest.fn().mockResolvedValue({ total: 0, byCategory: [], transactions: [] }),
    } as unknown as jest.Mocked<GenerateWeeklyReport>;

    mockGenerateTrendReport = {
      execute: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<GenerateTrendReport>;

    mockCheckUserAccess = {
      execute: jest.fn().mockResolvedValue({ allowed: true, isFirstMessage: false, user: { id: "user-1" } }),
    } as unknown as jest.Mocked<CheckUserAccess>;

    mockUndoLastTransaction = {
      execute: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<UndoLastTransaction>;

    mockEditTransaction = {
      execute: jest.fn().mockResolvedValue({ ...fakeTransaction, amount: 30000 }),
    } as unknown as jest.Mocked<EditTransaction>;

    botService = new BotService(
      mockChannelAdapter,
      mockTokenService,
      mockConfig as unknown as ConfigType<typeof appConfig>,
      mockEditIntentDetector,
      mockTransactionRepository as unknown as TransactionRepository,
      { findByUserId: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}), findEligibleUserIds: jest.fn().mockResolvedValue([]), createDefault: jest.fn().mockResolvedValue({}) } as unknown as NotificationPreferenceRepository,
      { parseVoice: jest.fn().mockResolvedValue([]), parseImage: jest.fn().mockResolvedValue([]) } as unknown as MultimodalParser,
      mockRecordTransaction,
      { execute: jest.fn().mockResolvedValue({ transactions: [], total: 0, totalIncome: 0, hasMore: false }) } as unknown as ListTransactions,
      { execute: jest.fn().mockResolvedValue({}) } as unknown as SetBudgetLimit,
      { execute: jest.fn().mockResolvedValue({ statuses: [], totalLimit: 0, totalSpent: 0 }) } as unknown as GetBudgetStatus,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as CheckBudgetAfterRecord,
      { execute: jest.fn().mockResolvedValue(false) } as unknown as DeleteBudgetLimit,
      mockGenerateWeeklyReport,
      mockGenerateTrendReport,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as CompareMonths,
      mockCheckUserAccess,
      mockUndoLastTransaction,
      mockEditTransaction,
      { set: jest.fn(), get: jest.fn(), has: jest.fn().mockReturnValue(false), clear: jest.fn() } as unknown as ConfirmationManager,
      { isAdmin: jest.fn().mockReturnValue(false), isAdminCommand: jest.fn().mockReturnValue(false), handle: jest.fn(), notifyNewUser: jest.fn() } as unknown as AdminBotHandler,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as DeleteTransaction,
      new PendingEditManager(),
    );

    botService.onModuleInit();
  });

  function sendMessage(text: string): Promise<void> {
    return messageHandler({ userId: "user-1", channel: "telegram", text, username: "testuser" });
  }

  describe("Full edit flow: message → detect → findLastByUser → edit → response", () => {
    it("sửa thành 30k → edits amount and responds with formatted VND", async () => {
      const editResult: EditIntentResult = {
        isEditIntent: true,
        fields: { amount: 30000 },
        isIncomplete: false,
      };
      mockEditIntentDetector.detect.mockResolvedValue(editResult);
      mockEditTransaction.execute.mockResolvedValue({
        ...fakeTransaction,
        amount: 30000,
      });

      await sendMessage("sửa thành 30k");

      expect(mockEditIntentDetector.detect).toHaveBeenCalledWith("sửa thành 30k");
      expect(mockTransactionRepository.findLastByUser).toHaveBeenCalledWith("user-1");
      expect(mockEditTransaction.execute).toHaveBeenCalledWith("user-1", "tx-123", { amount: 30000 });
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("30.000đ"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("Ăn uống"),
      );
      expect(mockRecordTransaction.execute).not.toHaveBeenCalled();
    });

    it("sửa thành ăn uống → edits category via pipeline", async () => {
      const editResult: EditIntentResult = {
        isEditIntent: true,
        fields: { category: "ăn uống", note: "ăn uống" },
        isIncomplete: false,
      };
      mockEditIntentDetector.detect.mockResolvedValue(editResult);
      mockEditTransaction.execute.mockResolvedValue({
        ...fakeTransaction,
        category: "Ăn uống",
        note: "ăn uống",
      });

      await sendMessage("sửa thành ăn uống");

      expect(mockEditTransaction.execute).toHaveBeenCalledWith(
        "user-1",
        "tx-123",
        expect.objectContaining({ category: "Ăn uống", note: "ăn uống" }),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("Ăn uống"),
      );
    });
  });

  describe("Incomplete edit → hướng dẫn message", () => {
    it("incomplete edit returns guidance with examples", async () => {
      const editResult: EditIntentResult = {
        isEditIntent: true,
        fields: {},
        isIncomplete: true,
      };
      mockEditIntentDetector.detect.mockResolvedValue(editResult);

      await sendMessage("sửa lại");

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("Sếp muốn sửa gì ạ"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("sửa thành 30k"),
      );
      expect(mockTransactionRepository.findLastByUser).not.toHaveBeenCalled();
      expect(mockEditTransaction.execute).not.toHaveBeenCalled();
      expect(mockRecordTransaction.execute).not.toHaveBeenCalled();
    });
  });

  describe("findLastByUser null → error message", () => {
    it("when no transaction found, responds with error message", async () => {
      const editResult: EditIntentResult = {
        isEditIntent: true,
        fields: { amount: 30000 },
        isIncomplete: false,
      };
      mockEditIntentDetector.detect.mockResolvedValue(editResult);
      mockTransactionRepository.findLastByUser.mockResolvedValue(null);

      await sendMessage("sửa thành 30k");

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("Không tìm thấy khoản nào để sửa"),
      );
      expect(mockEditTransaction.execute).not.toHaveBeenCalled();
      expect(mockRecordTransaction.execute).not.toHaveBeenCalled();
    });
  });

  describe("AI error → error message, RecordTransaction NOT called", () => {
    it("when editIntentDetector throws, responds with error and does NOT record", async () => {
      mockEditIntentDetector.detect.mockRejectedValue(new Error("AI unavailable"));

      await sendMessage("sửa thành cà phê 30k hôm qua");

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("sự cố"),
      );
      expect(mockRecordTransaction.execute).not.toHaveBeenCalled();
      expect(mockEditTransaction.execute).not.toHaveBeenCalled();
    });
  });

  describe('"sửa xe 50k" → detect returns null, falls through to record', () => {
    it("non-edit message falls through to RecordTransaction", async () => {
      mockEditIntentDetector.detect.mockResolvedValue(null);
      mockRecordTransaction.execute.mockResolvedValue([
        { ...fakeTransaction, amount: 50000, category: "Di chuyển", note: "sửa xe" },
      ]);

      await sendMessage("sửa xe 50k");

      expect(mockEditIntentDetector.detect).toHaveBeenCalledWith("sửa xe 50k");
      expect(mockTransactionRepository.findLastByUser).not.toHaveBeenCalled();
      expect(mockEditTransaction.execute).not.toHaveBeenCalled();
      expect(mockRecordTransaction.execute).toHaveBeenCalledWith("user-1", "sửa xe 50k");
    });
  });

  describe("Category not found → liệt kê 14 danh mục", () => {
    it("unknown category returns list of all 14 categories", async () => {
      const editResult: EditIntentResult = {
        isEditIntent: true,
        fields: { category: "blah blah", note: "blah blah" },
        isIncomplete: false,
      };
      mockEditIntentDetector.detect.mockResolvedValue(editResult);

      await sendMessage("sửa thành blah blah");

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("Em chưa nhận ra danh mục"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("Ăn uống"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("Di chuyển"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("Thu nhập"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("Khác"),
      );
      expect(mockEditTransaction.execute).not.toHaveBeenCalled();
      expect(mockRecordTransaction.execute).not.toHaveBeenCalled();
    });
  });

  describe("Date in future → reject message", () => {
    it("future date is rejected with error message", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);

      const editResult: EditIntentResult = {
        isEditIntent: true,
        fields: { spentAt: futureDate },
        isIncomplete: false,
      };
      mockEditIntentDetector.detect.mockResolvedValue(editResult);

      await sendMessage("sửa ngày mai");

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("không thể đặt ngày trong tương lai"),
      );
      expect(mockEditTransaction.execute).not.toHaveBeenCalled();
      expect(mockRecordTransaction.execute).not.toHaveBeenCalled();
    });
  });

  describe("Income category edit → amount becomes negative", () => {
    it("editing to income category causes EditTransaction to store negative amount", async () => {
      const editResult: EditIntentResult = {
        isEditIntent: true,
        fields: { category: "thu nhập", note: "thu nhập" },
        isIncomplete: false,
      };
      mockEditIntentDetector.detect.mockResolvedValue(editResult);
      // EditTransaction handles sign convention internally — it returns negative amount
      mockEditTransaction.execute.mockResolvedValue({
        ...fakeTransaction,
        amount: -50000,
        category: "Thu nhập",
        note: "thu nhập",
      });

      await sendMessage("sửa thành thu nhập");

      expect(mockEditTransaction.execute).toHaveBeenCalledWith(
        "user-1",
        "tx-123",
        expect.objectContaining({ category: "Thu nhập" }),
      );
      // Response should use "sửa thu nhập thành" for income category
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("sửa thu nhập thành"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("50.000đ"),
      );
    });
  });
});
