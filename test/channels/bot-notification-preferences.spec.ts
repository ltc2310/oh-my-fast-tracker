import { BotService } from "../../src/infrastructure/channels/bot.service";
import { ChannelAdapter, IncomingMessage } from "../../src/domain/ports/ChannelAdapter";
import { TokenService } from "../../src/domain/ports/TokenService";
import { EditIntentDetector } from "../../src/domain/ports/EditIntentDetector";
import { TransactionRepository } from "../../src/domain/ports/TransactionRepository";
import { NotificationPreferenceRepository } from "../../src/domain/ports/NotificationPreferenceRepository";
import { RecordTransaction } from "../../src/application/usecases/RecordTransaction";
import { SetBudgetLimit } from "../../src/application/usecases/SetBudgetLimit";
import { GetBudgetStatus } from "../../src/application/usecases/GetBudgetStatus";
import { CheckBudgetAfterRecord } from "../../src/application/usecases/CheckBudgetAfterRecord";
import { DeleteBudgetLimit } from "../../src/application/usecases/DeleteBudgetLimit";
import { ListTransactions } from "../../src/application/usecases/ListTransactions";
import { GenerateWeeklyReport } from "../../src/application/usecases/GenerateWeeklyReport";
import { GenerateTrendReport } from "../../src/application/usecases/GenerateTrendReport";
import { CheckUserAccess, CheckUserAccessResult } from "../../src/application/usecases/CheckUserAccess";
import { UndoLastTransaction } from "../../src/application/usecases/UndoLastTransaction";
import { EditTransaction } from "../../src/application/usecases/EditTransaction";
import { CompareMonths } from "../../src/application/usecases/CompareMonths";
import { NotificationPreference } from "../../src/domain/entities/NotificationPreference";
import { MultimodalParser } from "../../src/domain/ports/MultimodalParser";
import { DeleteTransaction } from "../../src/application/usecases/DeleteTransaction";
import { PendingEditManager } from "../../src/application/services/PendingEditManager";
import { AdminBotHandler } from "../../src/infrastructure/channels/AdminBotHandler";
import { ConfirmationManager } from "../../src/application/services/ConfirmationManager";
import { ConfigType } from "@nestjs/config";
import { appConfig } from "../../src/infrastructure/config/app.config";

describe("BotService - Notification Preference Commands", () => {
  let botService: BotService;
  let messageHandler: (msg: IncomingMessage) => Promise<void>;

  // Mocks
  let mockChannelAdapter: jest.Mocked<ChannelAdapter>;
  let mockNotificationPreferenceRepository: jest.Mocked<NotificationPreferenceRepository>;
  let mockCheckUserAccess: jest.Mocked<CheckUserAccess>;

  const mockConfig = { webviewBaseUrl: "http://localhost:3000/report" };
  const internalUserId = "uuid-internal-123";

  beforeEach(() => {
    mockChannelAdapter = {
      onMessage: jest.fn((handler) => {
        messageHandler = handler;
      }),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendLink: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationPreferenceRepository = {
      findByUserId: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({} as NotificationPreference),
      findEligibleUserIds: jest.fn().mockResolvedValue([]),
      createDefault: jest.fn().mockResolvedValue({} as NotificationPreference),
    };

    mockCheckUserAccess = {
      execute: jest.fn().mockResolvedValue({
        allowed: true,
        isFirstMessage: false,
        user: { id: internalUserId, channel: "telegram", channelUserId: "tg-user-1", accessStatus: "whitelisted", plan: "free" },
      }),
    } as unknown as jest.Mocked<CheckUserAccess>;

    botService = new BotService(
      mockChannelAdapter,
      {
        generateReportToken: jest.fn().mockReturnValue("fake-token"),
        verifyReportToken: jest.fn(),
        generateToken: jest.fn(),
        verifyToken: jest.fn(),
      } as unknown as TokenService,
      mockConfig as unknown as ConfigType<typeof appConfig>,
      { detect: jest.fn().mockResolvedValue(null) } as unknown as EditIntentDetector,
      { findLastByUser: jest.fn().mockResolvedValue(null), findRecentByUser: jest.fn().mockResolvedValue([]) } as unknown as TransactionRepository,
      mockNotificationPreferenceRepository,
      { parseVoice: jest.fn().mockResolvedValue([]), parseImage: jest.fn().mockResolvedValue([]) } as unknown as MultimodalParser,
      { execute: jest.fn().mockResolvedValue([]) } as unknown as RecordTransaction,
      { execute: jest.fn().mockResolvedValue({ transactions: [], total: 0, totalIncome: 0, hasMore: false }) } as unknown as ListTransactions,
      { execute: jest.fn().mockResolvedValue({}) } as unknown as SetBudgetLimit,
      { execute: jest.fn().mockResolvedValue({ statuses: [], totalLimit: 0, totalSpent: 0 }) } as unknown as GetBudgetStatus,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as CheckBudgetAfterRecord,
      { execute: jest.fn().mockResolvedValue(false) } as unknown as DeleteBudgetLimit,
      { execute: jest.fn().mockResolvedValue({ total: 0, byCategory: [] }) } as unknown as GenerateWeeklyReport,
      { execute: jest.fn().mockResolvedValue({}) } as unknown as GenerateTrendReport,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as CompareMonths,
      mockCheckUserAccess,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as UndoLastTransaction,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as EditTransaction,
      { set: jest.fn(), get: jest.fn(), has: jest.fn().mockReturnValue(false), clear: jest.fn() } as unknown as ConfirmationManager,
      { isAdmin: jest.fn().mockReturnValue(false), isAdminCommand: jest.fn().mockReturnValue(false), handle: jest.fn(), notifyNewUser: jest.fn() } as unknown as AdminBotHandler,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as DeleteTransaction,
      new PendingEditManager(),
    );

    botService.onModuleInit();
  });

  function sendMessage(text: string): Promise<void> {
    return messageHandler({ userId: "tg-user-1", channel: "telegram", text, username: "testuser" });
  }

  describe("Enable daily reminder", () => {
    it('"bật nhắc nhở" enables daily reminder and confirms', async () => {
      await sendMessage("bật nhắc nhở");

      expect(mockNotificationPreferenceRepository.upsert).toHaveBeenCalledWith(
        internalUserId,
        { dailyReminder: true },
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        "✅ Đã bật nhắc nhở hàng ngày. Mình sẽ nhắc bạn ghi chi tiêu mỗi tối nếu bạn chưa ghi.",
      );
    });

    it('"bật thông báo hàng ngày" enables daily reminder', async () => {
      await sendMessage("bật thông báo hàng ngày");

      expect(mockNotificationPreferenceRepository.upsert).toHaveBeenCalledWith(
        internalUserId,
        { dailyReminder: true },
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        "✅ Đã bật nhắc nhở hàng ngày. Mình sẽ nhắc bạn ghi chi tiêu mỗi tối nếu bạn chưa ghi.",
      );
    });
  });

  describe("Disable daily reminder", () => {
    it('"tắt nhắc nhở" disables daily reminder and confirms', async () => {
      await sendMessage("tắt nhắc nhở");

      expect(mockNotificationPreferenceRepository.upsert).toHaveBeenCalledWith(
        internalUserId,
        { dailyReminder: false },
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        "🔕 Đã tắt nhắc nhở hàng ngày.",
      );
    });

    it('"tắt thông báo hàng ngày" disables daily reminder', async () => {
      await sendMessage("tắt thông báo hàng ngày");

      expect(mockNotificationPreferenceRepository.upsert).toHaveBeenCalledWith(
        internalUserId,
        { dailyReminder: false },
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        "🔕 Đã tắt nhắc nhở hàng ngày.",
      );
    });
  });

  describe("Enable weekly digest", () => {
    it('"bật báo cáo tuần" enables weekly digest and confirms', async () => {
      await sendMessage("bật báo cáo tuần");

      expect(mockNotificationPreferenceRepository.upsert).toHaveBeenCalledWith(
        internalUserId,
        { weeklyDigest: true },
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        "✅ Đã bật báo cáo tuần. Mỗi Chủ nhật bạn sẽ nhận tổng kết chi tiêu tuần.",
      );
    });
  });

  describe("Disable weekly digest", () => {
    it('"tắt báo cáo tuần" disables weekly digest and confirms', async () => {
      await sendMessage("tắt báo cáo tuần");

      expect(mockNotificationPreferenceRepository.upsert).toHaveBeenCalledWith(
        internalUserId,
        { weeklyDigest: false },
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        "🔕 Đã tắt báo cáo tuần.",
      );
    });
  });

  describe("Enable monthly summary", () => {
    it('"bật báo cáo tháng" enables monthly summary and confirms', async () => {
      await sendMessage("bật báo cáo tháng");

      expect(mockNotificationPreferenceRepository.upsert).toHaveBeenCalledWith(
        internalUserId,
        { monthlySummary: true },
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        "✅ Đã bật báo cáo tháng. Cuối mỗi tháng bạn sẽ nhận tổng kết chi tiêu.",
      );
    });
  });

  describe("Disable monthly summary", () => {
    it('"tắt báo cáo tháng" disables monthly summary and confirms', async () => {
      await sendMessage("tắt báo cáo tháng");

      expect(mockNotificationPreferenceRepository.upsert).toHaveBeenCalledWith(
        internalUserId,
        { monthlySummary: false },
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        "🔕 Đã tắt báo cáo tháng.",
      );
    });
  });

  describe("View notification status", () => {
    it('"xem thông báo" shows current preferences (all enabled by default when no record)', async () => {
      mockNotificationPreferenceRepository.findByUserId.mockResolvedValue(null);

      await sendMessage("xem thông báo");

      expect(mockNotificationPreferenceRepository.findByUserId).toHaveBeenCalledWith(internalUserId);
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        expect.stringContaining("Nhắc nhở hàng ngày: ✅ Bật"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        expect.stringContaining("Báo cáo tuần: ✅ Bật"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        expect.stringContaining("Báo cáo tháng: ✅ Bật"),
      );
    });

    it('"cài đặt thông báo" shows preferences with some disabled', async () => {
      mockNotificationPreferenceRepository.findByUserId.mockResolvedValue({
        userId: internalUserId,
        dailyReminder: true,
        weeklyDigest: false,
        monthlySummary: true,
      });

      await sendMessage("cài đặt thông báo");

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        expect.stringContaining("Nhắc nhở hàng ngày: ✅ Bật"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        expect.stringContaining("Báo cáo tuần: 🔕 Tắt"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        expect.stringContaining("Báo cáo tháng: ✅ Bật"),
      );
    });

    it('"xem thông báo" shows all disabled when all preferences are off', async () => {
      mockNotificationPreferenceRepository.findByUserId.mockResolvedValue({
        userId: internalUserId,
        dailyReminder: false,
        weeklyDigest: false,
        monthlySummary: false,
      });

      await sendMessage("xem thông báo");

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        expect.stringContaining("Nhắc nhở hàng ngày: 🔕 Tắt"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        expect.stringContaining("Báo cáo tuần: 🔕 Tắt"),
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        "tg-user-1",
        expect.stringContaining("Báo cáo tháng: 🔕 Tắt"),
      );
    });
  });

  describe("Commands are not processed for non-whitelisted users", () => {
    it("pending user cannot use notification commands", async () => {
      mockCheckUserAccess.execute.mockResolvedValue({
        allowed: false,
        isFirstMessage: false,
        user: { id: internalUserId, channel: "telegram", channelUserId: "tg-user-1", accessStatus: "pending", plan: "free" },
      } as unknown as CheckUserAccessResult);

      await sendMessage("bật nhắc nhở");

      expect(mockNotificationPreferenceRepository.upsert).not.toHaveBeenCalled();
    });
  });
});
