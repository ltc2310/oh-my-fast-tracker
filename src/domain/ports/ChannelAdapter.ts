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

/** A single button in an inline keyboard row. */
export interface InlineButton {
  text: string;
  callbackData: string;
}

/** Callback query from an inline keyboard button press. */
export interface CallbackQuery {
  id: string;
  /** Channel-level user ID (e.g. Telegram chat ID) — NOT the internal user ID. */
  userId: string;
  /** Channel this callback came from (e.g. 'telegram'). Required to resolve the internal user. */
  channel: string;
  messageId: number;
  chatId: number;
  data: string;
}

/** Result of sending a message (for later editing). */
export interface SentMessage {
  messageId: number;
  chatId: number;
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

  // --- Inline keyboard methods (optional — not all channels support them) ---

  /** Send a text message with an inline keyboard. Returns message info for later editing. */
  sendTextWithKeyboard?(userId: string, text: string, keyboard: InlineButton[][]): Promise<SentMessage>;
  /** Listen for inline keyboard button presses. */
  onCallbackQuery?(handler: (query: CallbackQuery) => Promise<void>): void;
  /** Acknowledge a callback query (removes loading indicator on the button). */
  answerCallbackQuery?(callbackQueryId: string, text?: string): Promise<void>;
  /** Edit an existing message's text and optionally its keyboard. */
  editMessageText?(chatId: number, messageId: number, text: string, keyboard?: InlineButton[][]): Promise<void>;
}
