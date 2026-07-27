import "dotenv/config";
import jwt from "jsonwebtoken";

// Dev-only helper: prints a valid webview link for a given Telegram chat id,
// so you can test the frontend before the weekly cron job is wired up.
// Usage: npx ts-node scripts/dev-token.ts <telegram_chat_id>

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: npx ts-node scripts/dev-token.ts <telegram_chat_id>");
  process.exit(1);
}

const secret = process.env.REPORT_TOKEN_SECRET;
if (!secret) {
  console.error("Missing REPORT_TOKEN_SECRET in .env");
  process.exit(1);
}

const webviewBaseUrl = process.env.WEBVIEW_BASE_URL ?? "http://localhost:3000/report";
const token = jwt.sign({ sub: userId }, secret, { expiresIn: "7d" });

console.log(`${webviewBaseUrl}?token=${token}`);
