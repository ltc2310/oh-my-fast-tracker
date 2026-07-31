import { NotificationScheduler } from '../../src/application/services/NotificationScheduler';
import { SendDailyReminder } from '../../src/application/usecases/SendDailyReminder';
import { SendWeeklyDigest } from '../../src/application/usecases/SendWeeklyDigest';
import { SendMonthlySummary } from '../../src/application/usecases/SendMonthlySummary';

describe('NotificationScheduler', () => {
  let scheduler: NotificationScheduler;
  let sendDailyReminder: jest.Mocked<Pick<SendDailyReminder, 'execute'>>;
  let sendWeeklyDigest: jest.Mocked<Pick<SendWeeklyDigest, 'execute'>>;
  let sendMonthlySummary: jest.Mocked<Pick<SendMonthlySummary, 'execute'>>;

  beforeEach(() => {
    sendDailyReminder = { execute: jest.fn().mockResolvedValue({ sent: 1, skipped: 0, errors: 0 }) };
    sendWeeklyDigest = { execute: jest.fn().mockResolvedValue({ sent: 1, errors: 0 }) };
    sendMonthlySummary = { execute: jest.fn().mockResolvedValue({ sent: 1, errors: 0 }) };

    scheduler = new NotificationScheduler(
      sendDailyReminder as unknown as SendDailyReminder,
      sendWeeklyDigest as unknown as SendWeeklyDigest,
      sendMonthlySummary as unknown as SendMonthlySummary,
    );
  });

  describe('handleDailyReminder', () => {
    it('calls sendDailyReminder.execute()', async () => {
      await scheduler.handleDailyReminder();

      expect(sendDailyReminder.execute).toHaveBeenCalledTimes(1);
    });

    it('does not throw when execute() rejects', async () => {
      sendDailyReminder.execute.mockRejectedValue(new Error('DB connection lost'));

      await expect(scheduler.handleDailyReminder()).resolves.toBeUndefined();
    });
  });

  describe('handleWeeklyDigest', () => {
    it('calls sendWeeklyDigest.execute()', async () => {
      await scheduler.handleWeeklyDigest();

      expect(sendWeeklyDigest.execute).toHaveBeenCalledTimes(1);
    });

    it('does not throw when execute() rejects', async () => {
      sendWeeklyDigest.execute.mockRejectedValue(new Error('Timeout'));

      await expect(scheduler.handleWeeklyDigest()).resolves.toBeUndefined();
    });
  });

  describe('handleMonthlySummary', () => {
    it('calls sendMonthlySummary.execute()', async () => {
      await scheduler.handleMonthlySummary();

      expect(sendMonthlySummary.execute).toHaveBeenCalledTimes(1);
    });

    it('does not throw when execute() rejects', async () => {
      sendMonthlySummary.execute.mockRejectedValue(new Error('Network error'));

      await expect(scheduler.handleMonthlySummary()).resolves.toBeUndefined();
    });
  });
});
