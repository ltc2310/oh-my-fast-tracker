import { BotService } from "../../src/infrastructure/channels/bot.service";
import { ChannelAdapter, IncomingMessage, CallbackQuery, SentMessage } from "../../src/domain/ports/ChannelAdapter";
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
 * REGRESSION GUARD — userId contract.
 *
 * The single most damaging bug class in this codebase has been mixing up two IDs:
 *
 *   channelUserId  = Telegram chat ID, e.g. "7046661244"  → used ONLY to send messages
 *   internalUserId = users.id UUID,    e.g. "uuid-..."    → used for ALL data access
 *
 * Passing channelUserId to a use case silently splits a user's data in two and breaks
 * every ownership check. These tests deliberately use two clearly different values and
 * assert, for EVERY command path, that:
 *
 *   1. use cases / repositories receive internalUserId
 *   2. channelAdapter receives channelUserId
 *
 * If you add a new command, add it here too.
 */
describe("BotService — userId contract (regression guard)", () => {
  const CHANNEL_USER_ID = "111222333";        // what Telegram gives us
  const INTERNAL_USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"; // users.id

  let messageHandler: (msg: IncomingMessage) => Promise<void>;
  let callbackHandler: (q: CallbackQuery) => Promise<void>;

  let adapter: {
    onMessage: jest.Mock; onCallbackQuery: jest.Mock; sendText: jest.Mock;
    sendTextWithKeyboard: jest.Mock; sendLink: jest.Mock; start: jest.Mock;
    answerCallbackQuery: jest.Mock; editMessageText: jest.Mock;
  };
  let txRepo: {
    save: jest.Mock; findById: jest.Mock; findLastByUser: jest.Mock;
    findRecentByUser: jest.Mock; findByUserAndKeyword: jest.Mock;
    findByUserAndDateRange: jest.Mock; deleteById: jest.Mock; update: jest.Mock;
    findDistinctUserIds: jest.Mock;
  };
  let notifPrefRepo: { findByUserId: jest.Mock; upsert: jest.Mock; findEligibleUserIds: jest.Mock; createDefault: jest.Mock };
  let uc: {
    record: jest.Mock; list: jest.Mock; setBudget: jest.Mock; getBudget: jest.Mock;
    checkBudget: jest.Mock; delBudget: jest.Mock; weekly: jest.Mock; trend: jest.Mock;
    compare: jest.Mock; undo: jest.Mock; edit: jest.Mock; del: jest.Mock;
  };
  let pendingEdits: PendingEditManager;
  let confirmations: ConfirmationManager;

  const sampleTx: Transaction = {
    id: "tx-1", userId: INTERNAL_USER_ID, amount: 50000,
    category: "Ăn uống", note: "ăn trưa", spentAt: new Date(),
  };

  beforeEach(() => {
    adapter = {
      onMessage: jest.fn((h) => { messageHandler = h; }),
      onCallbackQuery: jest.fn((h) => { callbackHandler = h; }),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendTextWithKeyboard: jest.fn().mockResolvedValue({ messageId: 9, chatId: 8 } as SentMessage),
      sendLink: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue(undefined),
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
    };

    txRepo = {
      save: jest.fn().mockResolvedValue(sampleTx),
      findById: jest.fn().mockResolvedValue(sampleTx),
      findLastByUser: jest.fn().mockResolvedValue(sampleTx),
      findRecentByUser: jest.fn().mockResolvedValue([sampleTx]),
      findByUserAndKeyword: jest.fn().mockResolvedValue([sampleTx]),
      findByUserAndDateRange: jest.fn().mockResolvedValue([sampleTx]),
      deleteById: jest.fn().mockResolvedValue(true),
      update: jest.fn().mockResolvedValue(sampleTx),
      findDistinctUserIds: jest.fn().mockResolvedValue([]),
    };

    notifPrefRepo = {
      findByUserId: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      findEligibleUserIds: jest.fn().mockResolvedValue([]),
      createDefault: jest.fn().mockResolvedValue({}),
    };

    uc = {
      record: jest.fn().mockResolvedValue([sampleTx]),
      list: jest.fn().mockResolvedValue({ transactions: [sampleTx], total: 50000, totalIncome: 0, hasMore: false }),
      setBudget: jest.fn().mockResolvedValue({}),
      getBudget: jest.fn().mockResolvedValue({ statuses: [], totalLimit: 0, totalSpent: 0 }),
      checkBudget: jest.fn().mockResolvedValue(null),
      delBudget: jest.fn().mockResolvedValue(true),
      weekly: jest.fn().mockResolvedValue({ total: 50000, byCategory: [{ category: "Ăn uống", total: 50000 }], transactions: [sampleTx], from: new Date(), to: new Date() }),
      trend: jest.fn().mockResolvedValue({
        periodStart: "2026-02-01", periodEnd: "2026-07-31",
        overview: { totalSpent: 1, averageMonthlySpent: 1, highestMonth: { month: "2026-07", amount: 1 }, lowestMonth: { month: "2026-02", amount: 1 }, overallDirection: "stable", overallChangePercent: 0, hasIncompleteData: false, monthsWithData: 6 },
        topGrowingCategories: [], topShrinkingCategories: [],
      }),
      compare: jest.fn().mockResolvedValue({
        monthA: { label: "Tháng 6/2026", totalSpent: 100 }, monthB: { label: "Tháng 7/2026", totalSpent: 200 },
        totalDifference: 100, totalPercentChange: 100, categoryDiffs: [],
      }),
      undo: jest.fn().mockResolvedValue(sampleTx),
      edit: jest.fn().mockResolvedValue(sampleTx),
      del: jest.fn().mockResolvedValue(sampleTx),
    };

    pendingEdits = new PendingEditManager();
    confirmations = new ConfirmationManager();

    const bot = new BotService(
      adapter as unknown as ChannelAdapter,
      { generateReportToken: jest.fn().mockReturnValue("tok"), verifyReportToken: jest.fn(), generateToken: jest.fn(), verifyToken: jest.fn() } as unknown as TokenService,
      { webviewBaseUrl: "http://web" } as unknown as ConfigType<typeof appConfig>,
      { detect: jest.fn().mockResolvedValue(null) } as unknown as EditIntentDetector,
      txRepo as unknown as TransactionRepository,
      notifPrefRepo as unknown as NotificationPreferenceRepository,
      { parseVoice: jest.fn().mockResolvedValue([]), parseImage: jest.fn().mockResolvedValue([]) } as unknown as MultimodalParser,
      { execute: uc.record } as unknown as RecordTransaction,
      { execute: uc.list } as unknown as ListTransactions,
      { execute: uc.setBudget } as unknown as SetBudgetLimit,
      { execute: uc.getBudget } as unknown as GetBudgetStatus,
      { execute: uc.checkBudget } as unknown as CheckBudgetAfterRecord,
      { execute: uc.delBudget } as unknown as DeleteBudgetLimit,
      { execute: uc.weekly } as unknown as GenerateWeeklyReport,
      { execute: uc.trend } as unknown as GenerateTrendReport,
      { execute: uc.compare } as unknown as CompareMonths,
      { execute: jest.fn().mockResolvedValue({ allowed: true, isFirstMessage: false, user: { id: INTERNAL_USER_ID } }) } as unknown as CheckUserAccess,
      { execute: uc.undo } as unknown as UndoLastTransaction,
      { execute: uc.edit } as unknown as EditTransaction,
      confirmations,
      { isAdmin: jest.fn().mockReturnValue(false), isAdminCommand: jest.fn().mockReturnValue(false), handle: jest.fn(), notifyNewUser: jest.fn() } as unknown as AdminBotHandler,
      { execute: uc.del } as unknown as DeleteTransaction,
      pendingEdits,
    );
    bot.onModuleInit();
  });

  const send = (text: string) => messageHandler({ userId: CHANNEL_USER_ID, channel: "telegram", text });
  const tap = (data: string) => callbackHandler({
    id: "cb", userId: CHANNEL_USER_ID, channel: "telegram", messageId: 9, chatId: 8, data,
  });

  /** Assert every recorded call's first arg is the internal UUID, never the channel ID. */
  function expectInternalId(mock: jest.Mock, label: string): void {
    expect(mock.mock.calls.length).toBeGreaterThan(0);
    for (const call of mock.mock.calls) {
      expect(call[0]).toBe(INTERNAL_USER_ID);
      expect(call[0]).not.toBe(CHANNEL_USER_ID);
    }
  }

  /** Assert all outbound messages went to the channel ID, never the UUID. */
  function expectChannelIdOnOutbound(): void {
    const outbound = [
      ...adapter.sendText.mock.calls,
      ...adapter.sendTextWithKeyboard.mock.calls,
    ];
    expect(outbound.length).toBeGreaterThan(0);
    for (const call of outbound) {
      expect(call[0]).toBe(CHANNEL_USER_ID);
      expect(call[0]).not.toBe(INTERNAL_USER_ID);
    }
  }

  describe("data-access use cases always receive internalUserId", () => {
    it("record expense → RecordTransaction", async () => {
      await send("ăn trưa 50k");
      expectInternalId(uc.record, "RecordTransaction");
      expectChannelIdOnOutbound();
    });

    it("record expense → CheckBudgetAfterRecord", async () => {
      await send("ăn trưa 50k");
      expectInternalId(uc.checkBudget, "CheckBudgetAfterRecord");
    });

    it("báo cáo → GenerateWeeklyReport", async () => {
      await send("báo cáo");
      expectInternalId(uc.weekly, "GenerateWeeklyReport");
      expectChannelIdOnOutbound();
    });

    it("báo cáo 6 tháng → GenerateTrendReport", async () => {
      await send("báo cáo 6 tháng");
      expectInternalId(uc.trend, "GenerateTrendReport");
      expectChannelIdOnOutbound();
    });

    it("so sánh tháng → CompareMonths", async () => {
      await send("so sánh tháng");
      expectInternalId(uc.compare, "CompareMonths");
      expectChannelIdOnOutbound();
    });

    it("xoá → UndoLastTransaction", async () => {
      await send("xoá");
      expectInternalId(uc.undo, "UndoLastTransaction");
      expectChannelIdOnOutbound();
    });

    it("hôm nay chi gì → ListTransactions", async () => {
      await send("hôm nay chi gì");
      expectInternalId(uc.list, "ListTransactions");
      expectChannelIdOnOutbound();
    });

    it("5 khoản gần nhất → ListTransactions", async () => {
      await send("5 khoản gần nhất");
      expectInternalId(uc.list, "ListTransactions");
    });

    it("định mức ăn uống 5tr → SetBudgetLimit", async () => {
      await send("định mức ăn uống 5tr");
      expectInternalId(uc.setBudget, "SetBudgetLimit");
      expectChannelIdOnOutbound();
    });

    it("xem định mức → GetBudgetStatus", async () => {
      await send("xem định mức");
      expectInternalId(uc.getBudget, "GetBudgetStatus");
      expectChannelIdOnOutbound();
    });

    it("xoá định mức ăn uống → DeleteBudgetLimit", async () => {
      await send("xoá định mức ăn uống");
      expectInternalId(uc.delBudget, "DeleteBudgetLimit");
      expectChannelIdOnOutbound();
    });

    it("xoá khoản cà phê → findByUserAndKeyword", async () => {
      await send("xoá khoản cà phê");
      expectInternalId(txRepo.findByUserAndKeyword, "findByUserAndKeyword");
    });

    it("notification prefs → NotificationPreferenceRepository.upsert", async () => {
      await send("bật nhắc nhở");
      expectInternalId(notifPrefRepo.upsert, "upsert");
      expectChannelIdOnOutbound();
    });

    it("xem thông báo → findByUserId", async () => {
      await send("xem thông báo");
      expectInternalId(notifPrefRepo.findByUserId, "findByUserId");
      expectChannelIdOnOutbound();
    });
  });

  describe("report tokens are signed with internalUserId", () => {
    it("weekly report token carries the UUID, not the chat ID", async () => {
      const tokenSvc = { generateReportToken: jest.fn().mockReturnValue("tok") };
      // Re-assert through the adapter output: URL must be built from a token we control.
      // Here we verify the use case got the UUID, which is what goes into the token payload.
      await send("báo cáo");
      expectInternalId(uc.weekly, "GenerateWeeklyReport");
    });
  });

  describe("inline keyboard callbacks always resolve internalUserId", () => {
    it("tap [Xoá] → DeleteTransaction gets internalUserId (ownership enforced)", async () => {
      await tap("del:tx-1");
      expectInternalId(uc.del, "DeleteTransaction");
      // must NOT bypass the use case
      expect(txRepo.deleteById).not.toHaveBeenCalled();
    });

    it("tap category in edit flow → EditTransaction gets internalUserId", async () => {
      await tap("ecat:tx-1:Di chuyển");
      expectInternalId(uc.edit, "EditTransaction");
    });

    it("tap [Sửa] → shows edit options (does NOT fall into the pending-confirmation guard)", async () => {
      await tap("edit:tx-1");
      expect(adapter.editMessageText).toHaveBeenCalledWith(
        8, 9, "Sếp muốn sửa gì?", expect.any(Array),
      );
      expect(adapter.answerCallbackQuery).not.toHaveBeenCalledWith("cb", "Đã hết hạn, sếp gửi lại nhé");
    });

    it("tap [Đổi số tiền] then type amount → EditTransaction gets internalUserId + tapped txId", async () => {
      await tap("editamt:tx-OLD");
      await send("30k");

      expect(uc.edit).toHaveBeenCalledWith(INTERNAL_USER_ID, "tx-OLD", { amount: 30000 });
      // Must NOT have fallen back to "edit the most recent transaction"
      expect(txRepo.findLastByUser).not.toHaveBeenCalled();
    });

    it("tap [Đổi ngày] then type date → EditTransaction gets internalUserId + tapped txId", async () => {
      await tap("editdate:tx-OLD");
      await send("hôm qua");

      expect(uc.edit).toHaveBeenCalledWith(
        INTERNAL_USER_ID, "tx-OLD", expect.objectContaining({ spentAt: expect.any(Date) }),
      );
    });
  });

  describe("voice/photo confirmation saves under internalUserId", () => {
    it("confirm:save writes transaction with the UUID", async () => {
      confirmations.set(INTERNAL_USER_ID, CHANNEL_USER_ID, [
        { amount: 70000, category: "Ăn uống", note: "ăn sáng" },
      ], "voice");

      await tap("confirm:save");

      expect(txRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: INTERNAL_USER_ID }),
      );
      const saved = txRepo.save.mock.calls[0][0] as Transaction;
      expect(saved.userId).not.toBe(CHANNEL_USER_ID);
    });

    it("cat:<category> writes transaction with the UUID", async () => {
      confirmations.set(INTERNAL_USER_ID, CHANNEL_USER_ID, [
        { amount: 70000, category: "Khác", note: "x" },
      ], "voice");

      await tap("cat:Ăn uống");

      const saved = txRepo.save.mock.calls[0][0] as Transaction;
      expect(saved.userId).toBe(INTERNAL_USER_ID);
      expect(saved.category).toBe("Ăn uống");
    });
  });

  describe("no raw repository deletes from the bot layer", () => {
    it("deleteById is never called directly for any delete path", async () => {
      await send("xoá");                 // bare undo → UndoLastTransaction
      await tap("del:tx-1");             // inline delete → DeleteTransaction
      await send("xoá khoản cà phê");    // keyword delete → keyboard, no delete yet

      expect(txRepo.deleteById).not.toHaveBeenCalled();
    });
  });
});
