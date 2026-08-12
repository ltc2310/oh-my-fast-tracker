import { Injectable, Inject, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { ChannelAdapter, InlineButton, CallbackQuery } from "../../domain/ports/ChannelAdapter";
import { MultimodalParser } from "../../domain/ports/MultimodalParser";
import { ParsedExpense } from "../../domain/ports/Parser";
import { RecordTransaction } from "../../application/usecases/RecordTransaction";
import { ListTransactions } from "../../application/usecases/ListTransactions";
import { SetBudgetLimit } from "../../application/usecases/SetBudgetLimit";
import { GetBudgetStatus } from "../../application/usecases/GetBudgetStatus";
import { CheckBudgetAfterRecord, BudgetWarning } from "../../application/usecases/CheckBudgetAfterRecord";
import { DeleteBudgetLimit } from "../../application/usecases/DeleteBudgetLimit";
import { GenerateWeeklyReport, DateRange } from "../../application/usecases/GenerateWeeklyReport";
import { GenerateTrendReport } from "../../application/usecases/GenerateTrendReport";
import { CompareMonths, SameMonthError, InvalidMonthError } from "../../application/usecases/CompareMonths";
import { CheckUserAccess } from "../../application/usecases/CheckUserAccess";
import { UndoLastTransaction } from "../../application/usecases/UndoLastTransaction";
import { DeleteTransaction } from "../../application/usecases/DeleteTransaction";
import { EditTransaction } from "../../application/usecases/EditTransaction";
import { ConfirmationManager } from "../../application/services/ConfirmationManager";
import { PendingEditManager } from "../../application/services/PendingEditManager";
import { TokenService } from "../../domain/ports/TokenService";
import { EditIntentDetector, EditIntentResult } from "../../domain/ports/EditIntentDetector";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { NotificationPreferenceRepository } from "../../domain/ports/NotificationPreferenceRepository";
import { appConfig } from "../config/app.config";
import { AdminBotHandler } from "./AdminBotHandler";
import { resolveCategory, extractAmount, detectDate } from "../parsers/RegexParser";
import { isIncomeCategory } from "../../domain/constants/income-categories";
import { CATEGORIES } from "../../domain/constants/categories";
import { Transaction } from "../../domain/entities/Transaction";

/** Access control messages (Vietnamese) */
const WELCOME_MSG =
  "Chào bạn! Bot đang trong giai đoạn thử nghiệm giới hạn người dùng.\nTài khoản của bạn đã được ghi nhận, mình sẽ duyệt sớm nhất có thể. Cảm ơn bạn đã quan tâm 🙏";
const PENDING_MSG =
  "Tài khoản của bạn vẫn đang chờ duyệt, mình sẽ thông báo khi có thể sử dụng nhé 🙏";
const SERVICE_UNAVAILABLE_MSG =
  "Hệ thống đang gặp sự cố tạm thời, sếp thử lại sau nhé 🙏";

/** Voice/Photo error messages */
const VOICE_EMPTY_MSG =
  "Em không nghe rõ khoản chi tiêu trong tin nhắn thoại. Sếp thử ghi âm lại rõ hơn nhé 🎤";
const PHOTO_EMPTY_MSG =
  "Em không nhận ra đây là ảnh chuyển khoản. Sếp gửi ảnh màn hình giao dịch từ app ngân hàng nhé 📸";
const VOICE_TOO_LONG_MSG =
  "Tin nhắn thoại hơi dài, sếp ghi âm ngắn gọn hơn (dưới 1 phút) nhé 🎤";
const PHOTO_TOO_LARGE_MSG =
  "Ảnh quá lớn, sếp gửi ảnh chụp màn hình bình thường (dưới 10MB) nhé 📸";
const INVALID_JSON_MSG =
  "Em xử lý chưa được, sếp thử gửi lại hoặc gõ text như bình thường nhé 🙏";

/** Max voice duration (seconds) and max photo size (bytes) */
const MAX_VOICE_DURATION_SECONDS = 60;
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/** /start — shown when user opens bot for the first time */
const START_MSG = `Chào sếp! Em là bot quản lý chi tiêu cá nhân 💰

Chỉ cần nhắn kiểu: "ăn trưa 50k" hay "grab 30k, cf 25k" là em ghi nhận ngay.

Một số ví dụ:
• ăn sáng 70k → ghi 70.000đ vào Ăn uống
• hôm qua grab 30k → ghi 30.000đ (ngày hôm qua)
• lương 20tr → ghi thu nhập 20.000.000đ

Gõ /help để xem đầy đủ các lệnh nhé!`;

/** /help — full command reference for whitelisted users */
const HELP_MSG = `📖 Hướng dẫn sử dụng

💸 Ghi chi tiêu:
• ăn trưa 50k
• hôm qua grab 30k
• ăn sáng 70k, rửa xe 30k (nhiều khoản)
• cf 30k (viết tắt: cà phê)
• lương 20tr (thu nhập)

🏪 Gõ tên thương hiệu là em tự hiểu:
• kfc 120k, phúc long 65k, haidilao 800k
• circle k 45k, bách hoá xanh 250k
• xanh sm 45k, shopee 350k, cgv 120k
• pharmacity 95k, viettel 200k

🎤 Voice & Ảnh:
• Gửi tin nhắn thoại mô tả chi tiêu
• Gửi ảnh chuyển khoản ngân hàng
• Nhấn nút "✅ Lưu" hoặc gõ "ok"
• Nhấn "📁 Đổi danh mục" để chọn
• Nhấn "💰 Đổi số tiền" rồi gõ số mới
• Nhấn "❌ Huỷ" hoặc gõ "bỏ"

📋 Xem chi tiêu:
• hôm nay chi gì (chi tiết hôm nay)
• chi tiêu hôm nay (cách gõ khác)
• hôm qua chi gì
• 5 khoản gần nhất
• lịch sử 10

📊 Báo cáo tổng hợp:
• báo cáo (7 ngày gần nhất)
• chi tiêu tháng này
• chi tiêu tháng trước
• chi tiêu từ 1/6 đến 30/6
• báo cáo 6 tháng (xu hướng)
• so sánh tháng (2 tháng gần nhất)
• so sánh tháng X với tháng Y

✏️ Sửa / Xoá:
• Nhấn [✏️ Sửa] sau khi ghi → chọn số tiền/danh mục/ngày
• Nhấn [🗑 Xoá] sau khi ghi → xoá ngay
• xoá (xoá khoản vừa ghi)
• xoá khoản vừa rồi / xoá khoản cuối
• xoá khoản cà phê (tìm & xoá theo keyword)
• xoá khoản grab hôm qua
• sửa thành 30k (sửa số tiền)
• sửa thành ăn uống (đổi danh mục)
• sửa ngày hôm qua (đổi ngày)
• sửa thành cà phê 25k hôm qua (kết hợp)

💰 Định mức ngân sách:
• định mức ăn uống 5tr (đặt giới hạn/tháng)
• định mức di chuyển 500k
• định mức mua sắm 2000000 (số đầy đủ)
• xem định mức (xem % sử dụng)
• xoá định mức ăn uống

🔔 Thông báo:
• bật/tắt nhắc nhở (nhắc ghi chi tiêu)
• bật/tắt báo cáo tuần (tổng kết tuần)
• bật/tắt báo cáo tháng (tổng kết tháng)
• xem thông báo (xem cài đặt)

🔧 Khác:
• /start — giới thiệu bot
• /help — xem hướng dẫn này
• id — xem chat ID của bạn`;

/** Regex to detect trend report request messages (must be checked BEFORE REPORT_REGEX) */
const TREND_REPORT_REGEX = /báo\s*cáo\s*(?:chi\s*tiêu\s*)?(\d+)\s*tháng|xu\s*hướng\s*(?:chi\s*tiêu\s*)?(\d+)?\s*tháng|báo\s*cáo\s*xu\s*hướng/i;

/** Regex to detect compare months requests — captures optional month numbers */
const COMPARE_MONTHS_REGEX = /so\s*sánh\s*tháng(?:\s+(\d{1,2})\s*(?:với|và|vs)\s*tháng\s*(\d{1,2}))?/i;

/** Regex to detect existing weekly/monthly report request messages */
const REPORT_REGEX = /báo\s*cáo|chi\s*tiêu\s*(tuần|tháng|ngày|\d)|report/i;

/** Regex to detect undo/delete last transaction (bare command, no keyword) */
const UNDO_REGEX = /^(xo[áa]|xóa|huỷ|hủy|undo|bỏ)\s*(khoản\s*)?(vừa\s*rồi|cuối|gần\s*nhất|mới\s*nhất|lần\s*trước)?$/i;

/** Regex to detect targeted delete: "xoá khoản <keyword> [date_ref]" */
const UNDO_KEYWORD_REGEX = /^(?:xo[áa]|xóa|huỷ|hủy)\s*khoản\s+(.+?)(?:\s+(?:hôm\s*qua|hôm\s*kia|\d+\s*ngày\s*trước))?$/i;

/** Regex to detect list transaction requests.
 *  Accepts both "hôm nay chi gì" and the more natural "chi tiêu hôm nay". */
const LIST_TODAY_REGEX = /^(?:hôm\s*nay(?:\s*(?:chi\s*gì|chi\s*tiêu))?|chi\s*tiêu\s*hôm\s*nay|today)$/i;
const LIST_YESTERDAY_REGEX = /^(?:hôm\s*qua(?:\s*(?:chi\s*gì|chi\s*tiêu))?|chi\s*tiêu\s*hôm\s*qua)$/i;
const LIST_RECENT_REGEX = /^(?:(\d+)\s*khoản\s*(?:gần\s*nhất|gần\s*đây)|lịch\s*sử\s*(\d+)|xem\s*(\d+)\s*khoản)$/i;

/** Budget command patterns.
 *  Unit is optional so "định mức ăn uống 5000000" works as well as "5tr".
 *  Without a unit the number is treated as raw VND (validated in the handler). */
const SET_BUDGET_REGEX = /^(?:định\s*mức|budget)\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu)?$/i;
const VIEW_BUDGET_REGEX = /^(?:xem\s*định\s*mức|xem\s*budget|định\s*mức)$/i;
const DELETE_BUDGET_REGEX = /^(?:xoá|xóa|bỏ)\s*định\s*mức\s+(.+)$/i;

/** Notification preference command patterns */
const NOTIFICATION_ENABLE_DAILY = /^(bật\s*(nhắc\s*nhở|thông\s*báo\s*hàng\s*ngày))$/i;
const NOTIFICATION_DISABLE_DAILY = /^(tắt\s*(nhắc\s*nhở|thông\s*báo\s*hàng\s*ngày))$/i;
const NOTIFICATION_ENABLE_WEEKLY = /^bật\s*báo\s*cáo\s*tuần$/i;
const NOTIFICATION_DISABLE_WEEKLY = /^tắt\s*báo\s*cáo\s*tuần$/i;
const NOTIFICATION_ENABLE_MONTHLY = /^bật\s*báo\s*cáo\s*tháng$/i;
const NOTIFICATION_DISABLE_MONTHLY = /^tắt\s*báo\s*cáo\s*tháng$/i;
const NOTIFICATION_STATUS = /^(xem\s*thông\s*báo|cài\s*đặt\s*thông\s*báo)$/i;

/** Confirmation flow command patterns */
const CONFIRM_REGEX = /^(ok|lưu)$/i;
const CHANGE_CATEGORY_REGEX = /^đổi\s*danh\s*mục\s+(.+)$/i;
const CHANGE_AMOUNT_REGEX = /^đổi\s*số\s*tiền\s+(.+)$/i;
const CANCEL_REGEX = /^(bỏ|hủy)$/i;

/**
 * Parse a report request message to determine the date range.
 */
function parseReportDateRange(text: string): DateRange {
  const lower = text.toLowerCase();
  const now = new Date();

  if (/tuần\s*trước/.test(lower)) {
    const to = new Date(now);
    to.setDate(to.getDate() - 7);
    const from = new Date(to);
    from.setDate(from.getDate() - 7);
    return { from, to };
  }

  if (/tháng\s*trước/.test(lower)) {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { from, to };
  }

  if (/tháng\s*này/.test(lower)) {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to: now };
  }

  const daysMatch = lower.match(/(\d+)\s*ngày\s*(trước|qua|gần đây|nay)/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    return { from, to: now };
  }

  const rangeMatch = lower.match(
    /từ\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:đến|->|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/
  );
  if (rangeMatch) {
    const fromDay = parseInt(rangeMatch[1], 10);
    const fromMonth = parseInt(rangeMatch[2], 10) - 1;
    const fromYear = rangeMatch[3] ? parseInt(rangeMatch[3], 10) : now.getFullYear();
    const toDay = parseInt(rangeMatch[4], 10);
    const toMonth = parseInt(rangeMatch[5], 10) - 1;
    const toYear = rangeMatch[6] ? parseInt(rangeMatch[6], 10) : now.getFullYear();

    const from = new Date(fromYear, fromMonth, fromDay);
    const to = new Date(toYear, toMonth, toDay, 23, 59, 59);
    return { from, to };
  }

  // Default: last 7 days
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  return { from, to: now };
}

function formatDate(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Whether a parser error message indicates the model returned malformed JSON. */
function isInvalidJsonError(message: string): boolean {
  return /invalid json/i.test(message);
}

/**
 * Format the date prefix for reply message.
 * If spentAt is not today, show when the expense was.
 */
function formatSpentPrefix(spentAt?: Date): string {
  if (!spentAt) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const spent = new Date(spentAt.getFullYear(), spentAt.getMonth(), spentAt.getDate());
  const diffDays = Math.round((today.getTime() - spent.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "";
  if (diffDays === 1) return "(hôm qua) ";
  if (diffDays === 2) return "(hôm kia) ";
  return `(${diffDays} ngày trước) `;
}

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);

  constructor(
    @Inject("ChannelAdapter") private readonly channelAdapter: ChannelAdapter,
    @Inject("TokenService") private readonly tokenService: TokenService,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
    @Inject("EditIntentDetector") private readonly editIntentDetector: EditIntentDetector,
    @Inject("TransactionRepository") private readonly transactionRepository: TransactionRepository,
    @Inject("NotificationPreferenceRepository") private readonly notificationPreferenceRepository: NotificationPreferenceRepository,
    @Inject("MultimodalParser") private readonly multimodalParser: MultimodalParser,
    private readonly recordTransaction: RecordTransaction,
    private readonly listTransactions: ListTransactions,
    private readonly setBudgetLimit: SetBudgetLimit,
    private readonly getBudgetStatus: GetBudgetStatus,
    private readonly checkBudgetAfterRecord: CheckBudgetAfterRecord,
    private readonly deleteBudgetLimit: DeleteBudgetLimit,
    private readonly generateWeeklyReport: GenerateWeeklyReport,
    private readonly generateTrendReport: GenerateTrendReport,
    private readonly compareMonths: CompareMonths,
    private readonly checkUserAccess: CheckUserAccess,
    private readonly undoLastTransaction: UndoLastTransaction,
    private readonly editTransaction: EditTransaction,
    private readonly confirmationManager: ConfirmationManager,
    private readonly adminBotHandler: AdminBotHandler,
    private readonly deleteTransaction: DeleteTransaction,
    private readonly pendingEditManager: PendingEditManager,
  ) { }

  onModuleInit() {
    this.channelAdapter.onMessage(async (message) => {
      try {
      // Debug: respond with user's chat ID
      if (/^id$/i.test(message.text.trim())) {
        await this.channelAdapter.sendText(message.userId, `Your ID: ${message.userId}`);
        return;
      }

      // /start command — works before access check (Telegram sends this on first open)
      if (/^\/start$/i.test(message.text.trim())) {
        await this.channelAdapter.sendText(message.userId, START_MSG);
        return;
      }

      // Admin commands — route before access check so admins don't need to be whitelisted
      if (this.adminBotHandler.isAdmin(message.userId) && this.adminBotHandler.isAdminCommand(message.text)) {
        await this.adminBotHandler.handle(message.userId, message.text);
        return;
      }

      // Access check
      let internalUserId: string | undefined;
      try {
        const accessResult = await this.checkUserAccess.execute(
          message.channel,
          message.userId,
          message.username,
        );

        if (!accessResult.allowed) {
          if (accessResult.isFirstMessage) {
            await this.channelAdapter.sendText(message.userId, WELCOME_MSG);
            // Notify admins about new user registration (fire-and-forget)
            this.adminBotHandler.notifyNewUser(accessResult.user).catch((err) => {
              this.logger.warn(`Failed to notify admins of new user: ${err instanceof Error ? err.message : String(err)}`);
            });
          } else {
            await this.channelAdapter.sendText(message.userId, PENDING_MSG);
          }
          return;
        }

        internalUserId = accessResult.user.id;
      } catch (error) {
        this.logger.error('Access check failed', error);
        await this.channelAdapter.sendText(message.userId, SERVICE_UNAVAILABLE_MSG);
        return;
      }

      // /help command — only for whitelisted users
      if (/^\/help$/i.test(message.text.trim())) {
        await this.channelAdapter.sendText(message.userId, HELP_MSG);
        return;
      }

      // Voice message routing
      if (message.voice) {
        await this.handleVoiceMessage(message.userId, internalUserId!, message.voice);
        return;
      }

      // Photo message routing
      if (message.photo) {
        await this.handlePhotoMessage(message.userId, internalUserId!, message.photo);
        return;
      }

      // Confirmation flow check — after voice/photo, before normal text routing
      const trimmedText = message.text.trim();
      if (internalUserId && this.confirmationManager.has(internalUserId)) {
        const handled = await this.handleConfirmation(internalUserId, message.userId, trimmedText);
        if (handled) return;
        // If not handled, fall through to normal routing (pending already cleared)
      }

      // Pending inline edit — user tapped [Đổi số tiền] / [Đổi ngày] and is now
      // supplying the value. Applies to the TAPPED transaction, not the latest one.
      if (internalUserId && this.pendingEditManager.has(internalUserId)) {
        const handled = await this.handlePendingEdit(message.userId, internalUserId, trimmedText);
        if (handled) return;
      }

      // Notification preference commands
      if (internalUserId) {
        if (NOTIFICATION_ENABLE_DAILY.test(trimmedText)) {
          await this.notificationPreferenceRepository.upsert(internalUserId, { dailyReminder: true });
          await this.channelAdapter.sendText(message.userId, '✅ Đã bật nhắc nhở hàng ngày. Mình sẽ nhắc bạn ghi chi tiêu mỗi tối nếu bạn chưa ghi.');
          return;
        }
        if (NOTIFICATION_DISABLE_DAILY.test(trimmedText)) {
          await this.notificationPreferenceRepository.upsert(internalUserId, { dailyReminder: false });
          await this.channelAdapter.sendText(message.userId, '🔕 Đã tắt nhắc nhở hàng ngày.');
          return;
        }
        if (NOTIFICATION_ENABLE_WEEKLY.test(trimmedText)) {
          await this.notificationPreferenceRepository.upsert(internalUserId, { weeklyDigest: true });
          await this.channelAdapter.sendText(message.userId, '✅ Đã bật báo cáo tuần. Mỗi Chủ nhật bạn sẽ nhận tổng kết chi tiêu tuần.');
          return;
        }
        if (NOTIFICATION_DISABLE_WEEKLY.test(trimmedText)) {
          await this.notificationPreferenceRepository.upsert(internalUserId, { weeklyDigest: false });
          await this.channelAdapter.sendText(message.userId, '🔕 Đã tắt báo cáo tuần.');
          return;
        }
        if (NOTIFICATION_ENABLE_MONTHLY.test(trimmedText)) {
          await this.notificationPreferenceRepository.upsert(internalUserId, { monthlySummary: true });
          await this.channelAdapter.sendText(message.userId, '✅ Đã bật báo cáo tháng. Cuối mỗi tháng bạn sẽ nhận tổng kết chi tiêu.');
          return;
        }
        if (NOTIFICATION_DISABLE_MONTHLY.test(trimmedText)) {
          await this.notificationPreferenceRepository.upsert(internalUserId, { monthlySummary: false });
          await this.channelAdapter.sendText(message.userId, '🔕 Đã tắt báo cáo tháng.');
          return;
        }
        if (NOTIFICATION_STATUS.test(trimmedText)) {
          await this.handleNotificationStatus(message.userId, internalUserId);
          return;
        }
      }

      // Budget commands
      const setBudgetMatch = trimmedText.match(SET_BUDGET_REGEX);
      if (setBudgetMatch) {
        await this.handleSetBudget(message.userId, internalUserId!, setBudgetMatch);
        return;
      }
      if (VIEW_BUDGET_REGEX.test(trimmedText)) {
        await this.handleViewBudget(message.userId, internalUserId!);
        return;
      }
      const deleteBudgetMatch = trimmedText.match(DELETE_BUDGET_REGEX);
      if (deleteBudgetMatch) {
        await this.handleDeleteBudget(message.userId, internalUserId!, deleteBudgetMatch[1].trim());
        return;
      }

      // List transactions (must be checked BEFORE REPORT_REGEX to avoid "chi tiêu hôm nay" going to report)
      if (LIST_TODAY_REGEX.test(trimmedText)) {
        await this.handleListTransactions(message.userId, internalUserId!, { period: "today" });
        return;
      }
      if (LIST_YESTERDAY_REGEX.test(trimmedText)) {
        await this.handleListTransactions(message.userId, internalUserId!, { period: "yesterday" });
        return;
      }
      const listRecentMatch = trimmedText.match(LIST_RECENT_REGEX);
      if (listRecentMatch) {
        const n = parseInt(listRecentMatch[1] || listRecentMatch[2] || listRecentMatch[3], 10);
        await this.handleListTransactions(message.userId, internalUserId!, { limit: Math.min(n, 10) });
        return;
      }

      // Check compare months pattern
      const compareMatch = message.text.match(COMPARE_MONTHS_REGEX);
      if (compareMatch) {
        await this.handleCompareMonths(message.userId, internalUserId!, message.text);
        return;
      }

      // Undo last transaction — bare forms ("xoá", "xoá khoản vừa rồi", "xoá khoản cuối").
      // MUST be checked BEFORE UNDO_KEYWORD_REGEX, otherwise "xoá khoản vừa rồi" would be
      // treated as a keyword search for the literal text "vừa rồi".
      if (UNDO_REGEX.test(trimmedText)) {
        await this.handleUndo(message.userId, internalUserId!);
        return;
      }

      // Targeted delete by keyword: "xoá khoản cà phê hôm qua"
      const undoKeywordMatch = trimmedText.match(UNDO_KEYWORD_REGEX);
      if (undoKeywordMatch) {
        await this.handleUndoByKeyword(message.userId, internalUserId!, undoKeywordMatch[1].trim());
        return;
      }

      // Edit transaction (hybrid: regex → AI fallback)
      try {
        const editResult = await this.editIntentDetector.detect(message.text.trim());
        if (editResult) {
          await this.handleEditIntent(message.userId, internalUserId!, editResult);
          return;
        }
      } catch (error) {
        this.logger.error("Edit intent detection failed", error);
        await this.channelAdapter.sendText(
          message.userId,
          "Em đang gặp sự cố khi xử lý yêu cầu sửa, sếp thử lại sau hoặc gõ theo mẫu: \"sửa thành 30k\" nhé 🙏"
        );
        return;
      }

      // Check trend report pattern (before general REPORT_REGEX)
      const trendMatch = message.text.match(TREND_REPORT_REGEX);
      if (trendMatch) {
        const months = parseInt(trendMatch[1] || trendMatch[2], 10) || 6;
        await this.handleTrendReportRequest(message.userId, internalUserId!, months);
        return;
      }

      if (REPORT_REGEX.test(message.text)) {
        await this.handleReportRequest(message.userId, internalUserId!, message.text);
        return;
      }

      const transactions = await this.recordTransaction.execute(internalUserId!, message.text);

      if (transactions.length === 0) {
        await this.channelAdapter.sendText(
          message.userId,
          'Em chưa nhận diện được số tiền. Sếp thử gõ dạng: "ăn trưa 50k" nhé.\n\nGõ "báo cáo" để xem chi tiêu tuần này.'
        );
        return;
      }

      if (transactions.length === 1) {
        const t = transactions[0];
        const prefix = formatSpentPrefix(t.spentAt);
        const displayAmount = Math.abs(t.amount).toLocaleString("vi-VN");
        const verb = t.amount < 0 ? "ghi nhận thu" : "ghi nhận";
        let reply = `Em đã ${verb} ${prefix}${displayAmount}đ - ${t.category}`;

        // Check budget warning (only for expenses)
        if (t.amount > 0) {
          const warning = await this.checkBudgetAfterRecord.execute(internalUserId!, t.category);
          if (warning) {
            reply += this.formatBudgetWarning(warning);
          }
        }

        // Send with inline edit/delete buttons if supported
        if (this.channelAdapter.sendTextWithKeyboard && t.id) {
          const keyboard = [
            [
              { text: "✏️ Sửa", callbackData: `edit:${t.id}` },
              { text: "🗑 Xoá", callbackData: `del:${t.id}` },
            ],
          ];
          await this.channelAdapter.sendTextWithKeyboard(message.userId, reply, keyboard);
        } else {
          await this.channelAdapter.sendText(message.userId, reply);
        }
        return;
      }

      // Multiple transactions
      const lines = transactions.map((t) => {
        const prefix = formatSpentPrefix(t.spentAt);
        const displayAmount = Math.abs(t.amount).toLocaleString("vi-VN");
        const sign = t.amount < 0 ? "+" : "";
        return `• ${prefix}${sign}${displayAmount}đ - ${t.category}`;
      });
      const totalExpense = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
      const totalIncome = transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
      if (totalExpense > 0) lines.push(`\nTổng chi: ${totalExpense.toLocaleString("vi-VN")}đ`);
      if (totalIncome > 0) lines.push(`${totalExpense > 0 ? "" : "\n"}Tổng thu: ${totalIncome.toLocaleString("vi-VN")}đ`);

      await this.channelAdapter.sendText(
        message.userId,
        `Em đã ghi nhận ${transactions.length} khoản:\n${lines.join("\n")}`
      );
      } catch (error) {
        this.logger.error(`Unhandled error processing message from ${message.userId}`, error);
        try {
          await this.channelAdapter.sendText(message.userId, SERVICE_UNAVAILABLE_MSG);
        } catch {
          // If we can't even send the error message, just log and move on
        }
      }
    });

    // Register inline keyboard callback handler
    if (this.channelAdapter.onCallbackQuery) {
      this.channelAdapter.onCallbackQuery(async (query: CallbackQuery) => {
        await this.handleCallbackQuery(query);
      });
    }
  }

  private async handleSetBudget(channelUserId: string, internalUserId: string, match: RegExpMatchArray): Promise<void> {
    const rawCategory = match[1].trim();
    const rawNumber = match[2];
    const unit = match[3];

    // Resolve category
    const resolvedCategory = resolveCategory(rawCategory);

    if (!resolvedCategory) {
      await this.channelAdapter.sendText(channelUserId,
        `Em chưa nhận ra danh mục "${rawCategory}". Sếp chọn một trong các danh mục:\n\n` +
        CATEGORIES.join(", ")
      );
      return;
    }

    // Parse amount. Unit is optional — without it the number is raw VND.
    const value = parseFloat(rawNumber.replace(",", "."));
    let amount: number;
    if (!unit) {
      // Raw VND. Guard against "định mức ăn uống 5" being read as 5 đồng.
      if (value < 1000) {
        await this.channelAdapter.sendText(channelUserId,
          `Định mức quá nhỏ. Sếp gõ kèm đơn vị (VD: "định mức ${resolvedCategory.toLowerCase()} 5tr") ` +
          `hoặc số đầy đủ (VD: 5000000).`
        );
        return;
      }
      amount = value;
    } else {
      const u = unit.toLowerCase();
      if (u === "k" || u.startsWith("ngh") || u.startsWith("ngà")) {
        amount = value * 1000;
      } else {
        amount = value * 1_000_000;
      }
    }

    await this.setBudgetLimit.execute(internalUserId, resolvedCategory, amount);
    await this.channelAdapter.sendText(channelUserId,
      `✅ Đã đặt định mức ${resolvedCategory}: ${amount.toLocaleString("vi-VN")}đ/tháng`
    );
  }

  private async handleViewBudget(channelUserId: string, internalUserId: string): Promise<void> {
    const status = await this.getBudgetStatus.execute(internalUserId);

    if (status.statuses.length === 0) {
      await this.channelAdapter.sendText(channelUserId,
        "Sếp chưa đặt định mức nào. Gõ \"định mức ăn uống 5tr\" để bắt đầu."
      );
      return;
    }

    const now = new Date();
    const monthLabel = `${now.getMonth() + 1}/${now.getFullYear()}`;
    const lines: string[] = [`📊 Định mức tháng ${monthLabel}:\n`];

    for (const s of status.statuses) {
      const spentStr = s.spent.toLocaleString("vi-VN");
      const limitStr = s.monthlyLimit.toLocaleString("vi-VN");
      const pctStr = Math.round(s.percentage);
      let icon: string;
      if (s.level === "exceeded") icon = "🚨";
      else if (s.level === "warning") icon = "⚠️";
      else icon = "✅";
      lines.push(`• ${s.category}: ${spentStr}đ / ${limitStr}đ (${pctStr}%) ${icon}`);
    }

    lines.push("");
    const totalSpentStr = status.totalSpent.toLocaleString("vi-VN");
    const totalLimitStr = status.totalLimit.toLocaleString("vi-VN");
    const totalPct = status.totalLimit > 0 ? Math.round((status.totalSpent / status.totalLimit) * 100) : 0;
    lines.push(`Tổng chi: ${totalSpentStr}đ / ${totalLimitStr}đ (${totalPct}%)`);

    await this.channelAdapter.sendText(channelUserId, lines.join("\n"));
  }

  private async handleDeleteBudget(channelUserId: string, internalUserId: string, rawCategory: string): Promise<void> {
    const resolvedCategory = resolveCategory(rawCategory);

    if (!resolvedCategory) {
      await this.channelAdapter.sendText(channelUserId, `Em chưa nhận ra danh mục "${rawCategory}".`);
      return;
    }

    const deleted = await this.deleteBudgetLimit.execute(internalUserId, resolvedCategory);
    if (deleted) {
      await this.channelAdapter.sendText(channelUserId, `✅ Đã xoá định mức ${resolvedCategory}`);
    } else {
      await this.channelAdapter.sendText(channelUserId, `Không tìm thấy định mức cho ${resolvedCategory}.`);
    }
  }

  private formatBudgetWarning(warning: BudgetWarning): string {
    const spentStr = warning.spent.toLocaleString("vi-VN");
    const limitStr = warning.limit.toLocaleString("vi-VN");
    const pctStr = Math.round(warning.percentage);

    if (warning.level === "exceeded") {
      return ` 🚨 Vượt định mức! (đã chi ${spentStr}đ / ${limitStr}đ)`;
    }
    return ` ⚠️ (đã dùng ${pctStr}% định mức tháng này)`;
  }

  private async handleListTransactions(
    channelUserId: string,
    internalUserId: string,
    options: { period?: "today" | "yesterday"; limit?: number },
  ): Promise<void> {
    const now = new Date();
    let from: Date | undefined;
    let to: Date | undefined;
    let periodLabel: string;

    if (options.period === "today") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      to = now;
      periodLabel = `hôm nay (${formatDate(from)})`;
    } else if (options.period === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      from = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
      to = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
      periodLabel = `hôm qua (${formatDate(from)})`;
    } else {
      periodLabel = `${options.limit} khoản gần nhất`;
    }

    const result = await this.listTransactions.execute(internalUserId, {
      from,
      to,
      limit: options.limit,
    });

    if (result.transactions.length === 0) {
      const emptyMsg = options.period
        ? `${options.period === "today" ? "Hôm nay" : "Hôm qua"} sếp chưa chi gì 🎉`
        : "Không tìm thấy khoản nào.";
      await this.channelAdapter.sendText(channelUserId, emptyMsg);
      return;
    }

    const lines: string[] = [];
    lines.push(`📋 Chi tiêu ${periodLabel}:\n`);

    for (let i = 0; i < result.transactions.length; i++) {
      const t = result.transactions[i];
      const displayAmount = Math.abs(t.amount).toLocaleString("vi-VN");
      const sign = t.amount < 0 ? "+" : "";
      const timeStr = this.formatTransactionTime(t.spentAt, now);
      lines.push(`${i + 1}. ${sign}${displayAmount}đ - ${t.category} (${t.note}) — ${timeStr}`);
    }

    lines.push("");
    if (result.total > 0) {
      lines.push(`💰 Tổng chi: ${result.total.toLocaleString("vi-VN")}đ`);
    }
    if (result.totalIncome > 0) {
      lines.push(`💵 Tổng thu: ${result.totalIncome.toLocaleString("vi-VN")}đ`);
    }
    lines.push(`📝 ${result.transactions.length} khoản${result.hasMore ? " (còn nữa, mở web để xem đầy đủ)" : ""}`);

    await this.channelAdapter.sendText(channelUserId, lines.join("\n"));
  }

  private formatTransactionTime(spentAt: Date | undefined, now: Date): string {
    if (!spentAt) return "";
    const sameDay =
      spentAt.getFullYear() === now.getFullYear() &&
      spentAt.getMonth() === now.getMonth() &&
      spentAt.getDate() === now.getDate();

    if (sameDay) {
      return `${spentAt.getHours()}:${String(spentAt.getMinutes()).padStart(2, "0")}`;
    }
    return `${spentAt.getDate()}/${spentAt.getMonth() + 1} ${spentAt.getHours()}:${String(spentAt.getMinutes()).padStart(2, "0")}`;
  }

  private async handleReportRequest(channelUserId: string, internalUserId: string, text: string): Promise<void> {
    const range = parseReportDateRange(text);
    const summary = await this.generateWeeklyReport.execute(internalUserId, range);

    if (summary.total === 0) {
      await this.channelAdapter.sendText(
        channelUserId,
        `Không có khoản chi nào từ ${formatDate(range.from)} đến ${formatDate(range.to)}.`
      );
      return;
    }

    const token = this.tokenService.generateReportToken({
      userId: internalUserId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    });
    const url = `${this.config.webviewBaseUrl}?token=${token}`;

    const lines = summary.byCategory.map(
      (c) => `• ${c.category}: ${c.total.toLocaleString("vi-VN")}đ`
    );

    const reply = [
      `Đây là báo cáo chi tiêu ${formatDate(range.from)} → ${formatDate(range.to)}, e gửi sếp xem qua:`,
      "",
      `💰 Tổng chi: ${summary.total.toLocaleString("vi-VN")}đ`,
      ...(summary.totalIncome ? [`💵 Tổng thu: ${summary.totalIncome.toLocaleString("vi-VN")}đ`] : []),
      "",
      ...lines,
      "",
      `🔗 Sếp có thể xem trực quan hơn tại đây: ${url}`,
    ].join("\n");

    this.logger.log(`[Report] user=${internalUserId} → ${url}`);
    await this.channelAdapter.sendText(channelUserId, reply);
  }

  private async handleTrendReportRequest(channelUserId: string, internalUserId: string, months: number): Promise<void> {
    // Validate range at bot layer — send friendly message without calling use case
    if (months < 3 || months > 12) {
      await this.channelAdapter.sendText(
        channelUserId,
        `Em chỉ hỗ trợ báo cáo xu hướng từ 3 đến 12 tháng. Sếp thử "báo cáo 6 tháng" nhé!`
      );
      return;
    }

    const report = await this.generateTrendReport.execute(internalUserId, { months });

    // Generate token for webview/export links
    const token = this.tokenService.generateReportToken({
      userId: internalUserId,
      from: report.periodStart,
      to: report.periodEnd,
    });

    const webviewLink = `${this.config.webviewBaseUrl}/trend?token=${token}&months=${months}`;

    // Format direction text and icon
    const directionMap: Record<string, string> = {
      increasing: "↑ Tăng",
      decreasing: "↓ Giảm",
      stable: "→ Ổn định",
    };
    const directionText = directionMap[report.overview.overallDirection] ?? "→ Ổn định";

    // Format period dates
    const periodFrom = report.periodStart.slice(0, 7); // YYYY-MM
    const periodTo = report.periodEnd.slice(0, 7);

    // Build reply lines
    const lines: string[] = [];

    if (report.overview.hasIncompleteData) {
      lines.push(`⚠️ Lưu ý: Chỉ có dữ liệu ${report.overview.monthsWithData}/${months} tháng, xu hướng có thể chưa chính xác.`);
    }

    lines.push(`📊 Xu hướng chi tiêu ${months} tháng qua (${periodFrom} - ${periodTo})`);
    lines.push(`Tổng chi: ${report.overview.totalSpent.toLocaleString("vi-VN")}đ · TB: ${Math.round(report.overview.averageMonthlySpent).toLocaleString("vi-VN")}đ/tháng`);
    lines.push(`${directionText.split(" ")[0]} Xu hướng: ${directionText.split(" ").slice(1).join(" ")} (${report.overview.overallChangePercent > 0 ? "+" : ""}${Math.round(report.overview.overallChangePercent)}% so với đầu kỳ)`);
    lines.push(`📅 Tháng cao nhất: ${report.overview.highestMonth.month} (${report.overview.highestMonth.amount.toLocaleString("vi-VN")}đ)`);

    // Top growing category
    if (report.topGrowingCategories.length > 0) {
      const top = report.topGrowingCategories[0];
      lines.push(`🔺 Tăng mạnh nhất: ${top.category} (+${Math.round(top.changePercent)}%)`);
    }

    // Top shrinking category
    if (report.topShrinkingCategories.length > 0) {
      const top = report.topShrinkingCategories[0];
      lines.push(`🔻 Giảm mạnh nhất: ${top.category} (${Math.round(top.changePercent)}%)`);
    }

    lines.push("");
    lines.push(`👉 Sếp xem chi tiết giúp em tại đây: ${webviewLink}`);

    const reply = lines.join("\n");
    this.logger.log(`[TrendReport] user=${internalUserId} months=${months} → ${webviewLink}`);
    await this.channelAdapter.sendText(channelUserId, reply);
  }

  private async handleUndo(channelUserId: string, internalUserId: string): Promise<void> {
    const deleted = await this.undoLastTransaction.execute(internalUserId);
    if (!deleted) {
      await this.channelAdapter.sendText(
        channelUserId,
        "Không tìm thấy khoản nào để xoá. Có thể sếp chưa ghi khoản nào hoặc đã xoá rồi."
      );
      return;
    }

    const displayAmount = Math.abs(deleted.amount).toLocaleString("vi-VN");
    await this.channelAdapter.sendText(
      channelUserId,
      `Đã xoá khoản ${displayAmount}đ - ${deleted.category} (${deleted.note}).`
    );
  }

  private async handleUndoByKeyword(channelUserId: string, internalUserId: string, keyword: string): Promise<void> {
    const candidates = await this.transactionRepository.findByUserAndKeyword(internalUserId, keyword, 5);

    if (candidates.length === 0) {
      await this.channelAdapter.sendText(
        channelUserId,
        `Không tìm thấy khoản nào khớp "${keyword}".`,
      );
      return;
    }

    if (candidates.length === 1) {
      // Single match — delete directly with confirmation keyboard
      const tx = candidates[0];
      const displayAmount = Math.abs(tx.amount).toLocaleString("vi-VN");
      const dateStr = tx.spentAt
        ? `${tx.spentAt.getDate()}/${tx.spentAt.getMonth() + 1}`
        : "";

      if (this.channelAdapter.sendTextWithKeyboard) {
        const text = `Tìm thấy: ${displayAmount}đ - ${tx.category} (${tx.note}) ${dateStr}. Xoá khoản này?`;
        const keyboard = [
          [
            { text: "✅ Xoá", callbackData: `del:${tx.id}` },
            { text: "❌ Không", callbackData: "del:cancel" },
          ],
        ];
        await this.channelAdapter.sendTextWithKeyboard(channelUserId, text, keyboard);
      } else {
        // Fallback for channels without inline keyboards — delete via the use case
        // so ownership is still verified.
        const deleted = await this.deleteTransaction.execute(internalUserId, tx.id!);
        await this.channelAdapter.sendText(
          channelUserId,
          deleted
            ? `Đã xoá khoản ${displayAmount}đ - ${tx.category} (${tx.note}).`
            : "Không xoá được, khoản có thể đã bị xoá.",
        );
      }
      return;
    }

    // Multiple matches — show list with selection keyboard
    const lines: string[] = [`Tìm thấy ${candidates.length} khoản khớp "${keyword}":\n`];
    const keyboard: { text: string; callbackData: string }[][] = [];

    for (let i = 0; i < candidates.length; i++) {
      const tx = candidates[i];
      const displayAmount = Math.abs(tx.amount).toLocaleString("vi-VN");
      const dateStr = tx.spentAt
        ? `${tx.spentAt.getDate()}/${tx.spentAt.getMonth() + 1}`
        : "";
      lines.push(`${i + 1}. ${displayAmount}đ - ${tx.category} (${tx.note}) — ${dateStr}`);
    }
    lines.push("\nChọn khoản cần xoá:");

    // Build keyboard rows of 3 buttons
    const row: { text: string; callbackData: string }[] = [];
    for (let i = 0; i < candidates.length; i++) {
      row.push({ text: `${i + 1}`, callbackData: `del:${candidates[i].id}` });
      if (row.length === 3 || i === candidates.length - 1) {
        keyboard.push([...row]);
        row.length = 0;
      }
    }
    keyboard.push([{ text: "❌ Huỷ", callbackData: "del:cancel" }]);

    if (this.channelAdapter.sendTextWithKeyboard) {
      await this.channelAdapter.sendTextWithKeyboard(channelUserId, lines.join("\n"), keyboard);
    } else {
      await this.channelAdapter.sendText(channelUserId, lines.join("\n") + "\n\nGõ số thứ tự để xoá.");
    }
  }

  /**
   * Apply a value the user typed after tapping [💰 Đổi số tiền] or [📅 Đổi ngày].
   * Targets the specific transaction recorded in PendingEditManager.
   *
   * Returns true if the message was consumed, false to fall through to normal routing.
   */
  private async handlePendingEdit(
    channelUserId: string,
    internalUserId: string,
    text: string,
  ): Promise<boolean> {
    const pendingEdit = this.pendingEditManager.get(internalUserId);
    if (!pendingEdit) return false;

    // Allow bailing out
    if (CANCEL_REGEX.test(text)) {
      this.pendingEditManager.clear(internalUserId);
      await this.channelAdapter.sendText(channelUserId, "Đã huỷ sửa.");
      return true;
    }

    if (pendingEdit.field === "amount") {
      const amount = extractAmount(text);
      if (!amount || amount <= 0) {
        await this.channelAdapter.sendText(
          channelUserId,
          "Em chưa nhận ra số tiền. Sếp gõ dạng: 30k, 1tr — hoặc gõ \"bỏ\" để huỷ.",
        );
        return true; // keep pending so the user can retry
      }

      const updated = await this.editTransaction.execute(internalUserId, pendingEdit.transactionId, { amount });
      this.pendingEditManager.clear(internalUserId);

      if (!updated) {
        await this.channelAdapter.sendText(channelUserId, "Không sửa được, khoản có thể đã bị xoá.");
        return true;
      }

      const displayAmount = Math.abs(updated.amount).toLocaleString("vi-VN");
      await this.channelAdapter.sendText(
        channelUserId,
        `Đã sửa thành ${displayAmount}đ - ${updated.category}.`,
      );
      return true;
    }

    // field === "date"
    const spentAt = detectDate(text);
    if (!spentAt) {
      await this.channelAdapter.sendText(
        channelUserId,
        "Em chưa nhận ra ngày. Sếp gõ dạng: \"hôm qua\", \"3 ngày trước\" — hoặc gõ \"bỏ\" để huỷ.",
      );
      return true; // keep pending so the user can retry
    }

    if (spentAt > new Date()) {
      await this.channelAdapter.sendText(channelUserId, "Em không thể đặt ngày trong tương lai.");
      return true;
    }

    const updated = await this.editTransaction.execute(internalUserId, pendingEdit.transactionId, { spentAt });
    this.pendingEditManager.clear(internalUserId);

    if (!updated) {
      await this.channelAdapter.sendText(channelUserId, "Không sửa được, khoản có thể đã bị xoá.");
      return true;
    }

    const displayAmount = Math.abs(updated.amount).toLocaleString("vi-VN");
    await this.channelAdapter.sendText(
      channelUserId,
      `Đã sửa ngày khoản ${displayAmount}đ - ${updated.category} thành ${formatDate(spentAt)}.`,
    );
    return true;
  }

  private async handleEditIntent(channelUserId: string, internalUserId: string, result: EditIntentResult): Promise<void> {
    // Incomplete — hỏi lại sếp
    if (result.isIncomplete) {
      await this.channelAdapter.sendText(channelUserId,
        `Sếp muốn sửa gì ạ? Em hỗ trợ sửa:\n` +
        `• Số tiền: "sửa thành 30k"\n` +
        `• Danh mục: "sửa thành ăn uống"\n` +
        `• Ngày: "sửa ngày hôm qua"\n` +
        `• Hoặc kết hợp: "sửa thành cà phê 25k hôm qua"`
      );
      return;
    }

    // Tìm khoản gần nhất qua DB
    const lastTx = await this.transactionRepository.findLastByUser(internalUserId);
    if (!lastTx) {
      await this.channelAdapter.sendText(channelUserId,
        "Không tìm thấy khoản nào để sửa. Sếp thử ghi khoản mới trước nhé."
      );
      return;
    }

    // Build fields cho EditTransaction
    const fields: { amount?: number; category?: string; note?: string; spentAt?: Date } = {};

    if (result.fields.amount !== undefined) {
      fields.amount = result.fields.amount;
    }

    if (result.fields.category) {
      // Chạy Category_Detector pipeline
      const resolvedCategory = resolveCategory(result.fields.category);

      if (!resolvedCategory) {
        await this.channelAdapter.sendText(channelUserId,
          `Em chưa nhận ra danh mục "${result.fields.category}". Sếp chọn một trong các danh mục:\n\n` +
          CATEGORIES.join(", ")
        );
        return;
      }

      fields.category = resolvedCategory;
      fields.note = result.fields.note ?? result.fields.category;
    }

    if (result.fields.spentAt) {
      // Validate: không cho phép ngày tương lai
      const now = new Date();
      if (result.fields.spentAt > now) {
        await this.channelAdapter.sendText(channelUserId,
          "Em không thể đặt ngày trong tương lai. Sếp thử \"sửa ngày hôm qua\" hoặc \"sửa 3 ngày trước\" nhé."
        );
        return;
      }
      fields.spentAt = result.fields.spentAt;
    }

    // Execute edit
    const updated = await this.editTransaction.execute(internalUserId, lastTx.id!, fields);
    if (!updated) {
      await this.channelAdapter.sendText(channelUserId,
        "Không sửa được, khoản có thể đã bị xoá."
      );
      return;
    }

    // Format response
    const displayAmount = Math.abs(updated.amount).toLocaleString("vi-VN");
    const isIncome = updated.amount < 0;
    const verb = isIncome ? "sửa thu nhập thành" : "sửa thành";
    await this.channelAdapter.sendText(channelUserId,
      `Đã ${verb} ${displayAmount}đ - ${updated.category}` +
      (updated.note && updated.note !== updated.category ? ` (${updated.note})` : "") +
      "."
    );
  }

  private async handleNotificationStatus(channelUserId: string, internalUserId: string): Promise<void> {
    const pref = await this.notificationPreferenceRepository.findByUserId(internalUserId);

    // Default: all enabled if no record exists
    const dailyReminder = pref?.dailyReminder ?? true;
    const weeklyDigest = pref?.weeklyDigest ?? true;
    const monthlySummary = pref?.monthlySummary ?? true;

    const statusIcon = (enabled: boolean) => enabled ? '✅ Bật' : '🔕 Tắt';

    const reply = [
      '🔔 Cài đặt thông báo:',
      '',
      `• Nhắc nhở hàng ngày: ${statusIcon(dailyReminder)}`,
      `• Báo cáo tuần: ${statusIcon(weeklyDigest)}`,
      `• Báo cáo tháng: ${statusIcon(monthlySummary)}`,
      '',
      'Gõ "bật/tắt nhắc nhở", "bật/tắt báo cáo tuần", "bật/tắt báo cáo tháng" để thay đổi.',
    ].join('\n');

    await this.channelAdapter.sendText(channelUserId, reply);
  }

  private async handleCompareMonths(channelUserId: string, internalUserId: string, text: string): Promise<void> {
    const match = text.match(COMPARE_MONTHS_REGEX);
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-indexed
    const currentYear = now.getFullYear();

    let monthA: number;
    let yearA: number;
    let monthB: number;
    let yearB: number;

    if (match && match[1] && match[2]) {
      // Explicit months mode
      monthA = parseInt(match[1], 10);
      monthB = parseInt(match[2], 10);

      // Validate month range
      if (monthA < 1 || monthA > 12 || monthB < 1 || monthB > 12) {
        await this.channelAdapter.sendText(
          channelUserId,
          "Tháng không hợp lệ, sếp nhập tháng từ 1 đến 12 nhé!",
        );
        return;
      }

      // Validate same month (before year inference, check raw months)
      // Year inference: if month > current month → previous year
      yearA = monthA > currentMonth ? currentYear - 1 : currentYear;
      yearB = monthB > currentMonth ? currentYear - 1 : currentYear;

      if (monthA === monthB && yearA === yearB) {
        await this.channelAdapter.sendText(
          channelUserId,
          "Sếp cần chọn hai tháng khác nhau để so sánh nhé!",
        );
        return;
      }
    } else {
      // Default mode: current month vs previous month
      monthB = currentMonth;
      yearB = currentYear;

      if (currentMonth === 1) {
        monthA = 12;
        yearA = currentYear - 1;
      } else {
        monthA = currentMonth - 1;
        yearA = currentYear;
      }
    }

    try {
      const result = await this.compareMonths.execute(internalUserId, {
        monthA,
        yearA,
        monthB,
        yearB,
      });

      // Check if either month has no data
      if (result.monthA.totalSpent === 0 && result.monthB.totalSpent === 0) {
        await this.channelAdapter.sendText(
          channelUserId,
          `Tháng ${monthA} và tháng ${monthB} không có khoản chi nào để so sánh.`,
        );
        return;
      }

      if (result.monthA.totalSpent === 0) {
        await this.channelAdapter.sendText(
          channelUserId,
          `Tháng ${monthA} không có khoản chi nào để so sánh.`,
        );
        return;
      }

      if (result.monthB.totalSpent === 0) {
        await this.channelAdapter.sendText(
          channelUserId,
          `Tháng ${monthB} không có khoản chi nào để so sánh.`,
        );
        return;
      }

      // Format the reply
      const lines: string[] = [];

      // Header
      lines.push(`📊 So sánh chi tiêu ${result.monthA.label} vs ${result.monthB.label}`);

      // Totals
      const totalA = result.monthA.totalSpent.toLocaleString("vi-VN");
      const totalB = result.monthB.totalSpent.toLocaleString("vi-VN");
      lines.push(`${result.monthA.label}: ${totalA}đ | ${result.monthB.label}: ${totalB}đ`);

      // Diff line
      const diff = result.totalDifference;
      const diffSign = diff > 0 ? "+" : diff < 0 ? "" : "";
      const diffFormatted = diff.toLocaleString("vi-VN");

      if (result.totalPercentChange === null) {
        lines.push(`Chênh lệch: ${diffSign}${diffFormatted}đ (Mới)`);
      } else {
        const percentSign = result.totalPercentChange > 0 ? "+" : result.totalPercentChange < 0 ? "" : "";
        const percentFormatted = Math.round(result.totalPercentChange);
        lines.push(`Chênh lệch: ${diffSign}${diffFormatted}đ (${percentSign}${percentFormatted}%)`);
      }

      // Category breakdown (already sorted by |absoluteDiff| desc)
      lines.push("");
      for (const cat of result.categoryDiffs) {
        const catAmountA = cat.amountA.toLocaleString("vi-VN");
        const catAmountB = cat.amountB.toLocaleString("vi-VN");
        const catDiff = cat.absoluteDiff;
        const catDiffSign = catDiff > 0 ? "+" : catDiff < 0 ? "" : "";
        const catDiffFormatted = catDiff.toLocaleString("vi-VN");

        let indicator: string;
        if (catDiff > 0) {
          indicator = "↑";
        } else if (catDiff < 0) {
          indicator = "↓";
        } else {
          indicator = "→";
        }

        lines.push(`• ${cat.category}: ${catAmountA}đ → ${catAmountB}đ (${catDiffSign}${catDiffFormatted}đ, ${indicator})`);
      }

      // Webview link
      const rangeA = this.getMonthDateRange(yearA, monthA);
      const rangeB = this.getMonthDateRange(yearB, monthB);
      const token = this.tokenService.generateReportToken({
        userId: internalUserId,
        from: rangeA.from.toISOString(),
        to: rangeB.to.toISOString(),
      });
      const webviewUrl = `${this.config.webviewBaseUrl}/compare?token=${token}&monthA=${monthA}&yearA=${yearA}&monthB=${monthB}&yearB=${yearB}`;

      lines.push("");
      lines.push(`🔗 Sếp xem chi tiết giúp em tại đây: ${webviewUrl}`);

      this.logger.log(`[Compare] user=${internalUserId} monthA=${monthA}/${yearA} monthB=${monthB}/${yearB} → ${webviewUrl}`);
      await this.channelAdapter.sendText(channelUserId, lines.join("\n"));
    } catch (error) {
      if (error instanceof SameMonthError) {
        await this.channelAdapter.sendText(
          channelUserId,
          "Sếp cần chọn hai tháng khác nhau để so sánh nhé!",
        );
        return;
      }
      if (error instanceof InvalidMonthError) {
        await this.channelAdapter.sendText(
          channelUserId,
          "Tháng không hợp lệ, sếp nhập tháng từ 1 đến 12 nhé!",
        );
        return;
      }
      this.logger.error("Compare months failed", error);
      await this.channelAdapter.sendText(channelUserId, SERVICE_UNAVAILABLE_MSG);
    }
  }

  private async handleVoiceMessage(
    channelUserId: string,
    internalUserId: string,
    voice: { data: Buffer; fileId: string; mimeType: string; duration: number },
  ): Promise<void> {
    // Check for download failure (empty buffer)
    if (voice.data.length === 0) {
      this.logger.error(`[Voice] Download failed for user=${internalUserId}`);
      await this.channelAdapter.sendText(channelUserId, SERVICE_UNAVAILABLE_MSG);
      return;
    }

    // Validate duration
    if (voice.duration > MAX_VOICE_DURATION_SECONDS) {
      await this.channelAdapter.sendText(channelUserId, VOICE_TOO_LONG_MSG);
      return;
    }

    try {
      const expenses = await this.multimodalParser.parseVoice(voice.data, voice.mimeType);

      if (expenses.length === 0) {
        await this.channelAdapter.sendText(channelUserId, VOICE_EMPTY_MSG);
        return;
      }

      this.confirmationManager.set(internalUserId, channelUserId, expenses, "voice");
      await this.sendConfirmation(channelUserId, expenses, "voice");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Voice] Parse failed for user=${internalUserId}`, message);
      if (isInvalidJsonError(message)) {
        await this.channelAdapter.sendText(channelUserId, INVALID_JSON_MSG);
      } else {
        await this.channelAdapter.sendText(channelUserId, SERVICE_UNAVAILABLE_MSG);
      }
    }
  }

  private async handlePhotoMessage(
    channelUserId: string,
    internalUserId: string,
    photo: { data: Buffer; fileId: string; mimeType: string; fileSize: number },
  ): Promise<void> {
    // Check for download failure (empty buffer)
    if (photo.data.length === 0) {
      this.logger.error(`[Photo] Download failed for user=${internalUserId}`);
      await this.channelAdapter.sendText(channelUserId, SERVICE_UNAVAILABLE_MSG);
      return;
    }

    // Validate file size
    if (photo.fileSize > MAX_PHOTO_SIZE_BYTES) {
      await this.channelAdapter.sendText(channelUserId, PHOTO_TOO_LARGE_MSG);
      return;
    }

    try {
      const expenses = await this.multimodalParser.parseImage(photo.data, photo.mimeType);

      if (expenses.length === 0) {
        await this.channelAdapter.sendText(channelUserId, PHOTO_EMPTY_MSG);
        return;
      }

      this.confirmationManager.set(internalUserId, channelUserId, expenses, "photo");
      await this.sendConfirmation(channelUserId, expenses, "photo");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Photo] Parse failed for user=${internalUserId}`, message);
      if (isInvalidJsonError(message)) {
        await this.channelAdapter.sendText(channelUserId, INVALID_JSON_MSG);
      } else {
        await this.channelAdapter.sendText(channelUserId, SERVICE_UNAVAILABLE_MSG);
      }
    }
  }

  /**
   * Handle confirmation flow when user has a pending confirmation.
   * Returns true if the message was handled (stop further routing), false to continue normal routing.
   */
  private async handleConfirmation(
    internalUserId: string,
    channelUserId: string,
    text: string,
  ): Promise<boolean> {
    const pending = this.confirmationManager.get(internalUserId);
    if (!pending) return false;

    // "ok" or "lưu" — save all pending expenses
    if (CONFIRM_REGEX.test(text)) {
      for (const expense of pending.expenses) {
        const amount = isIncomeCategory(expense.category)
          ? -Math.abs(expense.amount)
          : Math.abs(expense.amount);

        const transaction: Transaction = {
          userId: internalUserId,
          amount,
          category: expense.category,
          note: expense.note,
          spentAt: expense.date ?? new Date(),
        };
        await this.transactionRepository.save(transaction);
      }

      this.confirmationManager.clear(internalUserId);

      if (pending.expenses.length === 1) {
        const expense = pending.expenses[0];
        const displayAmount = Math.abs(expense.amount).toLocaleString("vi-VN");
        const verb = isIncomeCategory(expense.category) ? "ghi nhận thu" : "ghi nhận";
        await this.channelAdapter.sendText(channelUserId, `Em đã ${verb} ${displayAmount}đ - ${expense.category}`);
      } else {
        const lines = pending.expenses.map((e) => {
          const displayAmount = Math.abs(e.amount).toLocaleString("vi-VN");
          const sign = isIncomeCategory(e.category) ? "+" : "";
          return `• ${sign}${displayAmount}đ - ${e.category}`;
        });
        await this.channelAdapter.sendText(
          channelUserId,
          `Em đã ghi nhận ${pending.expenses.length} khoản:\n${lines.join("\n")}`,
        );
      }
      return true;
    }

    // "đổi danh mục [X]" — change category of the first expense
    const categoryMatch = text.match(CHANGE_CATEGORY_REGEX);
    if (categoryMatch) {
      const rawCategory = categoryMatch[1].trim();
      const resolvedCategory = resolveCategory(rawCategory);

      if (!resolvedCategory) {
        await this.channelAdapter.sendText(
          channelUserId,
          `Em chưa nhận ra danh mục "${rawCategory}". Sếp chọn một trong các danh mục:\n\n` +
            CATEGORIES.join(", "),
        );
        // Keep pending active — user can retry
        return true;
      }

      // Update expense and save
      const expense = pending.expenses[0];
      expense.category = resolvedCategory;

      const amount = isIncomeCategory(expense.category)
        ? -Math.abs(expense.amount)
        : Math.abs(expense.amount);

      const transaction: Transaction = {
        userId: internalUserId,
        amount,
        category: expense.category,
        note: expense.note,
        spentAt: expense.date ?? new Date(),
      };
      await this.transactionRepository.save(transaction);
      this.confirmationManager.clear(internalUserId);

      const displayAmount = Math.abs(expense.amount).toLocaleString("vi-VN");
      const verb = isIncomeCategory(expense.category) ? "ghi nhận thu" : "ghi nhận";
      await this.channelAdapter.sendText(channelUserId, `Em đã ${verb} ${displayAmount}đ - ${expense.category}`);
      return true;
    }

    // "đổi số tiền [X]" — change amount of the first expense
    const amountMatch = text.match(CHANGE_AMOUNT_REGEX);
    if (amountMatch) {
      const rawAmount = amountMatch[1].trim();
      const parsedAmount = extractAmount(rawAmount);

      if (!parsedAmount) {
        await this.channelAdapter.sendText(
          channelUserId,
          "Em chưa nhận ra số tiền. Sếp thử gõ dạng: đổi số tiền 50k",
        );
        // Keep pending active — user can retry
        return true;
      }

      // Update expense and save
      const expense = pending.expenses[0];
      expense.amount = parsedAmount;

      const amount = isIncomeCategory(expense.category)
        ? -Math.abs(expense.amount)
        : Math.abs(expense.amount);

      const transaction: Transaction = {
        userId: internalUserId,
        amount,
        category: expense.category,
        note: expense.note,
        spentAt: expense.date ?? new Date(),
      };
      await this.transactionRepository.save(transaction);
      this.confirmationManager.clear(internalUserId);

      const displayAmount = Math.abs(expense.amount).toLocaleString("vi-VN");
      const verb = isIncomeCategory(expense.category) ? "ghi nhận thu" : "ghi nhận";
      await this.channelAdapter.sendText(channelUserId, `Em đã ${verb} ${displayAmount}đ - ${expense.category}`);
      return true;
    }

    // "bỏ" or "hủy" — cancel
    if (CANCEL_REGEX.test(text)) {
      this.confirmationManager.clear(internalUserId);
      await this.channelAdapter.sendText(channelUserId, "Đã huỷ, em không lưu khoản này.");
      return true;
    }

    // No match — clear pending silently and let message continue to normal routing
    this.confirmationManager.clear(internalUserId);
    return false;
  }

  private formatConfirmationMessage(expenses: ParsedExpense[], source: "voice" | "photo"): string {
    const icon = source === "voice" ? "🎤" : "📸";

    if (expenses.length === 1) {
      const expense = expenses[0];
      const formattedAmount = expense.amount.toLocaleString("vi-VN");
      return [
        `${icon} Em nhận được:`,
        `💰 Số tiền: ${formattedAmount}đ`,
        `📁 Danh mục: ${expense.category}`,
        `📝 Ghi chú: ${expense.note}`,
      ].join("\n");
    }

    // Multiple expenses
    const expenseLines = expenses.map((expense, index) => {
      const formattedAmount = expense.amount.toLocaleString("vi-VN");
      return `${index + 1}. 💰 ${formattedAmount}đ - ${expense.category} (${expense.note})`;
    });

    return [
      `${icon} Em nhận được ${expenses.length} khoản:`,
      ...expenseLines,
    ].join("\n");
  }

  /** Build inline keyboard for confirmation flow. */
  private buildConfirmationKeyboard(expenses: ParsedExpense[]): InlineButton[][] {
    if (expenses.length === 1) {
      return [
        [
          { text: "✅ Lưu", callbackData: "confirm:save" },
          { text: "📁 Đổi danh mục", callbackData: "confirm:cat" },
          { text: "💰 Đổi số tiền", callbackData: "confirm:amt" },
          { text: "❌ Huỷ", callbackData: "confirm:cancel" },
        ],
      ];
    }
    return [
      [
        { text: "✅ Lưu tất cả", callbackData: "confirm:save" },
        { text: "❌ Huỷ", callbackData: "confirm:cancel" },
      ],
    ];
  }

  /** Send confirmation message with inline keyboard (falls back to text-only if keyboard not supported). */
  private async sendConfirmation(channelUserId: string, expenses: ParsedExpense[], source: "voice" | "photo"): Promise<void> {
    const text = this.formatConfirmationMessage(expenses, source);
    const keyboard = this.buildConfirmationKeyboard(expenses);

    if (this.channelAdapter.sendTextWithKeyboard) {
      await this.channelAdapter.sendTextWithKeyboard(channelUserId, text, keyboard);
    } else {
      // Fallback: append text instructions
      const instructions = expenses.length === 1
        ? `\n\n• "ok" — lưu\n• "đổi danh mục [tên]" — đổi danh mục\n• "đổi số tiền [số]" — đổi số tiền\n• "bỏ" — huỷ`
        : `\n\n• "ok" — lưu tất cả\n• "bỏ" — huỷ`;
      await this.channelAdapter.sendText(channelUserId, text + instructions);
    }
  }

  /** Acknowledge a callback query if the channel supports it. */
  private async answerCb(callbackId: string, text?: string): Promise<void> {
    if (this.channelAdapter.answerCallbackQuery) {
      await this.channelAdapter.answerCallbackQuery(callbackId, text);
    }
  }

  /** Replace a message's text (and optionally its keyboard) if the channel supports it. */
  private async editCbMessage(
    chatId: number,
    messageId: number,
    text: string,
    keyboard?: InlineButton[][],
  ): Promise<void> {
    if (this.channelAdapter.editMessageText) {
      await this.channelAdapter.editMessageText(chatId, messageId, text, keyboard);
    }
  }

  /**
   * Resolve the internal user ID (users.id UUID) for a channel-level user ID.
   * Returns undefined if the user is not whitelisted or lookup fails.
   *
   * IMPORTANT: every callback branch that touches persisted data MUST go through
   * this — passing the raw channel user ID to a use case breaks ownership checks.
   */
  private async resolveInternalUserId(channel: string, channelUserId: string): Promise<string | undefined> {
    try {
      const accessResult = await this.checkUserAccess.execute(channel, channelUserId);
      if (!accessResult.allowed) return undefined;
      return accessResult.user.id;
    } catch (error) {
      this.logger.error(`Failed to resolve internal user for ${channelUserId}`, error);
      return undefined;
    }
  }

  /**
   * Handle inline keyboard callback queries.
   *
   * Routing is split in two:
   *  - "confirm:*" / "cat:*"  → operate on an in-memory pending voice/photo confirmation
   *  - everything else        → operate on a PERSISTED transaction, and therefore needs
   *                             the internal user ID resolved from the channel user ID
   */
  private async handleCallbackQuery(query: CallbackQuery): Promise<void> {
    const { userId: channelUserId, data, id: callbackId, chatId, messageId, channel } = query;

    try {
      // --- Pending voice/photo confirmation branches ---
      if (data.startsWith("confirm:") || data.startsWith("cat:")) {
        await this.handleConfirmationCallback(query);
        return;
      }

      // --- Persisted transaction branches: resolve internal user ID first ---
      const internalUserId = await this.resolveInternalUserId(channel, channelUserId);
      if (!internalUserId) {
        await this.answerCb(callbackId, "Sếp chưa được duyệt hoặc phiên đã hết hạn");
        return;
      }

      // Show edit options for a specific transaction
      if (data.startsWith("edit:")) {
        const txId = data.slice(5);
        const editKeyboard: InlineButton[][] = [
          [
            { text: "💰 Đổi số tiền", callbackData: `editamt:${txId}` },
            { text: "📁 Đổi danh mục", callbackData: `editcat:${txId}` },
          ],
          [
            { text: "📅 Đổi ngày", callbackData: `editdate:${txId}` },
            { text: "❌ Huỷ", callbackData: "editcancel" },
          ],
        ];
        await this.editCbMessage(chatId, messageId, "Sếp muốn sửa gì?", editKeyboard);
        await this.answerCb(callbackId);
        return;
      }

      // Ask for a new amount — remember WHICH transaction so the follow-up text
      // edits the tapped record, not merely the most recent one.
      if (data.startsWith("editamt:")) {
        const txId = data.slice(8);
        this.pendingEditManager.set(internalUserId, txId, "amount");
        await this.editCbMessage(chatId, messageId, "💰 Sếp gõ số tiền mới cho khoản này (VD: 30k, 1tr).");
        await this.answerCb(callbackId, "Gõ số tiền mới");
        return;
      }

      // Ask for a new date — same targeting logic as above.
      if (data.startsWith("editdate:")) {
        const txId = data.slice(9);
        this.pendingEditManager.set(internalUserId, txId, "date");
        await this.editCbMessage(chatId, messageId, '📅 Sếp gõ ngày mới (VD: "hôm qua", "3 ngày trước").');
        await this.answerCb(callbackId, "Gõ ngày mới");
        return;
      }

      // Show the 14-category keyboard for a specific transaction
      if (data.startsWith("editcat:")) {
        const txId = data.slice(8);
        await this.editCbMessage(chatId, messageId, "Chọn danh mục mới:", this.buildEditCategoryKeyboard(txId));
        await this.answerCb(callbackId);
        return;
      }

      if (data === "editcancel") {
        this.pendingEditManager.clear(internalUserId);
        await this.editCbMessage(chatId, messageId, "Đã huỷ sửa.");
        await this.answerCb(callbackId);
        return;
      }

      // Apply a category change: "ecat:<txId>:<category>"
      if (data.startsWith("ecat:")) {
        const rest = data.slice(5);
        const sep = rest.indexOf(":");
        if (sep <= 0) {
          await this.answerCb(callbackId);
          return;
        }
        const txId = rest.slice(0, sep);
        const newCategory = rest.slice(sep + 1);

        // internalUserId (not channelUserId) — EditTransaction verifies ownership against it
        const updated = await this.editTransaction.execute(internalUserId, txId, {
          category: newCategory,
          note: newCategory,
        });

        if (updated) {
          const displayAmount = Math.abs(updated.amount).toLocaleString("vi-VN");
          await this.editCbMessage(chatId, messageId, `✅ Đã sửa thành ${displayAmount}đ - ${newCategory}`);
        } else {
          await this.editCbMessage(chatId, messageId, "❌ Không sửa được, khoản có thể đã bị xoá.");
        }
        this.pendingEditManager.clear(internalUserId);
        await this.answerCb(callbackId);
        return;
      }

      // Delete: "del:<transactionId>" or "del:cancel"
      if (data.startsWith("del:")) {
        const target = data.slice(4);

        if (target === "cancel") {
          await this.editCbMessage(chatId, messageId, "❌ Đã huỷ, không xoá.");
          await this.answerCb(callbackId);
          return;
        }

        // Goes through DeleteTransaction so ownership is verified before deleting
        const deleted = await this.deleteTransaction.execute(internalUserId, target);
        if (deleted) {
          const displayAmount = Math.abs(deleted.amount).toLocaleString("vi-VN");
          await this.editCbMessage(chatId, messageId, `✅ Đã xoá khoản ${displayAmount}đ - ${deleted.category}.`);
        } else {
          await this.editCbMessage(chatId, messageId, "❌ Không tìm thấy khoản để xoá (có thể đã bị xoá trước đó).");
        }
        await this.answerCb(callbackId);
        return;
      }

      // Unknown callback data — acknowledge so the button stops spinning
      await this.answerCb(callbackId);
    } catch (error) {
      this.logger.error(`Callback query failed (data=${data})`, error);
      await this.answerCb(callbackId, "Có lỗi xảy ra, sếp thử lại nhé");
    }
  }

  /**
   * Handle "confirm:*" and "cat:*" callbacks, which act on an in-memory
   * pending voice/photo confirmation rather than a persisted transaction.
   */
  private async handleConfirmationCallback(query: CallbackQuery): Promise<void> {
    const { userId: channelUserId, data, id: callbackId, chatId, messageId } = query;

    const pending = this.confirmationManager.findByChannelUserId(channelUserId);
    if (!pending) {
      await this.answerCb(callbackId, "Đã hết hạn, sếp gửi lại nhé");
      return;
    }

    const internalUserId = pending.userId;

    if (data === "confirm:save") {
      // Save all pending expenses
      for (const expense of pending.expenses) {
        const amount = isIncomeCategory(expense.category)
          ? -Math.abs(expense.amount)
          : Math.abs(expense.amount);

        const transaction: Transaction = {
          userId: internalUserId,
          amount,
          category: expense.category,
          note: expense.note,
          spentAt: expense.date ?? new Date(),
        };
        await this.transactionRepository.save(transaction);
      }

      this.confirmationManager.clear(internalUserId);

      // Edit message to show saved confirmation
      const savedText = pending.expenses.length === 1
        ? `✅ Đã ghi nhận ${Math.abs(pending.expenses[0].amount).toLocaleString("vi-VN")}đ - ${pending.expenses[0].category}`
        : `✅ Đã ghi nhận ${pending.expenses.length} khoản`;

      if (this.channelAdapter.editMessageText) {
        await this.channelAdapter.editMessageText(chatId, messageId, savedText);
      }
      if (this.channelAdapter.answerCallbackQuery) {
        await this.channelAdapter.answerCallbackQuery(callbackId);
      }
      return;
    }

    if (data === "confirm:cancel") {
      this.confirmationManager.clear(internalUserId);

      if (this.channelAdapter.editMessageText) {
        await this.channelAdapter.editMessageText(chatId, messageId, "❌ Đã huỷ, em không lưu khoản này.");
      }
      if (this.channelAdapter.answerCallbackQuery) {
        await this.channelAdapter.answerCallbackQuery(callbackId);
      }
      return;
    }

    if (data === "confirm:cat") {
      // Show category selection keyboard
      const categoryKeyboard = this.buildCategoryKeyboard();
      if (this.channelAdapter.editMessageText) {
        const text = this.formatConfirmationMessage(pending.expenses, pending.source) + "\n\n📁 Chọn danh mục:";
        await this.channelAdapter.editMessageText(chatId, messageId, text, categoryKeyboard);
      }
      if (this.channelAdapter.answerCallbackQuery) {
        await this.channelAdapter.answerCallbackQuery(callbackId);
      }
      return;
    }

    if (data === "confirm:amt") {
      // Ask user to type new amount
      if (this.channelAdapter.answerCallbackQuery) {
        await this.channelAdapter.answerCallbackQuery(callbackId, "Gõ số tiền mới (VD: 30k)");
      }
      return;
    }

    // Category selection: "cat:<category_name>"
    if (data.startsWith("cat:")) {
      const category = data.slice(4);
      const expense = pending.expenses[0];
      expense.category = category;

      // Save with new category
      const amount = isIncomeCategory(expense.category)
        ? -Math.abs(expense.amount)
        : Math.abs(expense.amount);

      const transaction: Transaction = {
        userId: internalUserId,
        amount,
        category: expense.category,
        note: expense.note,
        spentAt: expense.date ?? new Date(),
      };
      await this.transactionRepository.save(transaction);
      this.confirmationManager.clear(internalUserId);

      const savedText = `✅ Đã ghi nhận ${Math.abs(expense.amount).toLocaleString("vi-VN")}đ - ${category}`;
      await this.editCbMessage(chatId, messageId, savedText);
      await this.answerCb(callbackId);
      return;
    }

    // Unrecognised confirm/cat action — acknowledge so the button stops spinning
    await this.answerCb(callbackId);
  }

  /** Build a keyboard of all categories in rows of 3, using a caller-supplied callback data builder. */
  private buildCategoryRows(toCallbackData: (category: string) => string): InlineButton[][] {
    const keyboard: InlineButton[][] = [];
    for (let i = 0; i < CATEGORIES.length; i += 3) {
      keyboard.push(
        CATEGORIES.slice(i, i + 3).map((cat) => ({
          text: cat,
          callbackData: toCallbackData(cat),
        })),
      );
    }
    return keyboard;
  }

  /** Category picker for the voice/photo confirmation flow. */
  private buildCategoryKeyboard(): InlineButton[][] {
    return this.buildCategoryRows((cat) => `cat:${cat}`);
  }

  /** Category picker for editing an existing transaction. */
  private buildEditCategoryKeyboard(txId: string): InlineButton[][] {
    const keyboard = this.buildCategoryRows((cat) => `ecat:${txId}:${cat}`);
    keyboard.push([{ text: "❌ Huỷ", callbackData: "editcancel" }]);
    return keyboard;
  }

  private getMonthDateRange(year: number, month: number): { from: Date; to: Date } {
    const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const to = new Date(year, month, 0, 23, 59, 59, 999);
    return { from, to };
  }
}
