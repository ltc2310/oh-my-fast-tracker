import { Injectable, Inject, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { ChannelAdapter } from "../../domain/ports/ChannelAdapter";
import { RecordTransaction } from "../../application/usecases/RecordTransaction";
import { GenerateWeeklyReport, DateRange } from "../../application/usecases/GenerateWeeklyReport";
import { GenerateTrendReport } from "../../application/usecases/GenerateTrendReport";
import { CheckUserAccess } from "../../application/usecases/CheckUserAccess";
import { UndoLastTransaction } from "../../application/usecases/UndoLastTransaction";
import { EditTransaction } from "../../application/usecases/EditTransaction";
import { TokenService } from "../../domain/ports/TokenService";
import { EditIntentDetector, EditIntentResult } from "../../domain/ports/EditIntentDetector";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { appConfig } from "../config/app.config";
import { detectCategory, expandAbbreviations, normalizeSpelling } from "../parsers/RegexParser";

/** Access control messages (Vietnamese) */
const WELCOME_MSG =
  "Chào bạn! Bot đang trong giai đoạn thử nghiệm giới hạn người dùng.\nTài khoản của bạn đã được ghi nhận, mình sẽ duyệt sớm nhất có thể. Cảm ơn bạn đã quan tâm 🙏";
const PENDING_MSG =
  "Tài khoản của bạn vẫn đang chờ duyệt, mình sẽ thông báo khi có thể sử dụng nhé 🙏";
const SERVICE_UNAVAILABLE_MSG =
  "Hệ thống đang gặp sự cố tạm thời, sếp thử lại sau nhé 🙏";

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

📊 Xem báo cáo:
• báo cáo (7 ngày gần nhất)
• chi tiêu tháng này
• chi tiêu tháng trước
• chi tiêu từ 1/6 đến 30/6
• báo cáo 6 tháng (xu hướng)

✏️ Sửa / Xoá:
• xoá (xoá khoản vừa ghi)
• sửa thành 30k (sửa số tiền)
• sửa thành ăn uống (đổi danh mục)
• sửa ngày hôm qua (đổi ngày)
• sửa thành cà phê 25k hôm qua (kết hợp)

🔧 Khác:
• /start — giới thiệu bot
• /help — xem hướng dẫn này
• id — xem chat ID của bạn`;

/** Regex to detect trend report request messages (must be checked BEFORE REPORT_REGEX) */
const TREND_REPORT_REGEX = /báo\s*cáo\s*(?:chi\s*tiêu\s*)?(\d+)\s*tháng|xu\s*hướng\s*(?:chi\s*tiêu\s*)?(\d+)?\s*tháng|báo\s*cáo\s*xu\s*hướng/i;

/** Regex to detect compare months requests (not yet supported) */
const COMPARE_MONTHS_REGEX = /so\s*sánh\s*tháng\s*\d+\s*(?:với|và|vs)\s*tháng\s*\d+/i;

/** Regex to detect existing weekly/monthly report request messages */
const REPORT_REGEX = /báo\s*cáo|chi\s*tiêu\s*(tuần|tháng|ngày|\d)|report/i;

/** Regex to detect undo/delete last transaction */
const UNDO_REGEX = /^(xo[áa]|xóa|huỷ|hủy|undo|bỏ)\s*(khoản\s*)?(vừa\s*rồi|cuối|gần\s*nhất|mới\s*nhất|lần\s*trước)?$/i;

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
    private readonly recordTransaction: RecordTransaction,
    private readonly generateWeeklyReport: GenerateWeeklyReport,
    private readonly generateTrendReport: GenerateTrendReport,
    private readonly checkUserAccess: CheckUserAccess,
    private readonly undoLastTransaction: UndoLastTransaction,
    private readonly editTransaction: EditTransaction,
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

      // Check compare months pattern first (not yet supported)
      if (COMPARE_MONTHS_REGEX.test(message.text)) {
        await this.channelAdapter.sendText(
          message.userId,
          'Tính năng so sánh tháng chưa được hỗ trợ. Sếp thử dùng "báo cáo 6 tháng" để xem xu hướng chi tiêu nhé!'
        );
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
}
