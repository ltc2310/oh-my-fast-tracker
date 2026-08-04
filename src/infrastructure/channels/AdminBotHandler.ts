import { Injectable, Inject, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { ChannelAdapter } from "../../domain/ports/ChannelAdapter";
import { UserRepository } from "../../domain/ports/UserRepository";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { ApproveUser } from "../../application/usecases/ApproveUser";
import { BlockUser } from "../../application/usecases/BlockUser";
import { adminConfig } from "../config/app.config";
import { User } from "../../domain/entities/User";

/**
 * Handles admin commands sent via Telegram chat.
 * Only users whose chat ID is in ADMIN_CHAT_IDS can use these commands.
 *
 * Supported commands:
 *   /pending           — list pending users
 *   /approve <id>      — approve a specific user
 *   /approve all       — approve all pending users
 *   /block <id>        — block a specific user
 *   /stats             — system statistics
 */
@Injectable()
export class AdminBotHandler {
  private readonly logger = new Logger(AdminBotHandler.name);

  constructor(
    @Inject(adminConfig.KEY)
    private readonly config: ConfigType<typeof adminConfig>,
    @Inject("ChannelAdapter")
    private readonly channelAdapter: ChannelAdapter,
    @Inject("UserRepository")
    private readonly userRepository: UserRepository,
    @Inject("TransactionRepository")
    private readonly transactionRepository: TransactionRepository,
    private readonly approveUser: ApproveUser,
    private readonly blockUser: BlockUser,
  ) {}

  /**
   * Check whether a Telegram chat ID belongs to an admin.
   */
  isAdmin(channelUserId: string): boolean {
    return this.config.chatIds.includes(channelUserId);
  }

  /**
   * Check if the text is an admin command (starts with /pending, /approve, /block, /stats).
   */
  isAdminCommand(text: string): boolean {
    return /^\/(pending|approve|block|stats)\b/i.test(text.trim());
  }

  /**
   * Route and handle an admin command. Returns true if handled.
   */
  async handle(channelUserId: string, text: string): Promise<boolean> {
    const trimmed = text.trim();

    if (/^\/pending$/i.test(trimmed)) {
      await this.handlePending(channelUserId);
      return true;
    }

    const approveMatch = trimmed.match(/^\/approve\s+(.+)$/i);
    if (approveMatch) {
      await this.handleApprove(channelUserId, approveMatch[1].trim());
      return true;
    }

    const blockMatch = trimmed.match(/^\/block\s+(.+)$/i);
    if (blockMatch) {
      await this.handleBlock(channelUserId, blockMatch[1].trim());
      return true;
    }

    if (/^\/stats$/i.test(trimmed)) {
      await this.handleStats(channelUserId);
      return true;
    }

    return false;
  }

  /**
   * Notify all admin chat IDs about a new user registration.
   */
  async notifyNewUser(user: User): Promise<void> {
    if (this.config.chatIds.length === 0) return;

    const username = user.channelUsername ? `@${user.channelUsername}` : "(no username)";
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")} ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    const msg = [
      `🆕 User mới: ${username}`,
      `Chat ID: ${user.channelUserId}`,
      `Đăng ký lúc ${timeStr}`,
      "",
      `Duyệt: /approve ${user.id}`,
      `Block: /block ${user.id}`,
    ].join("\n");

    for (const adminId of this.config.chatIds) {
      try {
        await this.channelAdapter.sendText(adminId, msg);
      } catch (error) {
        this.logger.warn(`Failed to notify admin ${adminId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async handlePending(channelUserId: string): Promise<void> {
    const pendingUsers = await this.userRepository.findByStatus("pending");

    if (pendingUsers.length === 0) {
      await this.channelAdapter.sendText(channelUserId, "Không có user nào đang chờ duyệt.");
      return;
    }

    const lines: string[] = [`👥 Pending users (${pendingUsers.length}):\n`];
    for (let i = 0; i < pendingUsers.length; i++) {
      const u = pendingUsers[i];
      const username = u.channelUsername ? `@${u.channelUsername}` : "(no username)";
      const date = u.createdAt
        ? `${u.createdAt.getDate()}/${u.createdAt.getMonth()! + 1}/${u.createdAt.getFullYear()}`
        : "";
      lines.push(`${i + 1}. ${username} (ID: ${u.id}) — ${date}`);
    }
    lines.push("");
    lines.push("Duyệt: /approve <id> hoặc /approve all");

    await this.channelAdapter.sendText(channelUserId, lines.join("\n"));
  }

  private async handleApprove(channelUserId: string, target: string): Promise<void> {
    if (target.toLowerCase() === "all") {
      const pendingUsers = await this.userRepository.findByStatus("pending");
      if (pendingUsers.length === 0) {
        await this.channelAdapter.sendText(channelUserId, "Không có user nào đang chờ duyệt.");
        return;
      }

      const approved: string[] = [];
      for (const user of pendingUsers) {
        try {
          await this.approveUser.execute(user.id!);
          const label = user.channelUsername ? `@${user.channelUsername}` : `(${user.channelUserId})`;
          approved.push(label);
        } catch (error) {
          this.logger.error(`Failed to approve user ${user.id}`, error);
        }
      }

      await this.channelAdapter.sendText(
        channelUserId,
        `✅ Đã duyệt ${approved.length} users: ${approved.join(", ")}`,
      );
      return;
    }

    // Approve single user by ID
    try {
      const user = await this.approveUser.execute(target);
      const label = user.channelUsername ? `@${user.channelUsername}` : `(${user.channelUserId})`;
      await this.channelAdapter.sendText(
        channelUserId,
        `✅ Đã duyệt ${label}. User sẽ nhận thông báo kích hoạt.`,
      );
    } catch (error) {
      await this.channelAdapter.sendText(
        channelUserId,
        `❌ Không tìm thấy user với ID: ${target}`,
      );
    }
  }

  private async handleBlock(channelUserId: string, userId: string): Promise<void> {
    try {
      const user = await this.blockUser.execute(userId);
      const label = user.channelUsername ? `@${user.channelUsername}` : `(${user.channelUserId})`;
      await this.channelAdapter.sendText(channelUserId, `🚫 Đã block ${label}.`);
    } catch (error) {
      await this.channelAdapter.sendText(
        channelUserId,
        `❌ Không tìm thấy user với ID: ${userId}`,
      );
    }
  }

  private async handleStats(channelUserId: string): Promise<void> {
    const [whitelisted, pending, blocked] = await Promise.all([
      this.userRepository.findByStatus("whitelisted"),
      this.userRepository.findByStatus("pending"),
      this.userRepository.findByStatus("blocked"),
    ]);

    const totalUsers = whitelisted.length + pending.length + blocked.length;

    // Today's transactions count
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

    // Count transactions for all users today/this month (use distinct user IDs)
    let todayCount = 0;
    let monthCount = 0;

    for (const user of whitelisted) {
      if (!user.id) continue;
      const todayTxs = await this.transactionRepository.findByUserAndDateRange(user.id, todayStart, now);
      const monthTxs = await this.transactionRepository.findByUserAndDateRange(user.id, monthStart, now);
      todayCount += todayTxs.length;
      monthCount += monthTxs.length;
    }

    const reply = [
      "📊 Thống kê hệ thống:",
      "",
      `👥 Tổng users: ${totalUsers} (whitelisted: ${whitelisted.length}, pending: ${pending.length}, blocked: ${blocked.length})`,
      `📝 Giao dịch hôm nay: ${todayCount}`,
      `📅 Giao dịch tháng này: ${monthCount}`,
    ].join("\n");

    await this.channelAdapter.sendText(channelUserId, reply);
  }
}
