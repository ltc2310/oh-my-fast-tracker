import { Injectable, Inject, Logger } from '@nestjs/common';
import { NotificationPreferenceRepository } from '../../domain/ports/NotificationPreferenceRepository';
import { TransactionRepository } from '../../domain/ports/TransactionRepository';
import { UserRepository } from '../../domain/ports/UserRepository';
import { NotificationSender } from '../../domain/ports/NotificationSender';

const DAILY_REMINDER_MESSAGE =
  '📝 Hôm nay bạn chưa ghi chi tiêu nào. Gõ nhanh khoản chi để không quên nhé! Ví dụ: \'ăn trưa 50k\'';

@Injectable()
export class SendDailyReminder {
  private readonly logger = new Logger(SendDailyReminder.name);

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

  async execute(): Promise<{ sent: number; skipped: number; errors: number }> {
    const eligibleUserIds = await this.prefRepo.findEligibleUserIds('dailyReminder');
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const userId of eligibleUserIds) {
      try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);

        const transactions = await this.txRepo.findByUserAndDateRange(userId, today, tomorrow);

        if (transactions.length === 0) {
          const user = await this.userRepo.findById(userId);
          if (user) {
            await this.notificationSender.sendMessage(
              user.channelUserId,
              DAILY_REMINDER_MESSAGE,
            );
            sent++;
          }
        } else {
          skipped++;
        }
      } catch (error: unknown) {
        errors++;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Daily reminder failed for user ${userId}: ${message}`);
      }
    }

    return { sent, skipped, errors };
  }
}
