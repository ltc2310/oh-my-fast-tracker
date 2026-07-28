import { Injectable, Inject, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { ChannelAdapter } from "../../domain/ports/ChannelAdapter";
import { RecordTransaction } from "../../application/usecases/RecordTransaction";
import { GenerateWeeklyReport, DateRange } from "../../application/usecases/GenerateWeeklyReport";
import { TokenService } from "../../domain/ports/TokenService";
import { Transaction } from "../../domain/entities/Transaction";
import { appConfig } from "../config/app.config";

/** Regex to detect report request messages */
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
    private readonly generateWeeklyReport: GenerateWeeklyReport
  ) {}

  onModuleInit() {
    this.channelAdapter.onMessage(async (message) => {
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
}
