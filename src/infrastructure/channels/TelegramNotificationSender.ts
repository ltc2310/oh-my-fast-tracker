import { Injectable, Inject } from '@nestjs/common';
import { ChannelAdapter } from '../../domain/ports/ChannelAdapter';
import { NotificationSender } from '../../domain/ports/NotificationSender';

/**
 * Telegram implementation of the NotificationSender port.
 * Reuses the existing TelegramAdapter (which holds the TelegramBot instance)
 * via the ChannelAdapter interface — no new bot connection is created.
 */
@Injectable()
export class TelegramNotificationSender implements NotificationSender {
  constructor(
    @Inject('ChannelAdapter') private readonly channelAdapter: ChannelAdapter,
  ) {}

  async sendMessage(channelUserId: string, text: string): Promise<void> {
    await this.channelAdapter.sendText(channelUserId, text);
  }
}
