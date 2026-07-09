import { env } from "./infrastructure/config/env";
import { TelegramAdapter } from "./infrastructure/channels/TelegramAdapter";
import { RegexParser } from "./infrastructure/parsers/RegexParser";
import { SupabaseTransactionRepository } from "./infrastructure/repositories/SupabaseTransactionRepository";
import { RecordTransaction } from "./application/usecases/RecordTransaction";
import { GenerateWeeklyReport } from "./application/usecases/GenerateWeeklyReport";
import { ChannelAdapter } from "./domain/ports/ChannelAdapter";
import { Parser } from "./domain/ports/Parser";
import { TransactionRepository } from "./domain/ports/TransactionRepository";
import { JwtTokenService } from "./infrastructure/auth/JwtTokenService";
import { createHttpServer } from "./infrastructure/http/server";
import { TokenService } from "./domain/ports/TokenService";

// ---------------------------------------------------------------------------
// Composition root: THIS IS THE ONLY FILE allowed to "new" concrete classes.
// To swap Regex -> AI, or Telegram -> Zalo, only edit the two lines below.
// ---------------------------------------------------------------------------

const channelAdapter: ChannelAdapter = new TelegramAdapter(env.telegramToken);
const parser: Parser = new RegexParser();
const repository: TransactionRepository = new SupabaseTransactionRepository(
  env.supabaseUrl,
  env.supabaseKey
);

const tokenService: TokenService = new JwtTokenService(env.reportTokenSecret);

const recordTransaction = new RecordTransaction(parser, repository);
const generateWeeklyReport = new GenerateWeeklyReport(repository);

channelAdapter.onMessage(async (message) => {
  const transaction = await recordTransaction.execute(message.userId, message.text);

  if (!transaction) {
    await channelAdapter.sendText(
      message.userId,
      'Mình chưa nhận diện được số tiền. Thử gõ dạng: "ăn trưa 50k" nhé.'
    );
    return;
  }

  await channelAdapter.sendText(
    message.userId,
    `Đã ghi nhận: ${transaction.amount.toLocaleString("vi-VN")}đ - ${transaction.category}`
  );
});

export async function sendWeeklyReports(userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    const summary = await generateWeeklyReport.execute(userId);
    if (summary.total === 0) continue;

    const token = tokenService.generateToken(userId);
    const url = `${env.webviewBaseUrl}?token=${token}`;
    await channelAdapter.sendText(
      userId,
      `Xem báo cáo chi tiêu tuần này: ${url}`
    );
  }
}

// Expose the API the React webview calls (GET /api/report?token=xxx),
// running alongside the bot in the same process.
const httpServer = createHttpServer(
  generateWeeklyReport,
  tokenService,
  repository,
  env.corsOrigin,
  env.cronSecret,
  sendWeeklyReports
);httpServer.listen(env.port, () => {
  console.log(`API server listening on port ${env.port}`);
});


channelAdapter.start().then(() => {
  console.log("Bot is running.");
});
