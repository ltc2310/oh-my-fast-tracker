import { Injectable, Inject, OnModuleInit, Logger } from "@nestjs/common";
import TelegramBot from "node-telegram-bot-api";
import {
  ChannelAdapter,
  IncomingMessage,
  PhotoAttachment,
  VoiceAttachment,
} from "../../domain/ports/ChannelAdapter";
import { ConfigType } from "@nestjs/config";
import { telegramConfig } from "../config/app.config";

/**
 * Telegram implementation of the ChannelAdapter interface.
 * Uses NestJS OnModuleInit lifecycle hook to start polling automatically.
 * Handles text, photo, and voice messages.
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
      if (!msg.chat?.id) return;
      if (!this.messageHandler) return;

      const userId = String(msg.chat.id);
      const username = msg.from?.username ?? undefined;

      try {
        // Voice message handling
        if (msg.voice) {
          // Pre-download validation: check duration and file_size from metadata
          if (msg.voice.duration > 60) {
            await this.messageHandler({
              userId, channel: "telegram", text: "", username,
              voice: { data: Buffer.alloc(0), fileId: msg.voice.file_id, mimeType: msg.voice.mime_type ?? "audio/ogg", duration: msg.voice.duration },
            });
            return;
          }
          if (msg.voice.file_size && msg.voice.file_size > 20 * 1024 * 1024) {
            this.logger.warn(`[Voice] File too large (${msg.voice.file_size} bytes) for user ${userId}, skipping download`);
            await this.messageHandler({
              userId, channel: "telegram", text: "", username,
              voice: { data: Buffer.alloc(0), fileId: msg.voice.file_id, mimeType: msg.voice.mime_type ?? "audio/ogg", duration: msg.voice.duration },
            });
            return;
          }
          const voice = await this.downloadVoice(msg.voice);
          await this.messageHandler({
            userId,
            channel: "telegram",
            text: "",
            username,
            voice,
          });
          return;
        }

        // Photo message handling (select highest resolution — last element)
        if (msg.photo && msg.photo.length > 0) {
          const highRes = msg.photo[msg.photo.length - 1];
          // Pre-download validation: check file_size from metadata
          if (highRes.file_size && highRes.file_size > 10 * 1024 * 1024) {
            this.logger.warn(`[Photo] File too large (${highRes.file_size} bytes) for user ${userId}, skipping download`);
            await this.messageHandler({
              userId, channel: "telegram", text: msg.caption ?? "", username,
              photo: { data: Buffer.alloc(0), fileId: highRes.file_id, mimeType: "image/jpeg", fileSize: highRes.file_size },
            });
            return;
          }
          const photo = await this.downloadPhoto(msg.photo);
          await this.messageHandler({
            userId,
            channel: "telegram",
            text: msg.caption ?? "",
            username,
            photo,
          });
          return;
        }

        // Text-only message handling (original behavior)
        if (msg.text) {
          await this.messageHandler({
            userId,
            channel: "telegram",
            text: msg.text,
            username,
          });
        }
      } catch (error) {
        this.logger.error(
          `Failed to process message from user ${userId}: ${error instanceof Error ? error.message : String(error)}`
        );
        // On download/processing failure, still call handler with empty data
        // so BotService can respond with an appropriate error message
        if (msg.voice) {
          await this.messageHandler({
            userId,
            channel: "telegram",
            text: "",
            username,
            voice: {
              data: Buffer.alloc(0),
              fileId: msg.voice.file_id,
              mimeType: msg.voice.mime_type ?? "audio/ogg",
              duration: msg.voice.duration,
            },
          });
        } else if (msg.photo && msg.photo.length > 0) {
          const lastPhoto = msg.photo[msg.photo.length - 1];
          await this.messageHandler({
            userId,
            channel: "telegram",
            text: msg.caption ?? "",
            username,
            photo: {
              data: Buffer.alloc(0),
              fileId: lastPhoto.file_id,
              mimeType: "image/jpeg",
              fileSize: lastPhoto.file_size ?? 0,
            },
          });
        }
      }
    });

    this.logger.log("Telegram bot is running (polling mode).");
  }

  /**
   * Downloads the highest-resolution photo from Telegram's photo size array.
   * The last element in the array is always the highest resolution.
   */
  private async downloadPhoto(
    photoSizes: TelegramBot.PhotoSize[]
  ): Promise<PhotoAttachment> {
    const highRes = photoSizes[photoSizes.length - 1];
    const fileLink = await this.bot.getFileLink(highRes.file_id);
    const response = await fetch(fileLink);

    if (!response.ok) {
      throw new Error(`Photo download failed: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      data: buffer,
      fileId: highRes.file_id,
      mimeType: "image/jpeg",
      fileSize: highRes.file_size ?? buffer.length,
    };
  }

  /**
   * Downloads the voice message audio file from Telegram.
   */
  private async downloadVoice(
    voice: TelegramBot.Voice
  ): Promise<VoiceAttachment> {
    const fileLink = await this.bot.getFileLink(voice.file_id);
    const response = await fetch(fileLink);

    if (!response.ok) {
      throw new Error(`Voice download failed: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      data: buffer,
      fileId: voice.file_id,
      mimeType: voice.mime_type ?? "audio/ogg",
      duration: voice.duration,
    };
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
