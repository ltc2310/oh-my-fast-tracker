import { env } from "./infrastructure/config/env";
import { TelegramAdapter } from "./infrastructure/channels/TelegramAdapter";
import { RegexParser } from "./infrastructure/parsers/RegexParser";
import { SupabaseTransactionRepository } from "./infrastructure/repositories/SupabaseTransactionRepository";
import { RecordTransaction } from "./application/usecases/RecordTransaction";
import { GenerateWeeklyReport } from "./application/usecases/GenerateWeeklyReport";
import { ChannelAdapter } from "./domain/ports/ChannelAdapter";
import { Parser } from "./domain/ports/Parser";
import { TransactionRepository } from "./domain/ports/TransactionRepository";

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

    const url = `${env.webviewBaseUrl}?user_id=${userId}`;
    await channelAdapter.sendLink(userId, url, "Xem báo cáo chi tiêu tuần này");
  }
}

channelAdapter.start().then(() => {
  console.log("Bot is running.");
});
