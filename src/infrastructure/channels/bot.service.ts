import { Injectable, Inject, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { ChannelAdapter } from "../../domain/ports/ChannelAdapter";
import { MultimodalParser } from "../../domain/ports/MultimodalParser";
import { ParsedExpense } from "../../domain/ports/Parser";
import { RecordTransaction } from "../../application/usecases/RecordTransaction";
import { GenerateWeeklyReport, DateRange } from "../../application/usecases/GenerateWeeklyReport";
import { GenerateTrendReport } from "../../application/usecases/GenerateTrendReport";
import { CompareMonths, SameMonthError, InvalidMonthError } from "../../application/usecases/CompareMonths";
import { CheckUserAccess } from "../../application/usecases/CheckUserAccess";
import { UndoLastTransaction } from "../../application/usecases/UndoLastTransaction";
import { EditTransaction } from "../../application/usecases/EditTransaction";
import { ConfirmationManager } from "../../application/services/ConfirmationManager";
import { TokenService } from "../../domain/ports/TokenService";
import { EditIntentDetector, EditIntentResult } from "../../domain/ports/EditIntentDetector";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { NotificationPreferenceRepository } from "../../domain/ports/NotificationPreferenceRepository";
import { appConfig } from "../config/app.config";
import { detectCategory, expandAbbreviations, normalizeSpelling, extractAmount } from "../parsers/RegexParser";
import { isIncomeCategory } from "../../domain/constants/income-categories";
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

🎤 Voice & Ảnh:
• Gửi tin nhắn thoại mô tả chi tiêu
• Gửi ảnh chuyển khoản ngân hàng
• "ok" — xác nhận lưu
• "đổi danh mục [tên]" — đổi danh mục
• "đổi số tiền [số]" — đổi số tiền
• "bỏ" — huỷ không lưu

📊 Xem báo cáo:
• báo cáo (7 ngày gần nhất)
• chi tiêu tháng này
• chi tiêu tháng trước
• chi tiêu từ 1/6 đến 30/6
• báo cáo 6 tháng (xu hướng)
• so sánh tháng (2 tháng gần nhất)
• so sánh tháng X với tháng Y

✏️ Sửa / Xoá:
• xoá (xoá khoản vừa ghi)
• sửa thành 30k (sửa số tiền)
• sửa thành ăn uống (đổi danh mục)
• sửa ngày hôm qua (đổi ngày)
• sửa thành cà phê 25k hôm qua (kết hợp)

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

/** Regex to detect undo/delete last transaction */
const UNDO_REGEX = /^(xo[áa]|xóa|huỷ|hủy|undo|bỏ)\s*(khoản\s*)?(vừa\s*rồi|cuối|gần\s*nhất|mới\s*nhất|lần\s*trước)?$/i;

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
    private readonly generateWeeklyReport: GenerateWeeklyReport,
    private readonly generateTrendReport: GenerateTrendReport,
    private readonly compareMonths: CompareMonths,
    private readonly checkUserAccess: CheckUserAccess,
    private readonly undoLastTransaction: UndoLastTransaction,
    private readonly editTransaction: EditTransaction,
    private readonly confirmationManager: ConfirmationManager,
  ) { }

  onModuleInit() {
    this.channelAdapter.onMessage(async (message) => {
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

      // Check compare months pattern
      const compareMatch = message.text.match(COMPARE_MONTHS_REGEX);
      if (compareMatch) {
        await this.handleCompareMonths(message.userId, message.text);
        return;
      }

      // Undo / delete last transaction
      if (UNDO_REGEX.test(message.text.trim())) {
        await this.handleUndo(message.userId);
        return;
      }

      // Edit transaction (hybrid: regex → AI fallback)
      try {
        const editResult = await this.editIntentDetector.detect(message.text.trim());
        if (editResult) {
          await this.handleEditIntent(message.userId, editResult);
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
        await this.handleTrendReportRequest(message.userId, months);
        return;
      }

      if (REPORT_REGEX.test(message.text)) {
        await this.handleReportRequest(message.userId, message.text);
        return;
      }

      const transactions = await this.recordTransaction.execute(message.userId, message.text);

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
        await this.channelAdapter.sendText(
          message.userId,
          `Em đã ${verb} ${prefix}${displayAmount}đ - ${t.category}`
        );
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
    });
  }

  private async handleReportRequest(userId: string, text: string): Promise<void> {
    const range = parseReportDateRange(text);
    const summary = await this.generateWeeklyReport.execute(userId, range);

    if (summary.total === 0) {
      await this.channelAdapter.sendText(
        userId,
        `Không có khoản chi nào từ ${formatDate(range.from)} đến ${formatDate(range.to)}.`
      );
      return;
    }

    const token = this.tokenService.generateReportToken({
      userId,
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

    this.logger.log(`[Report] user=${userId} → ${url}`);
    await this.channelAdapter.sendText(userId, reply);
  }

  private async handleTrendReportRequest(userId: string, months: number): Promise<void> {
    // Validate range at bot layer — send friendly message without calling use case
    if (months < 3 || months > 12) {
      await this.channelAdapter.sendText(
        userId,
        `Em chỉ hỗ trợ báo cáo xu hướng từ 3 đến 12 tháng. Sếp thử "báo cáo 6 tháng" nhé!`
      );
      return;
    }

    const report = await this.generateTrendReport.execute(userId, { months });

    // Generate token for webview/export links
    const token = this.tokenService.generateReportToken({
      userId,
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
    this.logger.log(`[TrendReport] user=${userId} months=${months} → ${webviewLink}`);
    await this.channelAdapter.sendText(userId, reply);
  }

  private async handleUndo(userId: string): Promise<void> {
    const deleted = await this.undoLastTransaction.execute(userId);
    if (!deleted) {
      await this.channelAdapter.sendText(
        userId,
        "Không tìm thấy khoản nào để xoá. Có thể sếp chưa ghi khoản nào hoặc đã xoá rồi."
      );
      return;
    }

    const displayAmount = Math.abs(deleted.amount).toLocaleString("vi-VN");
    await this.channelAdapter.sendText(
      userId,
      `Đã xoá khoản ${displayAmount}đ - ${deleted.category} (${deleted.note}).`
    );
  }

  private async handleEditIntent(userId: string, result: EditIntentResult): Promise<void> {
    // Incomplete — hỏi lại sếp
    if (result.isIncomplete) {
      await this.channelAdapter.sendText(userId,
        `Sếp muốn sửa gì ạ? Em hỗ trợ sửa:\n` +
        `• Số tiền: "sửa thành 30k"\n` +
        `• Danh mục: "sửa thành ăn uống"\n` +
        `• Ngày: "sửa ngày hôm qua"\n` +
        `• Hoặc kết hợp: "sửa thành cà phê 25k hôm qua"`
      );
      return;
    }

    // Tìm khoản gần nhất qua DB
    const lastTx = await this.transactionRepository.findLastByUser(userId);
    if (!lastTx) {
      await this.channelAdapter.sendText(userId,
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
      const lowered = result.fields.category.toLowerCase();
      const expanded = expandAbbreviations(lowered);
      const normalized = normalizeSpelling(expanded);
      const resolvedCategory = detectCategory(normalized) ?? detectCategory(expanded);

      if (!resolvedCategory) {
        await this.channelAdapter.sendText(userId,
          `Em chưa nhận ra danh mục "${result.fields.category}". Sếp chọn một trong các danh mục:\n\n` +
          `Ăn uống, Di chuyển, Mua sắm, Nhà ở, Tiện ích, Internet, ` +
          `Sức khỏe, Giáo dục, Giải trí, Con cái, Chi phí cố định, ` +
          `Tiết kiệm & Đầu tư, Thu nhập, Khác`
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
        await this.channelAdapter.sendText(userId,
          "Em không thể đặt ngày trong tương lai. Sếp thử \"sửa ngày hôm qua\" hoặc \"sửa 3 ngày trước\" nhé."
        );
        return;
      }
      fields.spentAt = result.fields.spentAt;
    }

    // Execute edit
    const updated = await this.editTransaction.execute(userId, lastTx.id!, fields);
    if (!updated) {
      await this.channelAdapter.sendText(userId,
        "Không sửa được, khoản có thể đã bị xoá."
      );
      return;
    }

    // Format response
    const displayAmount = Math.abs(updated.amount).toLocaleString("vi-VN");
    const isIncome = updated.amount < 0;
    const verb = isIncome ? "sửa thu nhập thành" : "sửa thành";
    await this.channelAdapter.sendText(userId,
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

  private async handleCompareMonths(userId: string, text: string): Promise<void> {
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
          userId,
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
          userId,
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
      const result = await this.compareMonths.execute(userId, {
        monthA,
        yearA,
        monthB,
        yearB,
      });

      // Check if either month has no data
      if (result.monthA.totalSpent === 0 && result.monthB.totalSpent === 0) {
        await this.channelAdapter.sendText(
          userId,
          `Tháng ${monthA} và tháng ${monthB} không có khoản chi nào để so sánh.`,
        );
        return;
      }

      if (result.monthA.totalSpent === 0) {
        await this.channelAdapter.sendText(
          userId,
          `Tháng ${monthA} không có khoản chi nào để so sánh.`,
        );
        return;
      }

      if (result.monthB.totalSpent === 0) {
        await this.channelAdapter.sendText(
          userId,
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
        userId,
        from: rangeA.from.toISOString(),
        to: rangeB.to.toISOString(),
      });
      const webviewUrl = `${this.config.webviewBaseUrl}/compare?token=${token}&monthA=${monthA}&yearA=${yearA}&monthB=${monthB}&yearB=${yearB}`;

      lines.push("");
      lines.push(`🔗 Sếp xem chi tiết giúp em tại đây: ${webviewUrl}`);

      this.logger.log(`[Compare] user=${userId} monthA=${monthA}/${yearA} monthB=${monthB}/${yearB} → ${webviewUrl}`);
      await this.channelAdapter.sendText(userId, lines.join("\n"));
    } catch (error) {
      if (error instanceof SameMonthError) {
        await this.channelAdapter.sendText(
          userId,
          "Sếp cần chọn hai tháng khác nhau để so sánh nhé!",
        );
        return;
      }
      if (error instanceof InvalidMonthError) {
        await this.channelAdapter.sendText(
          userId,
          "Tháng không hợp lệ, sếp nhập tháng từ 1 đến 12 nhé!",
        );
        return;
      }
      this.logger.error("Compare months failed", error);
      await this.channelAdapter.sendText(userId, SERVICE_UNAVAILABLE_MSG);
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
      const confirmMsg = this.formatConfirmationMessage(expenses, "voice");
      await this.channelAdapter.sendText(channelUserId, confirmMsg);
    } catch (error: any) {
      this.logger.error(`[Voice] Parse failed for user=${internalUserId}`, error?.message);
      if (error?.message?.includes("invalid JSON") || error?.message?.includes("Invalid JSON")) {
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
      const confirmMsg = this.formatConfirmationMessage(expenses, "photo");
      await this.channelAdapter.sendText(channelUserId, confirmMsg);
    } catch (error: any) {
      this.logger.error(`[Photo] Parse failed for user=${internalUserId}`, error?.message);
      if (error?.message?.includes("invalid JSON") || error?.message?.includes("Invalid JSON")) {
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
      const lowered = rawCategory.toLowerCase();
      const expanded = expandAbbreviations(lowered);
      const normalized = normalizeSpelling(expanded);
      const resolvedCategory = detectCategory(normalized) ?? detectCategory(expanded);

      if (!resolvedCategory) {
        await this.channelAdapter.sendText(
          channelUserId,
          `Em chưa nhận ra danh mục "${rawCategory}". Sếp chọn một trong các danh mục:\n\n` +
            `Ăn uống, Di chuyển, Mua sắm, Nhà ở, Tiện ích, Internet, ` +
            `Sức khỏe, Giáo dục, Giải trí, Con cái, Chi phí cố định, ` +
            `Tiết kiệm & Đầu tư, Thu nhập, Khác`,
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
        "",
        `• "ok" — lưu`,
        `• "đổi danh mục [tên]" — đổi danh mục`,
        `• "đổi số tiền [số]" — đổi số tiền`,
        `• "bỏ" — huỷ`,
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
      "",
      `• "ok" — lưu tất cả`,
      `• "bỏ" — huỷ`,
    ].join("\n");
  }

  private getMonthDateRange(year: number, month: number): { from: Date; to: Date } {
    const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const to = new Date(year, month, 0, 23, 59, 59, 999);
    return { from, to };
  }
}
