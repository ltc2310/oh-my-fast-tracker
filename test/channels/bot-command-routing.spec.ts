import { BotService } from "../../src/infrastructure/channels/bot.service";
import { ChannelAdapter, IncomingMessage, SentMessage } from "../../src/domain/ports/ChannelAdapter";
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
import { DeleteTransaction } from "../../src/application/usecases/DeleteTransaction";
import { EditIntentDetector } from "../../src/domain/ports/EditIntentDetector";
import { TransactionRepository } from "../../src/domain/ports/TransactionRepository";
import { NotificationPreferenceRepository } from "../../src/domain/ports/NotificationPreferenceRepository";
import { MultimodalParser } from "../../src/domain/ports/MultimodalParser";
import { AdminBotHandler } from "../../src/infrastructure/channels/AdminBotHandler";
import { ConfirmationManager } from "../../src/application/services/ConfirmationManager";
import { PendingEditManager } from "../../src/application/services/PendingEditManager";
import { ConfigType } from "@nestjs/config";
import { appConfig } from "../../src/infrastructure/config/app.config";
import { Transaction } from "../../src/domain/entities/Transaction";

/**
 * REGRESSION GUARD — command routing.
 *
 * Covers routing bugs that shipped once and must not come back:
 *   - "xoá khoản vừa rồi" being swallowed by the keyword-delete pattern
 *   - "định mức <cat> 5000000" (no unit) being recorded as an EXPENSE
 *   - "chi tiêu hôm nay" matching nothing at all
 */
describe("BotService — command routing (regression guard)", () => {
  const CHANNEL_USER_ID = "chat-1";
  const INTERNAL_USER_ID = "uuid-1";

  let messageHandler: (msg: IncomingMessage) => Promise<void>;
  let adapter: { onMessage: jest.Mock; onCallbackQuery: jest.Mock; sendText: jest.Mock; sendTextWithKeyboard: jest.Mock; sendLink: jest.Mock; start: jest.Mock; answerCallbackQuery: jest.Mock; editMessageText: jest.Mock };
  let txRepo: { save: jest.Mock; findById: jest.Mock; findLastByUser: jest.Mock; findRecentByUser: jest.Mock; findByUserAndKeyword: jest.Mock; findByUserAndDateRange: jest.Mock; deleteById: jest.Mock; update: jest.Mock; findDistinctUserIds: jest.Mock };
  let recordTx: jest.Mock;
  let listTx: jest.Mock;
  let setBudget: jest.Mock;
  let undoLast: jest.Mock;

  const sampleTx: Transaction = { id: "tx-1", userId: INTERNAL_USER_ID, amount: 50000, category: "Ăn uống", note: "ăn trưa", spentAt: new Date() };

  beforeEach(() => {
    adapter = {
      onMessage: jest.fn((h) => { messageHandler = h; }),
      onCallbackQuery: jest.fn(),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendTextWithKeyboard: jest.fn().mockResolvedValue({ messageId: 1, chatId: 2 } as SentMessage),
      sendLink: jest.fn(), start: jest.fn(),
      answerCallbackQuery: jest.fn(), editMessageText: jest.fn(),
    };
    txRepo = {
      save: jest.fn().mockResolvedValue(sampleTx),
      findById: jest.fn().mockResolvedValue(sampleTx),
      findLastByUser: jest.fn().mockResolvedValue(sampleTx),
      findRecentByUser: jest.fn().mockResolvedValue([]),
      findByUserAndKeyword: jest.fn().mockResolvedValue([]),
      findByUserAndDateRange: jest.fn().mockResolvedValue([]),
      deleteById: jest.fn().mockResolvedValue(true),
      update: jest.fn().mockResolvedValue(sampleTx),
      findDistinctUserIds: jest.fn().mockResolvedValue([]),
    };
    recordTx = jest.fn().mockResolvedValue([]);
    listTx = jest.fn().mockResolvedValue({ transactions: [], total: 0, totalIncome: 0, hasMore: false });
    setBudget = jest.fn().mockResolvedValue({});
    undoLast = jest.fn().mockResolvedValue(sampleTx);

    const bot = new BotService(
      adapter as unknown as ChannelAdapter,
      { generateReportToken: jest.fn().mockReturnValue("t"), verifyReportToken: jest.fn(), generateToken: jest.fn(), verifyToken: jest.fn() } as unknown as TokenService,
      { webviewBaseUrl: "http://web" } as unknown as ConfigType<typeof appConfig>,
      { detect: jest.fn().mockResolvedValue(null) } as unknown as EditIntentDetector,
      txRepo as unknown as TransactionRepository,
      { findByUserId: jest.fn().mockResolvedValue(null), upsert: jest.fn(), findEligibleUserIds: jest.fn().mockResolvedValue([]), createDefault: jest.fn() } as unknown as NotificationPreferenceRepository,
      { parseVoice: jest.fn(), parseImage: jest.fn() } as unknown as MultimodalParser,
      { execute: recordTx } as unknown as RecordTransaction,
      { execute: listTx } as unknown as ListTransactions,
      { execute: setBudget } as unknown as SetBudgetLimit,
      { execute: jest.fn().mockResolvedValue({ statuses: [], totalLimit: 0, totalSpent: 0 }) } as unknown as GetBudgetStatus,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as CheckBudgetAfterRecord,
      { execute: jest.fn().mockResolvedValue(true) } as unknown as DeleteBudgetLimit,
      { execute: jest.fn().mockResolvedValue({ total: 0, byCategory: [], transactions: [], from: new Date(), to: new Date() }) } as unknown as GenerateWeeklyReport,
      { execute: jest.fn().mockResolvedValue({}) } as unknown as GenerateTrendReport,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as CompareMonths,
      { execute: jest.fn().mockResolvedValue({ allowed: true, isFirstMessage: false, user: { id: INTERNAL_USER_ID } }) } as unknown as CheckUserAccess,
      { execute: undoLast } as unknown as UndoLastTransaction,
      { execute: jest.fn().mockResolvedValue(sampleTx) } as unknown as EditTransaction,
      new ConfirmationManager(),
      { isAdmin: jest.fn().mockReturnValue(false), isAdminCommand: jest.fn().mockReturnValue(false), handle: jest.fn(), notifyNewUser: jest.fn() } as unknown as AdminBotHandler,
      { execute: jest.fn().mockResolvedValue(sampleTx) } as unknown as DeleteTransaction,
      new PendingEditManager(),
    );
    bot.onModuleInit();
  });

  const send = (text: string) => messageHandler({ userId: CHANNEL_USER_ID, channel: "telegram", text });

  describe("bare undo must not be treated as a keyword search", () => {
    // These all previously broke: UNDO_KEYWORD_REGEX captured "vừa rồi" / "cuối" as a keyword
    const bareForms = [
      "xoá",
      "xóa",
      "xoá khoản vừa rồi",
      "xoá khoản cuối",
      "xoá khoản gần nhất",
      "xoá khoản mới nhất",
      "xoá khoản lần trước",
      "huỷ khoản vừa rồi",
    ];

    for (const form of bareForms) {
      it(`"${form}" → UndoLastTransaction (not keyword search)`, async () => {
        await send(form);

        expect(undoLast).toHaveBeenCalledWith(INTERNAL_USER_ID);
        expect(txRepo.findByUserAndKeyword).not.toHaveBeenCalled();
      });
    }

    it('"xoá khoản cà phê" → keyword search (real keyword still works)', async () => {
      await send("xoá khoản cà phê");

      expect(txRepo.findByUserAndKeyword).toHaveBeenCalledWith(INTERNAL_USER_ID, "cà phê", 5);
      expect(undoLast).not.toHaveBeenCalled();
    });
  });

  describe("budget amount parsing must never fall through to expense recording", () => {
    it('"định mức ăn uống 5tr" → 5,000,000', async () => {
      await send("định mức ăn uống 5tr");
      expect(setBudget).toHaveBeenCalledWith(INTERNAL_USER_ID, "Ăn uống", 5_000_000);
      expect(recordTx).not.toHaveBeenCalled();
    });

    it('"định mức ăn uống 500k" → 500,000', async () => {
      await send("định mức ăn uống 500k");
      expect(setBudget).toHaveBeenCalledWith(INTERNAL_USER_ID, "Ăn uống", 500_000);
      expect(recordTx).not.toHaveBeenCalled();
    });

    it('"định mức ăn uống 5000000" (no unit) → 5,000,000 and NOT recorded as an expense', async () => {
      await send("định mức ăn uống 5000000");

      expect(setBudget).toHaveBeenCalledWith(INTERNAL_USER_ID, "Ăn uống", 5_000_000);
      // The bug: this used to create a 5,000,000đ expense in "Ăn uống"
      expect(recordTx).not.toHaveBeenCalled();
    });

    it('"định mức ăn uống 5" → rejected with guidance, no expense recorded', async () => {
      await send("định mức ăn uống 5");

      expect(setBudget).not.toHaveBeenCalled();
      expect(recordTx).not.toHaveBeenCalled();
      expect(adapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        expect.stringContaining("quá nhỏ"),
      );
    });
  });

  describe("list-transaction phrasings", () => {
    it('"hôm nay chi gì" → ListTransactions', async () => {
      await send("hôm nay chi gì");
      expect(listTx).toHaveBeenCalled();
      expect(recordTx).not.toHaveBeenCalled();
    });

    it('"chi tiêu hôm nay" → ListTransactions (used to match nothing)', async () => {
      await send("chi tiêu hôm nay");
      expect(listTx).toHaveBeenCalled();
      expect(recordTx).not.toHaveBeenCalled();
    });

    it('"chi tiêu hôm qua" → ListTransactions', async () => {
      await send("chi tiêu hôm qua");
      expect(listTx).toHaveBeenCalled();
      expect(recordTx).not.toHaveBeenCalled();
    });

    it('"hôm qua chi gì" → ListTransactions', async () => {
      await send("hôm qua chi gì");
      expect(listTx).toHaveBeenCalled();
      expect(recordTx).not.toHaveBeenCalled();
    });

    it('"chi tiêu tháng này" still routes to the aggregate report, not the list', async () => {
      await send("chi tiêu tháng này");
      expect(listTx).not.toHaveBeenCalled();
    });
  });
});
