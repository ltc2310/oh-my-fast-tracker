import TelegramBot from "node-telegram-bot-api";
import { ChannelAdapter, IncomingMessage } from "../../domain/ports/ChannelAdapter";

/**
 * Current implementation of the ChannelAdapter interface.
 * This is the second swap point: write a ZaloAdapter that implements
 * the same interface when you need to expand — no changes needed in
 * any use case or parser.
 */
export class TelegramAdapter implements ChannelAdapter {
  private readonly bot: TelegramBot;

  constructor(token: string) {
    // polling: true is convenient for MVP / local development.
    // For production, switch to polling: false + bot.setWebHook(url).
    this.bot = new TelegramBot(token, { polling: true });
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.bot.on("message", async (msg) => {
      if (!msg.text || !msg.chat?.id) return;

      await handler({
        userId: String(msg.chat.id),
        channel: "telegram",
        text: msg.text,
      });
    });
  }

  async sendText(userId: string, text: string): Promise<void> {
    await this.bot.sendMessage(userId, text);
  }

  async sendLink(userId: string, url: string, label = "Xem chi tiết"): Promise<void> {
    await this.bot.sendMessage(userId, `${label}: ${url}`);
  }

  async start(): Promise<void> {
    // Polling already starts on construction; this method is kept so the
    // interface stays symmetric with other adapters (e.g. Zalo) that need
    // an explicit start step.
  }
}
