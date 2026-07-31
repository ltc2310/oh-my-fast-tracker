import { Injectable, Inject, Logger } from '@nestjs/common';
import { TransactionRepository } from '../../domain/ports/TransactionRepository';
import { UserRepository } from '../../domain/ports/UserRepository';
import { NotificationPreferenceRepository } from '../../domain/ports/NotificationPreferenceRepository';
import { NotificationSender } from '../../domain/ports/NotificationSender';
import { Transaction } from '../../domain/entities/Transaction';
import { formatVND } from '../services/vnd-formatter';

export const ZERO_TRANSACTIONS_MESSAGE =
  '📅 Tháng vừa qua bạn chưa ghi khoản chi tiêu nào. Tháng mới rồi, hãy bắt đầu theo dõi chi tiêu nhé!';

/**
 * Compute the completed month range: 1st day 00:00:00 to last day 23:59:59
 * of the month preceding the given reference date.
 */
export function getCompletedMonthRange(referenceDate: Date = new Date()): {
  monthStart: Date;
  monthEnd: Date;
} {
  // The completed month is the month of the reference date's previous month
  // unless we're on the last day of the current month (then it's this month).
  // Since the cron fires on the last day of the month, we use the reference date's month.
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  return { monthStart, monthEnd };
}

export interface BudgetLimit {
  category: string;
  limit: number;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
}

/**
 * Format the monthly summary message from transactions and optional budget data.
 */
export function formatSummary(
  transactions: Transaction[],
  budgetLimits?: BudgetLimit[],
): string {
  if (transactions.length === 0) {
    return ZERO_TRANSACTIONS_MESSAGE;
  }

  let totalExpenses = 0;
  let totalIncome = 0;
  const categoryTotals = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.amount > 0) {
      // Expense
      totalExpenses += tx.amount;
      categoryTotals.set(
        tx.category,
        (categoryTotals.get(tx.category) ?? 0) + tx.amount,
      );
    } else {
      // Income (stored as negative)
      totalIncome += Math.abs(tx.amount);
    }
  }

  // Sort categories by total descending
  const sortedCategories: CategoryBreakdown[] = Array.from(
    categoryTotals.entries(),
  )
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  // Build message
  const lines: string[] = [];
  lines.push('📊 Tổng kết tháng:');
  lines.push('');
  lines.push(`💸 Tổng chi: ${formatVND(totalExpenses)}`);

  if (totalIncome > 0) {
    lines.push(`💰 Tổng thu: ${formatVND(totalIncome)}`);
  }

  lines.push(`📝 Số giao dịch: ${transactions.length}`);
  lines.push('');
  lines.push('📋 Chi tiết theo danh mục:');

  for (const { category, total } of sortedCategories) {
    lines.push(`  • ${category}: ${formatVND(total)}`);
  }

  // Budget comparison section (only if budget data is available)
  if (budgetLimits && budgetLimits.length > 0) {
    lines.push('');
    lines.push('💰 So sánh ngân sách:');

    for (const { category, limit } of budgetLimits) {
      const spent = categoryTotals.get(category) ?? 0;
      if (spent > limit) {
        const excess = spent - limit;
        lines.push(`  • ${category}: ⚠️ Vượt ${formatVND(excess)}`);
      } else {
        const remaining = limit - spent;
        lines.push(`  • ${category}: ✅ Còn ${formatVND(remaining)}`);
      }
    }
  }

  return lines.join('\n');
}

@Injectable()
export class SendMonthlySummary {
  private readonly logger = new Logger(SendMonthlySummary.name);

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
    const eligibleUserIds =
      await this.prefRepo.findEligibleUserIds('monthlySummary');
    let sent = 0;
    let errors = 0;

    const { monthStart, monthEnd } = getCompletedMonthRange();

    for (const userId of eligibleUserIds) {
      try {
        const transactions = await this.txRepo.findByUserAndDateRange(
          userId,
          monthStart,
          monthEnd,
        );

        const message = formatSummary(transactions);

        const user = await this.userRepo.findById(userId);
        if (user) {
          await this.notificationSender.sendMessage(
            user.channelUserId,
            message,
          );
          sent++;
        }
      } catch (error) {
        errors++;
        this.logger.error(
          `Monthly summary failed for user ${userId}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }

    return { sent, errors };
  }
}
