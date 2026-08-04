import { BotService } from "../../src/infrastructure/channels/bot.service";
import { ChannelAdapter, IncomingMessage, InlineButton, SentMessage } from "../../src/domain/ports/ChannelAdapter";
import { TokenService } from "../../src/domain/ports/TokenService";
import { RecordTransaction } from "../../src/application/usecases/RecordTransaction";
import { ListTransactions } from "../../src/application/usecases/ListTransactions";
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
import { DeleteTransaction } from "../../src/application/usecases/DeleteTransaction";
import { PendingEditManager } from "../../src/application/services/PendingEditManager";
import { AdminBotHandler } from "../../src/infrastructure/channels/AdminBotHandler";
import { ConfirmationManager } from "../../src/application/services/ConfirmationManager";
import { ConfigType } from "@nestjs/config";
import { appConfig } from "../../src/infrastructure/config/app.config";
import { Transaction } from "../../src/domain/entities/Transaction";

describe("BotService - Undo by Keyword", () => {
  let botService: BotService;
  let messageHandler: (msg: IncomingMessage) => Promise<void>;

  let mockChannelAdapter: jest.Mocked<ChannelAdapter & {
    sendTextWithKeyboard: jest.Mock;
    onCallbackQuery: jest.Mock;
    answerCallbackQuery: jest.Mock;
    editMessageText: jest.Mock;
  }>;
  let mockTransactionRepository: jest.Mocked<Pick<TransactionRepository, "save" | "findLastByUser" | "findRecentByUser" | "findByUserAndKeyword" | "deleteById">>;

  const CHANNEL_USER_ID = "chat-123";
  const INTERNAL_USER_ID = "uuid-abc";

  beforeEach(() => {
    mockChannelAdapter = {
      onMessage: jest.fn((handler) => { messageHandler = handler; }),
      onCallbackQuery: jest.fn(),
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
      findByUserAndKeyword: jest.fn().mockResolvedValue([]),
      deleteById: jest.fn().mockResolvedValue(true),
    };

    botService = new BotService(
      mockChannelAdapter as unknown as ChannelAdapter,
      { generateReportToken: jest.fn().mockReturnValue("t"), verifyReportToken: jest.fn(), generateToken: jest.fn(), verifyToken: jest.fn() } as unknown as TokenService,
      { webviewBaseUrl: "http://localhost:3000/report" } as unknown as ConfigType<typeof appConfig>,
      { detect: jest.fn().mockResolvedValue(null) } as unknown as EditIntentDetector,
      mockTransactionRepository as unknown as TransactionRepository,
      { findByUserId: jest.fn().mockResolvedValue(null), upsert: jest.fn(), findEligibleUserIds: jest.fn().mockResolvedValue([]), createDefault: jest.fn() } as unknown as NotificationPreferenceRepository,
      { parseVoice: jest.fn().mockResolvedValue([]), parseImage: jest.fn().mockResolvedValue([]) } as unknown as MultimodalParser,
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
      new ConfirmationManager(),
      { isAdmin: jest.fn().mockReturnValue(false), isAdminCommand: jest.fn().mockReturnValue(false), handle: jest.fn(), notifyNewUser: jest.fn() } as unknown as AdminBotHandler,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as DeleteTransaction,
      new PendingEditManager(),
    );

    botService.onModuleInit();
  });

  function sendMessage(text: string): Promise<void> {
    return messageHandler({ userId: CHANNEL_USER_ID, channel: "telegram", text });
  }

  describe("xoá khoản <keyword>", () => {
    it("single match — shows confirmation keyboard", async () => {
      const tx: Transaction = {
        id: "tx-1", userId: INTERNAL_USER_ID, amount: 30000,
        category: "Ăn uống", note: "cà phê", spentAt: new Date(2026, 7, 2),
      };
      mockTransactionRepository.findByUserAndKeyword.mockResolvedValue([tx]);

      await sendMessage("xoá khoản cà phê");

      expect(mockTransactionRepository.findByUserAndKeyword).toHaveBeenCalledWith(INTERNAL_USER_ID, "cà phê", 5);
      expect(mockChannelAdapter.sendTextWithKeyboard).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        expect.stringContaining("30.000"),
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({ text: "✅ Xoá", callbackData: "del:tx-1" }),
          ]),
        ]),
      );
    });

    it("multiple matches — shows numbered list with keyboard", async () => {
      const txs: Transaction[] = [
        { id: "tx-1", userId: INTERNAL_USER_ID, amount: 30000, category: "Ăn uống", note: "cà phê", spentAt: new Date(2026, 7, 3) },
        { id: "tx-2", userId: INTERNAL_USER_ID, amount: 25000, category: "Ăn uống", note: "cà phê sữa", spentAt: new Date(2026, 7, 1) },
      ];
      mockTransactionRepository.findByUserAndKeyword.mockResolvedValue(txs);

      await sendMessage("xoá khoản cà phê");

      const sentText = mockChannelAdapter.sendTextWithKeyboard.mock.calls[0][1];
      expect(sentText).toContain("2 khoản");
      expect(sentText).toContain("30.000");
      expect(sentText).toContain("25.000");

      const keyboard = mockChannelAdapter.sendTextWithKeyboard.mock.calls[0][2] as InlineButton[][];
      expect(keyboard[0]).toContainEqual(expect.objectContaining({ callbackData: "del:tx-1" }));
      expect(keyboard[0]).toContainEqual(expect.objectContaining({ callbackData: "del:tx-2" }));
    });

    it("no match — shows not found message", async () => {
      mockTransactionRepository.findByUserAndKeyword.mockResolvedValue([]);

      await sendMessage("xoá khoản xyz");

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        expect.stringContaining("Không tìm thấy"),
      );
    });
  });

  describe("bare xoá still works", () => {
    it('"xoá" without keyword calls undoLastTransaction', async () => {
      await sendMessage("xoá");

      // Should NOT call findByUserAndKeyword (that's for keyword search)
      expect(mockTransactionRepository.findByUserAndKeyword).not.toHaveBeenCalled();
    });
  });
});
