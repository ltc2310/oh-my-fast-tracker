import { registerAs } from "@nestjs/config";

export const appConfig = registerAs("app", () => ({
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  webviewBaseUrl: process.env.WEBVIEW_BASE_URL ?? "http://localhost:3000/report",
}));

export const telegramConfig = registerAs("telegram", () => ({
  token: requireEnv("TELEGRAM_BOT_TOKEN"),
}));

export const supabaseConfig = registerAs("supabase", () => ({
  url: requireEnv("SUPABASE_URL"),
  key: requireEnv("SUPABASE_SERVICE_KEY"),
}));

export const authConfig = registerAs("auth", () => ({
  reportTokenSecret: requireEnv("REPORT_TOKEN_SECRET"),
}));

export const aiConfig = registerAs("ai", () => ({
  geminiApiKey: requireEnv("GEMINI_API_KEY"),
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
  geminiMultimodalModel: process.env.GEMINI_MULTIMODAL_MODEL ?? "gemini-2.0-flash",
}));

export const adminConfig = registerAs("admin", () => ({
  secret: requireEnv("ADMIN_API_SECRET"),
}));

export const notificationConfig = registerAs("notification", () => ({
  dailyReminderCron: process.env.DAILY_REMINDER_CRON ?? "0 20 * * *",
  weeklyDigestCron: process.env.WEEKLY_DIGEST_CRON ?? "0 20 * * 0",
  monthlySummaryCron: process.env.MONTHLY_SUMMARY_CRON ?? "0 20 L * *",
}));

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
