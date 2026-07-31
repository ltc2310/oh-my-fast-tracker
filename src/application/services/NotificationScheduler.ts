import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SendDailyReminder } from '../usecases/SendDailyReminder';
import { SendWeeklyDigest } from '../usecases/SendWeeklyDigest';
import { SendMonthlySummary } from '../usecases/SendMonthlySummary';

/**
 * Check if today is the last day of the current month.
 * The `cron` library doesn't support `L`, so we fire on days 28-31
 * and guard with this check.
 */
function isLastDayOfMonth(): boolean {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return tomorrow.getDate() === 1;
}

@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(
    private readonly sendDailyReminder: SendDailyReminder,
    private readonly sendWeeklyDigest: SendWeeklyDigest,
    private readonly sendMonthlySummary: SendMonthlySummary,
  ) {}

  @Cron(process.env.DAILY_REMINDER_CRON ?? '0 20 * * *')
  async handleDailyReminder(): Promise<void> {
    this.logger.log('Daily reminder cron fired');
    try {
      const result = await this.sendDailyReminder.execute();
      this.logger.log(
        `Daily reminder completed: sent=${result.sent}, skipped=${result.skipped}, errors=${result.errors}`,
      );
    } catch (error) {
      this.logger.error(
        'Daily reminder job failed',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  @Cron(process.env.WEEKLY_DIGEST_CRON ?? '0 20 * * 0')
  async handleWeeklyDigest(): Promise<void> {
    this.logger.log('Weekly digest cron fired');
    try {
      const result = await this.sendWeeklyDigest.execute();
      this.logger.log(
        `Weekly digest completed: sent=${result.sent}, errors=${result.errors}`,
      );
    } catch (error) {
      this.logger.error(
        'Weekly digest job failed',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  @Cron(process.env.MONTHLY_SUMMARY_CRON ?? '0 20 28-31 * *')
  async handleMonthlySummary(): Promise<void> {
    if (!isLastDayOfMonth()) {
      return;
    }

    this.logger.log('Monthly summary cron fired');
    try {
      const result = await this.sendMonthlySummary.execute();
      this.logger.log(
        `Monthly summary completed: sent=${result.sent}, errors=${result.errors}`,
      );
    } catch (error) {
      this.logger.error(
        'Monthly summary job failed',
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
