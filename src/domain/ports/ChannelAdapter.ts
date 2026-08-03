export interface PhotoAttachment {
  data: Buffer;
  fileId: string;
  mimeType: string;
  fileSize: number;
}

export interface VoiceAttachment {
  data: Buffer;
  fileId: string;
  mimeType: string;
  duration: number;
}

export interface IncomingMessage {
  userId: string;
  channel: string;
  text: string;
  username?: string;
  photo?: PhotoAttachment;
  voice?: VoiceAttachment;
}

/**
 * Shared contract for any chat channel (Telegram, Zalo, ...).
 * Core logic (use cases) only ever depends on this interface,
 * and knows nothing about the Telegram Bot API or Zalo OA API.
 */
export interface ChannelAdapter {
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  sendText(userId: string, text: string): Promise<void>;
  sendLink(userId: string, url: string, label?: string): Promise<void>;
  start(): Promise<void>;
}
