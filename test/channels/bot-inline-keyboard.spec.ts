import { BotService } from "../../src/infrastructure/channels/bot.service";
import { ChannelAdapter, IncomingMessage, InlineButton, CallbackQuery, SentMessage } from "../../src/domain/ports/ChannelAdapter";
import { TokenService } from "../../src/domain/ports/TokenService";
import { RecordTransaction } from "../../src/application/usecases/RecordTransaction";
import { SetBudgetLimit } from "../../src/application/usecases/SetBudgetLimit";
import { GetBudgetStatus } from "../../src/application/usecases/GetBudgetStatus";
import { CheckBudgetAfterRecord } from "../../src/application/usecases/CheckBudgetAfterRecord";
import { DeleteBudgetLimit } from "../../src/application/usecases/DeleteBudgetLimit";
import { ListTransactions } from "../../src/application/usecases/ListTransactions";
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
import { DeleteTransaction } from "../../src/application/usecases/DeleteTransaction";
import { PendingEditManager } from "../../src/application/services/PendingEditManager";
import { AdminBotHandler } from "../../src/infrastructure/channels/AdminBotHandler";
import { ConfirmationManager, PendingConfirmation } from "../../src/application/services/ConfirmationManager";
import { ConfigType } from "@nestjs/config";
import { appConfig } from "../../src/infrastructure/config/app.config";

describe("BotService - Inline Keyboard", () => {
  let botService: BotService;
  let messageHandler: (msg: IncomingMessage) => Promise<void>;
  let callbackHandler: (query: CallbackQuery) => Promise<void>;

  let mockChannelAdapter: jest.Mocked<ChannelAdapter & {
    sendTextWithKeyboard: jest.Mock;
    onCallbackQuery: jest.Mock;
    answerCallbackQuery: jest.Mock;
    editMessageText: jest.Mock;
  }>;
  let mockTransactionRepository: jest.Mocked<Pick<TransactionRepository, "save" | "findLastByUser" | "findRecentByUser">>;
  let mockMultimodalParser: jest.Mocked<MultimodalParser>;
  let confirmationManager: ConfirmationManager;

  const CHANNEL_USER_ID = "chat-123";
  const INTERNAL_USER_ID = "uuid-abc";

  beforeEach(() => {
    mockChannelAdapter = {
      onMessage: jest.fn((handler) => { messageHandler = handler; }),
      onCallbackQuery: jest.fn((handler) => { callbackHandler = handler; }),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendTextWithKeyboard: jest.fn().mockResolvedValue({ messageId: 42, chatId: 123 } as SentMessage),
      sendLink: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue(undefined),
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
    };

    mockTransactionRepository = {
      save: jest.fn().mockResolvedValue({ id: "saved-tx" }),
      findLastByUser: jest.fn().mockResolvedValue(null),
      findRecentByUser: jest.fn().mockResolvedValue([]),
    };

    mockMultimodalParser = {
      parseVoice: jest.fn().mockResolvedValue([{ amount: 50000, category: "Ăn uống", note: "ăn trưa" }]),
      parseImage: jest.fn().mockResolvedValue([]),
    };

    confirmationManager = new ConfirmationManager();

    botService = new BotService(
      mockChannelAdapter as unknown as ChannelAdapter,
      { generateReportToken: jest.fn().mockReturnValue("t"), verifyReportToken: jest.fn(), generateToken: jest.fn(), verifyToken: jest.fn() } as unknown as TokenService,
      { webviewBaseUrl: "http://localhost:3000/report" } as unknown as ConfigType<typeof appConfig>,
      { detect: jest.fn().mockResolvedValue(null) } as unknown as EditIntentDetector,
      mockTransactionRepository as unknown as TransactionRepository,
      { findByUserId: jest.fn().mockResolvedValue(null), upsert: jest.fn(), findEligibleUserIds: jest.fn().mockResolvedValue([]), createDefault: jest.fn() } as unknown as NotificationPreferenceRepository,
      mockMultimodalParser as unknown as MultimodalParser,
      { execute: jest.fn().mockResolvedValue([]) } as unknown as RecordTransaction,
      { execute: jest.fn().mockResolvedValue({ transactions: [], total: 0, totalIncome: 0, hasMore: false }) } as unknown as ListTransactions,
      { execute: jest.fn().mockResolvedValue({}) } as unknown as SetBudgetLimit,
      { execute: jest.fn().mockResolvedValue({ statuses: [], totalLimit: 0, totalSpent: 0 }) } as unknown as GetBudgetStatus,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as CheckBudgetAfterRecord,
      { execute: jest.fn().mockResolvedValue(false) } as unknown as DeleteBudgetLimit,
      { execute: jest.fn().mockResolvedValue({ total: 0, byCategory: [], transactions: [], from: new Date(), to: new Date() }) } as unknown as GenerateWeeklyReport,
      { execute: jest.fn().mockResolvedValue({}) } as unknown as GenerateTrendReport,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as CompareMonths,
      { execute: jest.fn().mockResolvedValue({ allowed: true, isFirstMessage: false, user: { id: INTERNAL_USER_ID } }) } as unknown as CheckUserAccess,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as UndoLastTransaction,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as EditTransaction,
      confirmationManager,
      { isAdmin: jest.fn().mockReturnValue(false), isAdminCommand: jest.fn().mockReturnValue(false), handle: jest.fn(), notifyNewUser: jest.fn() } as unknown as AdminBotHandler,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as DeleteTransaction,
      new PendingEditManager(),
    );

    botService.onModuleInit();
  });

  describe("Voice confirmation with inline keyboard", () => {
    it("sends confirmation with inline keyboard buttons", async () => {
      await messageHandler({
        userId: CHANNEL_USER_ID,
        channel: "telegram",
        text: "",
        voice: { data: Buffer.from("audio"), fileId: "f1", mimeType: "audio/ogg", duration: 5 },
      });

      expect(mockChannelAdapter.sendTextWithKeyboard).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        expect.stringContaining("50.000"),
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({ text: "✅ Lưu", callbackData: "confirm:save" }),
            expect.objectContaining({ text: "❌ Huỷ", callbackData: "confirm:cancel" }),
          ]),
        ]),
      );
    });
  });

  describe("Callback query: confirm:save", () => {
    it("saves transaction and edits message", async () => {
      // Set up pending confirmation
      confirmationManager.set(INTERNAL_USER_ID, CHANNEL_USER_ID, [
        { amount: 50000, category: "Ăn uống", note: "ăn trưa" },
      ], "voice");

      await callbackHandler({
        id: "cb-1",
        userId: CHANNEL_USER_ID,
        channel: "telegram",
        messageId: 42,
        chatId: 123,
        data: "confirm:save",
      });

      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: INTERNAL_USER_ID,
          amount: 50000,
          category: "Ăn uống",
        }),
      );
      expect(mockChannelAdapter.editMessageText).toHaveBeenCalledWith(
        123, 42,
        expect.stringContaining("Đã ghi nhận"),
      );
      expect(mockChannelAdapter.answerCallbackQuery).toHaveBeenCalledWith("cb-1");
    });
  });

  describe("Callback query: confirm:cancel", () => {
    it("clears pending and edits message to cancelled", async () => {
      confirmationManager.set(INTERNAL_USER_ID, CHANNEL_USER_ID, [
        { amount: 50000, category: "Ăn uống", note: "test" },
      ], "voice");

      await callbackHandler({
        id: "cb-2",
        userId: CHANNEL_USER_ID,
        channel: "telegram",
        messageId: 42,
        chatId: 123,
        data: "confirm:cancel",
      });

      expect(confirmationManager.has(INTERNAL_USER_ID)).toBe(false);
      expect(mockChannelAdapter.editMessageText).toHaveBeenCalledWith(
        123, 42,
        expect.stringContaining("Đã huỷ"),
      );
    });
  });

  describe("Callback query: confirm:cat", () => {
    it("shows category selection keyboard", async () => {
      confirmationManager.set(INTERNAL_USER_ID, CHANNEL_USER_ID, [
        { amount: 50000, category: "Ăn uống", note: "test" },
      ], "voice");

      await callbackHandler({
        id: "cb-3",
        userId: CHANNEL_USER_ID,
        channel: "telegram",
        messageId: 42,
        chatId: 123,
        data: "confirm:cat",
      });

      expect(mockChannelAdapter.editMessageText).toHaveBeenCalledWith(
        123, 42,
        expect.stringContaining("Chọn danh mục"),
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({ callbackData: "cat:Ăn uống" }),
          ]),
        ]),
      );
    });
  });

  describe("Callback query: cat:<category>", () => {
    it("saves with selected category", async () => {
      confirmationManager.set(INTERNAL_USER_ID, CHANNEL_USER_ID, [
        { amount: 30000, category: "Khác", note: "grab" },
      ], "voice");

      await callbackHandler({
        id: "cb-4",
        userId: CHANNEL_USER_ID,
        channel: "telegram",
        messageId: 42,
        chatId: 123,
        data: "cat:Di chuyển",
      });

      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "Di chuyển",
          amount: 30000,
        }),
      );
      expect(mockChannelAdapter.editMessageText).toHaveBeenCalledWith(
        123, 42,
        expect.stringContaining("Di chuyển"),
        undefined,
      );
    });
  });

  describe("Expired callback", () => {
    it("answers with expiry message when no pending found", async () => {
      // No pending set up

      await callbackHandler({
        id: "cb-5",
        userId: CHANNEL_USER_ID,
        channel: "telegram",
        messageId: 42,
        chatId: 123,
        data: "confirm:save",
      });

      expect(mockChannelAdapter.answerCallbackQuery).toHaveBeenCalledWith(
        "cb-5",
        "Đã hết hạn, sếp gửi lại nhé",
      );
      expect(mockTransactionRepository.save).not.toHaveBeenCalled();
    });
  });
});
