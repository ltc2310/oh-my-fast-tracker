import { Injectable, Inject, Logger } from '@nestjs/common';
import { Transaction } from '../../domain/entities/Transaction';
import { NotificationPreferenceRepository } from '../../domain/ports/NotificationPreferenceRepository';
import { NotificationSender } from '../../domain/ports/NotificationSender';
import { TransactionRepository } from '../../domain/ports/TransactionRepository';
import { UserRepository } from '../../domain/ports/UserRepository';
import { formatVND } from '../services/vnd-formatter';

export interface WeekRanges {
  currentWeekStart: Date;
  currentWeekEnd: Date;
  prevWeekStart: Date;
  prevWeekEnd: Date;
}

/**
 * Computes the current (completed) week range (Mon 00:00:00 – Sun 23:59:59)
 * and the previous week range, relative to the given reference date.
 *
 * The reference date is expected to be the Sunday when the digest fires.
 * "Current week" = the Mon–Sun containing the reference date.
 */
export function getWeekRanges(referenceDate: Date = new Date()): WeekRanges {
  const ref = new Date(referenceDate);

  // Find the Monday of the current week (ISO weeks start on Monday)
  // getDay(): 0=Sun, 1=Mon, ..., 6=Sat
  const day = ref.getDay();
  // Distance from Monday: Sun(0) → 6, Mon(1) → 0, Tue(2) → 1, ...
  const distFromMonday = day === 0 ? 6 : day - 1;

  const currentWeekStart = new Date(ref);
  currentWeekStart.setDate(ref.getDate() - distFromMonday);
  currentWeekStart.setHours(0, 0, 0, 0);

  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
  currentWeekEnd.setHours(23, 59, 59, 999);

  const prevWeekStart = new Date(currentWeekStart);
  prevWeekStart.setDate(currentWeekStart.getDate() - 7);

  const prevWeekEnd = new Date(currentWeekStart);
  prevWeekEnd.setDate(currentWeekStart.getDate() - 1);
  prevWeekEnd.setHours(23, 59, 59, 999);

  return { currentWeekStart, currentWeekEnd, prevWeekStart, prevWeekEnd };
}

/**
 * Formats the weekly digest message from current and previous week transactions.
 *
 * - Zero current-week transactions → special "no expense" message
 * - Non-zero current, zero previous → omit comparison line
 * - Non-zero both → include comparison line with percentage
 */
export function formatDigest(
  currentTxs: Transaction[],
  prevTxs: Transaction[],
): string {
  // Only count expenses (positive amounts)
  const currentExpenses = currentTxs.filter((t) => t.amount > 0);

  if (currentExpenses.length === 0) {
    return '📊 Tuần này bạn chưa ghi khoản chi tiêu nào. Hãy bắt đầu ghi lại chi tiêu để theo dõi tài chính nhé!';
  }

  const currentTotal = currentExpenses.reduce((sum, t) => sum + t.amount, 0);

  // Build top 3 categories by total descending
  const categoryTotals = new Map<string, number>();
  for (const t of currentExpenses) {
    categoryTotals.set(t.category, (categoryTotals.get(t.category) ?? 0) + t.amount);
  }
  const top3 = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const lines: string[] = [];
  lines.push('📊 Tổng kết chi tiêu tuần:');
  lines.push(`💰 Tổng chi: ${formatVND(currentTotal)}`);
  lines.push('');
  lines.push('🏷️ Top danh mục:');
  for (const [category, total] of top3) {
    lines.push(`  • ${category}: ${formatVND(total)}`);
  }

  // Week-over-week comparison
  const prevExpenses = prevTxs.filter((t) => t.amount > 0);
  const prevTotal = prevExpenses.reduce((sum, t) => sum + t.amount, 0);

  if (prevTotal > 0) {
    lines.push('');
    if (currentTotal > prevTotal) {
      const pct = Math.round(((currentTotal - prevTotal) / prevTotal) * 100);
      lines.push(`📈 Tăng ${pct}% so với tuần trước`);
    } else {
      const pct = Math.round(((prevTotal - currentTotal) / prevTotal) * 100);
      lines.push(`📉 Giảm ${pct}% so với tuần trước`);
    }
  }
  // If prevTotal === 0 (no previous week data), omit comparison line entirely

  return lines.join('\n');
}

@Injectable()
export class SendWeeklyDigest {
  private readonly logger = new Logger(SendWeeklyDigest.name);

  constructor(
    @Inject('NotificationPreferenceRepository')
    private readonly prefRepo: NotificationPreferenceRepository,
    @Inject('TransactionRepository')
    private readonly txRepo: TransactionRepository,
    @Inject('UserRepository')
    private readonly userRepo: UserRepository,
    @Inject('NotificationSender')
    private readonly notificationSender: NotificationSender,
  ) {}

  async execute(): Promise<{ sent: number; errors: number }> {
    const eligibleUserIds = await this.prefRepo.findEligibleUserIds('weeklyDigest');
    let sent = 0;
    let errors = 0;

    const { currentWeekStart, currentWeekEnd, prevWeekStart, prevWeekEnd } =
      getWeekRanges();

    for (const userId of eligibleUserIds) {
      try {
        const currentTxs = await this.txRepo.findByUserAndDateRange(
          userId,
          currentWeekStart,
          currentWeekEnd,
        );
        const prevTxs = await this.txRepo.findByUserAndDateRange(
          userId,
          prevWeekStart,
          prevWeekEnd,
        );

        const message = formatDigest(currentTxs, prevTxs);
        const user = await this.userRepo.findById(userId);
        if (user) {
          await this.notificationSender.sendMessage(user.channelUserId, message);
          sent++;
        }
      } catch (error) {
        errors++;
        this.logger.error(`Weekly digest failed for user ${userId}`, error);
      }
    }

    return { sent, errors };
  }
}
