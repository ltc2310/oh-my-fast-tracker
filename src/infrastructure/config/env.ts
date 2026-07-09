import "dotenv/config";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const env = {
  telegramToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseKey: requireEnv("SUPABASE_SERVICE_KEY"),
  webviewBaseUrl: process.env.WEBVIEW_BASE_URL ?? "http://localhost:3000/report",
 reportTokenSecret: requireEnv("REPORT_TOKEN_SECRET"),
 corsOrigin: process.env.CORS_ORIGIN ?? "*",
 port: Number(process.env.PORT ?? 3000),
 cronSecret: requireEnv("CRON_SECRET"),
};
