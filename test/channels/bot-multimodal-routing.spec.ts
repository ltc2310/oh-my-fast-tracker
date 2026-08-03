import { BotService } from "../../src/infrastructure/channels/bot.service";
import { ChannelAdapter, IncomingMessage } from "../../src/domain/ports/ChannelAdapter";
import { TokenService } from "../../src/domain/ports/TokenService";
import { RecordTransaction } from "../../src/application/usecases/RecordTransaction";
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
import { ConfirmationManager, PendingConfirmation } from "../../src/application/services/ConfirmationManager";
import { ParsedExpense } from "../../src/domain/ports/Parser";
import { ConfigType } from "@nestjs/config";
import { appConfig } from "../../src/infrastructure/config/app.config";

describe("BotService - Voice/Photo Multimodal Routing", () => {
  let botService: BotService;
  let messageHandler: (msg: IncomingMessage) => Promise<void>;

  // Mocks
  let mockChannelAdapter: jest.Mocked<ChannelAdapter>;
  let mockTokenService: jest.Mocked<TokenService>;
  let mockRecordTransaction: jest.Mocked<RecordTransaction>;
  let mockGenerateWeeklyReport: jest.Mocked<GenerateWeeklyReport>;
  let mockGenerateTrendReport: jest.Mocked<GenerateTrendReport>;
  let mockCheckUserAccess: jest.Mocked<CheckUserAccess>;
  let mockMultimodalParser: jest.Mocked<MultimodalParser>;
  let mockConfirmationManager: jest.Mocked<ConfirmationManager>;
  let mockTransactionRepository: jest.Mocked<TransactionRepository>;
  let mockUndoLastTransaction: jest.Mocked<UndoLastTransaction>;
  let mockEditIntentDetector: jest.Mocked<EditIntentDetector>;

  const mockConfig = { webviewBaseUrl: "http://localhost:3000/report" };
  const CHANNEL_USER_ID = "channel-user-1";
  const INTERNAL_USER_ID = "internal-user-id";

  const sampleExpense: ParsedExpense = {
    amount: 50000,
    category: "Ăn uống",
    note: "ăn trưa",
  };

  function makePendingConfirmation(expenses: ParsedExpense[] = [sampleExpense], source: "voice" | "photo" = "voice"): PendingConfirmation {
    return {
      userId: INTERNAL_USER_ID,
      channelUserId: CHANNEL_USER_ID,
      expenses,
      source,
      createdAt: new Date(),
      timeoutHandle: setTimeout(() => {}, 300000),
    };
  }

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
    } as unknown as jest.Mocked<RecordTransaction>;

    mockGenerateWeeklyReport = {
      execute: jest.fn().mockResolvedValue({ total: 0, byCategory: [], transactions: [], from: new Date(), to: new Date() }),
    } as unknown as jest.Mocked<GenerateWeeklyReport>;

    mockGenerateTrendReport = {
      execute: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<GenerateTrendReport>;

    mockCheckUserAccess = {
      execute: jest.fn().mockResolvedValue({
        allowed: true,
        isFirstMessage: false,
        user: { id: INTERNAL_USER_ID },
      }),
    } as unknown as jest.Mocked<CheckUserAccess>;

    mockMultimodalParser = {
      parseVoice: jest.fn().mockResolvedValue([]),
      parseImage: jest.fn().mockResolvedValue([]),
    };

    mockConfirmationManager = {
      set: jest.fn(),
      get: jest.fn().mockReturnValue(undefined),
      has: jest.fn().mockReturnValue(false),
      clear: jest.fn(),
      EXPIRY_MS: 300000,
    } as unknown as jest.Mocked<ConfirmationManager>;

    mockTransactionRepository = {
      save: jest.fn().mockResolvedValue({}),
      findLastByUser: jest.fn().mockResolvedValue(null),
      findByUserAndDateRange: jest.fn().mockResolvedValue([]),
      findDistinctUserIds: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      deleteById: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<TransactionRepository>;

    mockUndoLastTransaction = {
      execute: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<UndoLastTransaction>;

    mockEditIntentDetector = {
      detect: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<EditIntentDetector>;

    botService = new BotService(
      mockChannelAdapter,
      mockTokenService,
      mockConfig as unknown as ConfigType<typeof appConfig>,
      mockEditIntentDetector,
      mockTransactionRepository,
      { findByUserId: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}), findEligibleUserIds: jest.fn().mockResolvedValue([]), createDefault: jest.fn().mockResolvedValue({}) } as unknown as NotificationPreferenceRepository,
      mockMultimodalParser,
      mockRecordTransaction,
      mockGenerateWeeklyReport,
      mockGenerateTrendReport,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as CompareMonths,
      mockCheckUserAccess,
      mockUndoLastTransaction,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as EditTransaction,
      mockConfirmationManager,
    );

    botService.onModuleInit();
  });

  function sendVoiceMessage(voice: { data: Buffer; fileId: string; mimeType: string; duration: number }): Promise<void> {
    return messageHandler({
      userId: CHANNEL_USER_ID,
      channel: "telegram",
      text: "",
      voice,
    });
  }

  function sendPhotoMessage(photo: { data: Buffer; fileId: string; mimeType: string; fileSize: number }): Promise<void> {
    return messageHandler({
      userId: CHANNEL_USER_ID,
      channel: "telegram",
      text: "",
      photo,
    });
  }

  function sendTextMessage(text: string): Promise<void> {
    return messageHandler({
      userId: CHANNEL_USER_ID,
      channel: "telegram",
      text,
    });
  }

  describe("Voice message routing", () => {
    it("voice message → parseVoice called → confirmation sent", async () => {
      mockMultimodalParser.parseVoice.mockResolvedValue([sampleExpense]);

      await sendVoiceMessage({
        data: Buffer.from("audio-data"),
        fileId: "voice-1",
        mimeType: "audio/ogg",
        duration: 10,
      });

      expect(mockMultimodalParser.parseVoice).toHaveBeenCalledWith(
        Buffer.from("audio-data"),
        "audio/ogg",
      );
      expect(mockConfirmationManager.set).toHaveBeenCalledWith(
        INTERNAL_USER_ID,
        CHANNEL_USER_ID,
        [sampleExpense],
        "voice",
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        expect.stringContaining("Em nhận được"),
      );
    });

    it("voice empty result → 'Em không nghe rõ...' message", async () => {
      mockMultimodalParser.parseVoice.mockResolvedValue([]);

      await sendVoiceMessage({
        data: Buffer.from("audio-data"),
        fileId: "voice-1",
        mimeType: "audio/ogg",
        duration: 10,
      });

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        "Em không nghe rõ khoản chi tiêu trong tin nhắn thoại. Sếp thử ghi âm lại rõ hơn nhé 🎤",
      );
    });

    it("duration > 60s → rejection message, parser NOT called", async () => {
      await sendVoiceMessage({
        data: Buffer.from("audio-data"),
        fileId: "voice-1",
        mimeType: "audio/ogg",
        duration: 61,
      });

      expect(mockMultimodalParser.parseVoice).not.toHaveBeenCalled();
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        "Tin nhắn thoại hơi dài, sếp ghi âm ngắn gọn hơn (dưới 1 phút) nhé 🎤",
      );
    });

    it("Gemini API error → service unavailable message", async () => {
      mockMultimodalParser.parseVoice.mockRejectedValue(new Error("Connection timeout"));

      await sendVoiceMessage({
        data: Buffer.from("audio-data"),
        fileId: "voice-1",
        mimeType: "audio/ogg",
        duration: 10,
      });

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        "Hệ thống đang gặp sự cố tạm thời, sếp thử lại sau nhé 🙏",
      );
    });
  });

  describe("Photo message routing", () => {
    it("photo message → parseImage called → confirmation sent", async () => {
      mockMultimodalParser.parseImage.mockResolvedValue([sampleExpense]);

      await sendPhotoMessage({
        data: Buffer.from("image-data"),
        fileId: "photo-1",
        mimeType: "image/jpeg",
        fileSize: 500000,
      });

      expect(mockMultimodalParser.parseImage).toHaveBeenCalledWith(
        Buffer.from("image-data"),
        "image/jpeg",
      );
      expect(mockConfirmationManager.set).toHaveBeenCalledWith(
        INTERNAL_USER_ID,
        CHANNEL_USER_ID,
        [sampleExpense],
        "photo",
      );
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        expect.stringContaining("Em nhận được"),
      );
    });

    it("photo not bank transfer → 'Em không nhận ra...' message", async () => {
      mockMultimodalParser.parseImage.mockResolvedValue([]);

      await sendPhotoMessage({
        data: Buffer.from("image-data"),
        fileId: "photo-1",
        mimeType: "image/jpeg",
        fileSize: 500000,
      });

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        "Em không nhận ra đây là ảnh chuyển khoản. Sếp gửi ảnh màn hình giao dịch từ app ngân hàng nhé 📸",
      );
    });

    it("fileSize > 10MB → rejection message, parser NOT called", async () => {
      await sendPhotoMessage({
        data: Buffer.from("image-data"),
        fileId: "photo-1",
        mimeType: "image/jpeg",
        fileSize: 11 * 1024 * 1024, // 11MB
      });

      expect(mockMultimodalParser.parseImage).not.toHaveBeenCalled();
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        "Ảnh quá lớn, sếp gửi ảnh chụp màn hình bình thường (dưới 10MB) nhé 📸",
      );
    });

    it("Gemini API error → service unavailable message", async () => {
      mockMultimodalParser.parseImage.mockRejectedValue(new Error("Service down"));

      await sendPhotoMessage({
        data: Buffer.from("image-data"),
        fileId: "photo-1",
        mimeType: "image/jpeg",
        fileSize: 500000,
      });

      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        "Hệ thống đang gặp sự cố tạm thời, sếp thử lại sau nhé 🙏",
      );
    });
  });

  describe("Confirmation flow", () => {
    it('confirmation "ok" → save + standard reply', async () => {
      const pending = makePendingConfirmation();
      mockConfirmationManager.has.mockReturnValue(true);
      mockConfirmationManager.get.mockReturnValue(pending);

      await sendTextMessage("ok");

      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: INTERNAL_USER_ID,
          amount: 50000,
          category: "Ăn uống",
          note: "ăn trưa",
        }),
      );
      expect(mockConfirmationManager.clear).toHaveBeenCalledWith(INTERNAL_USER_ID);
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        expect.stringContaining("ghi nhận"),
      );
    });

    it('confirmation "đổi danh mục" → update + save', async () => {
      const pending = makePendingConfirmation();
      mockConfirmationManager.has.mockReturnValue(true);
      mockConfirmationManager.get.mockReturnValue(pending);

      await sendTextMessage("đổi danh mục grab");

      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: INTERNAL_USER_ID,
          category: "Di chuyển",
        }),
      );
      expect(mockConfirmationManager.clear).toHaveBeenCalledWith(INTERNAL_USER_ID);
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        expect.stringContaining("ghi nhận"),
      );
    });

    it('confirmation "đổi số tiền" → update + save', async () => {
      const pending = makePendingConfirmation();
      mockConfirmationManager.has.mockReturnValue(true);
      mockConfirmationManager.get.mockReturnValue(pending);

      await sendTextMessage("đổi số tiền 100k");

      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: INTERNAL_USER_ID,
          amount: 100000,
        }),
      );
      expect(mockConfirmationManager.clear).toHaveBeenCalledWith(INTERNAL_USER_ID);
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        expect.stringContaining("ghi nhận"),
      );
    });

    it('confirmation "bỏ" → discard reply', async () => {
      const pending = makePendingConfirmation();
      mockConfirmationManager.has.mockReturnValue(true);
      mockConfirmationManager.get.mockReturnValue(pending);

      await sendTextMessage("bỏ");

      expect(mockTransactionRepository.save).not.toHaveBeenCalled();
      expect(mockConfirmationManager.clear).toHaveBeenCalledWith(INTERNAL_USER_ID);
      expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(
        CHANNEL_USER_ID,
        "Đã huỷ, em không lưu khoản này.",
      );
    });

    it("unrelated text with pending → clear + normal routing", async () => {
      const pending = makePendingConfirmation();
      mockConfirmationManager.has.mockReturnValue(true);
      mockConfirmationManager.get.mockReturnValue(pending);

      await sendTextMessage("ăn trưa 50k");

      // Should clear the pending confirmation
      expect(mockConfirmationManager.clear).toHaveBeenCalledWith(INTERNAL_USER_ID);
      // Should fall through to normal routing (recordTransaction)
      expect(mockRecordTransaction.execute).toHaveBeenCalledWith(
        INTERNAL_USER_ID,
        "ăn trưa 50k",
      );
    });

    it("existing command with pending → clear + execute command", async () => {
      const pending = makePendingConfirmation();
      mockConfirmationManager.has.mockReturnValue(true);
      mockConfirmationManager.get.mockReturnValue(pending);
      mockUndoLastTransaction.execute.mockResolvedValue({
        id: "tx-1",
        userId: INTERNAL_USER_ID,
        amount: 50000,
        category: "Ăn uống",
        note: "ăn trưa",
        spentAt: new Date(),
      });

      await sendTextMessage("xoá");

      // Should clear the pending confirmation
      expect(mockConfirmationManager.clear).toHaveBeenCalledWith(INTERNAL_USER_ID);
      // Should fall through to undo handler
      expect(mockUndoLastTransaction.execute).toHaveBeenCalledWith(INTERNAL_USER_ID);
    });
  });
});
