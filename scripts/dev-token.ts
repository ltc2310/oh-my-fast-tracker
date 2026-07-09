import "dotenv/config";
import { JwtTokenService } from "../src/infrastructure/auth/JwtTokenService";
import { env } from "../src/infrastructure/config/env";

// Dev-only helper: prints a valid webview link for a given Telegram chat id,
// so you can test the frontend before the weekly cron job is wired up.
// Usage: npx ts-node scripts/dev-token.ts <telegram_chat_id>

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: npx ts-node scripts/dev-token.ts <telegram_chat_id>");
  process.exit(1);
}

const tokenService = new JwtTokenService(env.reportTokenSecret);
const token = tokenService.generateToken(userId);

console.log(`${env.webviewBaseUrl}?token=${token}`);