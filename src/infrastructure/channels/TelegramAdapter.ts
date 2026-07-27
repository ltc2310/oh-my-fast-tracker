import { Injectable, Inject, OnModuleInit, Logger } from "@nestjs/common";
import TelegramBot from "node-telegram-bot-api";
import { ChannelAdapter, IncomingMessage } from "../../domain/ports/ChannelAdapter";
import { ConfigType } from "@nestjs/config";
import { telegramConfig } from "../config/app.config";

/**
 * Telegram implementation of the ChannelAdapter interface.
 * Uses NestJS OnModuleInit lifecycle hook to start polling automatically.
 */
@Injectable()
export class TelegramAdapter implements ChannelAdapter, OnModuleInit {
  private readonly logger = new Logger(TelegramAdapter.name);
  private readonly bot: TelegramBot;
  private messageHandler?: (msg: IncomingMessage) => Promise<void>;

  constructor(
    @Inject(telegramConfig.KEY) private readonly config: ConfigType<typeof telegramConfig>
  ) {
    this.bot = new TelegramBot(config.token, { polling: true });
  }

  onModuleInit() {
    this.bot.on("message", async (msg) => {
      if (!msg.text || !msg.chat?.id) return;
      if (!this.messageHandler) return;

      await this.messageHandler({
        userId: String(msg.chat.id),
        channel: "telegram",
        text: msg.text,
      });
    });

    this.logger.log("Telegram bot is running (polling mode).");
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
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
