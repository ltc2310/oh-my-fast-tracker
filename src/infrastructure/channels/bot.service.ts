import { Injectable, Inject, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { ChannelAdapter } from "../../domain/ports/ChannelAdapter";
import { RecordTransaction } from "../../application/usecases/RecordTransaction";
import { GenerateWeeklyReport, DateRange } from "../../application/usecases/GenerateWeeklyReport";
import { GenerateTrendReport } from "../../application/usecases/GenerateTrendReport";
import { CheckUserAccess } from "../../application/usecases/CheckUserAccess";
import { TokenService } from "../../domain/ports/TokenService";
import { appConfig } from "../config/app.config";

/** Access control messages (Vietnamese) */
const WELCOME_MSG =
  "Chào bạn! Bot đang trong giai đoạn thử nghiệm giới hạn người dùng.\nTài khoản của bạn đã được ghi nhận, mình sẽ duyệt sớm nhất có thể. Cảm ơn bạn đã quan tâm 🙏";
const PENDING_MSG =
  "Tài khoản của bạn vẫn đang chờ duyệt, mình sẽ thông báo khi có thể sử dụng nhé 🙏";
const SERVICE_UNAVAILABLE_MSG =
  "Hệ thống đang gặp sự cố tạm thời, sếp thử lại sau nhé 🙏";

/** Regex to detect trend report request messages (must be checked BEFORE REPORT_REGEX) */
const TREND_REPORT_REGEX = /báo\s*cáo\s*(?:chi\s*tiêu\s*)?(\d+)\s*tháng|xu\s*hướng\s*(?:chi\s*tiêu\s*)?(\d+)?\s*tháng|báo\s*cáo\s*xu\s*hướng/i;

/** Regex to detect compare months requests (not yet supported) */
const COMPARE_MONTHS_REGEX = /so\s*sánh\s*tháng\s*\d+\s*(?:với|và|vs)\s*tháng\s*\d+/i;

/** Regex to detect existing weekly/monthly report request messages */
const REPORT_REGEX = /báo\s*cáo|chi\s*tiêu\s*(tuần|tháng|ngày|\d)|report/i;

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
    private readonly recordTransaction: RecordTransaction,
    private readonly generateWeeklyReport: GenerateWeeklyReport,
    private readonly generateTrendReport: GenerateTrendReport,
    private readonly checkUserAccess: CheckUserAccess,
  ) { }

  onModuleInit() {
    this.channelAdapter.onMessage(async (message) => {
      // Debug: respond with user's chat ID
      if (/^id$/i.test(message.text.trim())) {
        await this.channelAdapter.sendText(message.userId, `Your ID: ${message.userId}`);
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

      // Check compare months pattern first (not yet supported)
      if (COMPARE_MONTHS_REGEX.test(message.text)) {
        await this.channelAdapter.sendText(
          message.userId,
          'Tính năng so sánh tháng chưa được hỗ trợ. Sếp thử dùng "báo cáo 6 tháng" để xem xu hướng chi tiêu nhé!'
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
        await this.channelAdapter.sendText(
          message.userId,
          `Em đã ghi nhận ${prefix}${t.amount.toLocaleString("vi-VN")}đ - ${t.category}`
        );
        return;
      }

      // Multiple transactions
      const lines = transactions.map((t) => {
        const prefix = formatSpentPrefix(t.spentAt);
        return `• ${prefix}${t.amount.toLocaleString("vi-VN")}đ - ${t.category}`;
      });
      const total = transactions.reduce((sum, t) => sum + t.amount, 0);
      lines.push(`\nTổng: ${total.toLocaleString("vi-VN")}đ`);

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
      `💰 Tổng: ${summary.total.toLocaleString("vi-VN")}đ`,
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
}
