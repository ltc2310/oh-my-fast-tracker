import { Injectable } from "@nestjs/common";
import { ParsedExpense } from "../../domain/ports/Parser";

export interface PendingConfirmation {
  userId: string;
  channelUserId: string;
  expenses: ParsedExpense[];
  source: "voice" | "photo";
  createdAt: Date;
  timeoutHandle: NodeJS.Timeout;
}

@Injectable()
export class ConfirmationManager {
  private readonly pending = new Map<string, PendingConfirmation>();
  readonly EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Create or replace a PendingConfirmation for the given user.
   * Clears any existing pending entry (including its timeout) before storing the new one.
   * Automatically expires after EXPIRY_MS.
   */
  set(
    userId: string,
    channelUserId: string,
    expenses: ParsedExpense[],
    source: "voice" | "photo",
  ): PendingConfirmation {
    // Clear existing entry if present
    this.clear(userId);

    const timeoutHandle = setTimeout(() => {
      this.pending.delete(userId);
    }, this.EXPIRY_MS);

    const entry: PendingConfirmation = {
      userId,
      channelUserId,
      expenses,
      source,
      createdAt: new Date(),
      timeoutHandle,
    };

    this.pending.set(userId, entry);
    return entry;
  }

  /**
   * Retrieve the PendingConfirmation for a user.
   * Performs a lazy expiry check — returns undefined if the entry has expired.
   */
  get(userId: string): PendingConfirmation | undefined {
    const entry = this.pending.get(userId);
    if (!entry) return undefined;

    if (this.isExpired(entry)) {
      this.clear(userId);
      return undefined;
    }

    return entry;
  }

  /**
   * Check whether a user has an active (non-expired) PendingConfirmation.
   */
  has(userId: string): boolean {
    return this.get(userId) !== undefined;
  }

  /**
   * Reverse lookup: find a pending confirmation by the channel user ID.
   * Needed when handling inline keyboard callbacks, which only carry the
   * channel-level user ID (e.g. Telegram chat ID), not the internal user ID.
   *
   * Returns undefined if no entry exists or the entry has expired.
   */
  findByChannelUserId(channelUserId: string): PendingConfirmation | undefined {
    for (const entry of this.pending.values()) {
      if (entry.channelUserId !== channelUserId) continue;

      if (this.isExpired(entry)) {
        this.clear(entry.userId);
        return undefined;
      }
      return entry;
    }
    return undefined;
  }

  /**
   * Remove the PendingConfirmation for a user and clear its timeout.
   */
  clear(userId: string): void {
    const entry = this.pending.get(userId);
    if (entry) {
      clearTimeout(entry.timeoutHandle);
      this.pending.delete(userId);
    }
  }

  private isExpired(entry: PendingConfirmation): boolean {
    return Date.now() - entry.createdAt.getTime() >= this.EXPIRY_MS;
  }
}
