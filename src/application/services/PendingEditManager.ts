import { Injectable } from "@nestjs/common";

/** Which field the user is being asked to supply a new value for. */
export type PendingEditField = "amount" | "date";

export interface PendingEdit {
  /** Internal user ID (users.id UUID). */
  userId: string;
  /** The specific transaction the edit applies to. */
  transactionId: string;
  field: PendingEditField;
  createdAt: Date;
  timeoutHandle: NodeJS.Timeout;
}

/**
 * Tracks "which transaction is the user currently editing" between an inline
 * keyboard tap and the follow-up text message.
 *
 * Without this, tapping [✏️ Sửa] → [💰 Đổi số tiền] on an OLD transaction and
 * then typing "30k" would edit the user's MOST RECENT transaction instead of
 * the one they tapped.
 *
 * Keyed by internal user ID, mirroring ConfirmationManager.
 */
@Injectable()
export class PendingEditManager {
  private readonly pending = new Map<string, PendingEdit>();
  readonly EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  set(userId: string, transactionId: string, field: PendingEditField): PendingEdit {
    this.clear(userId);

    const timeoutHandle = setTimeout(() => {
      this.pending.delete(userId);
    }, this.EXPIRY_MS);

    const entry: PendingEdit = {
      userId,
      transactionId,
      field,
      createdAt: new Date(),
      timeoutHandle,
    };

    this.pending.set(userId, entry);
    return entry;
  }

  get(userId: string): PendingEdit | undefined {
    const entry = this.pending.get(userId);
    if (!entry) return undefined;

    if (this.isExpired(entry)) {
      this.clear(userId);
      return undefined;
    }

    return entry;
  }

  has(userId: string): boolean {
    return this.get(userId) !== undefined;
  }

  clear(userId: string): void {
    const entry = this.pending.get(userId);
    if (entry) {
      clearTimeout(entry.timeoutHandle);
      this.pending.delete(userId);
    }
  }

  private isExpired(entry: PendingEdit): boolean {
    return Date.now() - entry.createdAt.getTime() >= this.EXPIRY_MS;
  }
}
