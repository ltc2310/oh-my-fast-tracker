# Design Document: Proactive Notifications

## Overview

This feature adds proactive scheduled notifications to the Oh My Fast Tracker bot. It introduces a cron-based scheduler using `@nestjs/schedule` that triggers three types of automated messages for whitelisted, opted-in users:

1. **Daily Reminder** — A conditional reminder sent at 8 PM if the user hasn't logged any transaction that day.
2. **Weekly Digest** — A spending summary sent every Sunday covering the completed week (Mon–Sun), with top categories and week-over-week comparison.
3. **Monthly Summary** — An end-of-month spending report with full category breakdown, income, transaction count, and optional budget comparison.

Users control their notification preferences via chat commands (`bật/tắt nhắc nhở`, `bật/tắt báo cáo tuần`, `bật/tắt báo cáo tháng`). Preferences are persisted in a new `notification_preferences` table. All notifications reuse the existing `NotificationSender` port.

## Architecture

```mermaid
graph TD
    subgraph Infrastructure
        SCHED[NotificationScheduler<br/>@Cron decorators]
        REPO_PREF[SupabaseNotificationPreferenceRepository]
        SENDER[TelegramNotificationSender]
        BOT[BotService<br/>preference commands]
    end

    subgraph Application
        DR[SendDailyReminder]
        WD[SendWeeklyDigest]
        MS[SendMonthlySummary]
    end

    subgraph Domain
        PORT_PREF[NotificationPreferenceRepository port]
        PORT_TX[TransactionRepository port]
        PORT_USER[UserRepository port]
        PORT_NOTIFY[NotificationSender port]
        ENTITY_PREF[NotificationPreference entity]
    end

    SCHED --> DR
    SCHED --> WD
    SCHED --> MS
    DR --> PORT_PREF
    DR --> PORT_TX
    DR --> PORT_USER
    DR --> PORT_NOTIFY
    WD --> PORT_PREF
    WD --> PORT_TX
    WD --> PORT_USER
    WD --> PORT_NOTIFY
    MS --> PORT_PREF
    MS --> PORT_TX
    MS --> PORT_USER
    MS --> PORT_NOTIFY
    BOT --> PORT_PREF
    REPO_PREF -.implements.-> PORT_PREF
    SENDER -.implements.-> PORT_NOTIFY
```

### Data Flow

1. **Cron fires** → `NotificationScheduler` invokes the appropriate use case
2. **Use case resolves eligible users** → Queries `UserRepository` (whitelisted) + `NotificationPreferenceRepository` (opted-in)
3. **Use case generates message** → Queries `TransactionRepository` for relevant data, formats the message
4. **Use case sends** → Calls `NotificationSender.sendMessage()` for each eligible user
5. **Error handling** → Per-user try/catch ensures one failure doesn't block others

For preference management:
1. **User sends command** → `BotService` detects preference pattern
2. **BotService updates preference** → Calls `NotificationPreferenceRepository.upsert()`
3. **BotService confirms** → Sends confirmation message via `ChannelAdapter`

## Components and Interfaces

### Domain Layer

#### `NotificationPreference` Entity

```typescript
// src/domain/entities/NotificationPreference.ts
export interface NotificationPreference {
  id?: string;
  userId: string;            // references users.id
  dailyReminder: boolean;
  weeklyDigest: boolean;
  monthlySummary: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
```

#### `NotificationPreferenceRepository` Port

```typescript
// src/domain/ports/NotificationPreferenceRepository.ts
import { NotificationPreference } from '../entities/NotificationPreference';

export interface NotificationPreferenceRepository {
  /** Find preference for a user. Returns null if no record exists. */
  findByUserId(userId: string): Promise<NotificationPreference | null>;

  /** Create or update preference for a user (upsert on user_id). */
  upsert(userId: string, fields: Partial<Pick<NotificationPreference, 'dailyReminder' | 'weeklyDigest' | 'monthlySummary'>>): Promise<NotificationPreference>;

  /** Find all users with a specific notification type enabled.
   *  Returns user IDs (joined with users table where access_status = 'whitelisted').
   */
  findEligibleUserIds(notificationType: 'dailyReminder' | 'weeklyDigest' | 'monthlySummary'): Promise<string[]>;

  /** Create default preference (all enabled) for a user. */
  createDefault(userId: string): Promise<NotificationPreference>;
}
```

### Application Layer

#### `SendDailyReminder` Use Case

```typescript
// src/application/usecases/SendDailyReminder.ts
@Injectable()
export class SendDailyReminder {
  constructor(
    @Inject('NotificationPreferenceRepository') private prefRepo: NotificationPreferenceRepository,
    @Inject('TransactionRepository') private txRepo: TransactionRepository,
    @Inject('UserRepository') private userRepo: UserRepository,
    @Inject('NotificationSender') private notificationSender: NotificationSender,
  ) {}

  async execute(): Promise<{ sent: number; skipped: number; errors: number }> {
    const eligibleUserIds = await this.prefRepo.findEligibleUserIds('dailyReminder');
    let sent = 0, skipped = 0, errors = 0;

    for (const userId of eligibleUserIds) {
      try {
        const today = getStartOfDay(); // server timezone
        const tomorrow = getEndOfDay();
        const transactions = await this.txRepo.findByUserAndDateRange(userId, today, tomorrow);

        if (transactions.length === 0) {
          const user = await this.userRepo.findById(userId);
          if (user) {
            await this.notificationSender.sendMessage(
              user.channelUserId,
              DAILY_REMINDER_MESSAGE
            );
            sent++;
          }
        } else {
          skipped++;
        }
      } catch (error) {
        errors++;
        this.logger.error(`Daily reminder failed for user ${userId}`, error);
      }
    }

    return { sent, skipped, errors };
  }
}
```

#### `SendWeeklyDigest` Use Case

```typescript
// src/application/usecases/SendWeeklyDigest.ts
@Injectable()
export class SendWeeklyDigest {
  constructor(
    @Inject('NotificationPreferenceRepository') private prefRepo: NotificationPreferenceRepository,
    @Inject('TransactionRepository') private txRepo: TransactionRepository,
    @Inject('UserRepository') private userRepo: UserRepository,
    @Inject('NotificationSender') private notificationSender: NotificationSender,
  ) {}

  async execute(): Promise<{ sent: number; errors: number }> {
    const eligibleUserIds = await this.prefRepo.findEligibleUserIds('weeklyDigest');
    let sent = 0, errors = 0;

    const { currentWeekStart, currentWeekEnd, prevWeekStart, prevWeekEnd } = getWeekRanges();

    for (const userId of eligibleUserIds) {
      try {
        const currentTxs = await this.txRepo.findByUserAndDateRange(userId, currentWeekStart, currentWeekEnd);
        const prevTxs = await this.txRepo.findByUserAndDateRange(userId, prevWeekStart, prevWeekEnd);

        const message = this.formatDigest(currentTxs, prevTxs);
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

  private formatDigest(currentTxs: Transaction[], prevTxs: Transaction[]): string {
    // ... computes total, top 3 categories, week-over-week comparison
  }
}
```

#### `SendMonthlySummary` Use Case

```typescript
// src/application/usecases/SendMonthlySummary.ts
@Injectable()
export class SendMonthlySummary {
  constructor(
    @Inject('NotificationPreferenceRepository') private prefRepo: NotificationPreferenceRepository,
    @Inject('TransactionRepository') private txRepo: TransactionRepository,
    @Inject('UserRepository') private userRepo: UserRepository,
    @Inject('NotificationSender') private notificationSender: NotificationSender,
    // Optional: budget repository if budget-limit-alerts is implemented
  ) {}

  async execute(): Promise<{ sent: number; errors: number }> {
    const eligibleUserIds = await this.prefRepo.findEligibleUserIds('monthlySummary');
    let sent = 0, errors = 0;

    const { monthStart, monthEnd } = getCompletedMonthRange();

    for (const userId of eligibleUserIds) {
      try {
        const txs = await this.txRepo.findByUserAndDateRange(userId, monthStart, monthEnd);
        const message = this.formatSummary(txs, userId);
        const user = await this.userRepo.findById(userId);
        if (user) {
          await this.notificationSender.sendMessage(user.channelUserId, message);
          sent++;
        }
      } catch (error) {
        errors++;
        this.logger.error(`Monthly summary failed for user ${userId}`, error);
      }
    }

    return { sent, errors };
  }
}
```

#### `NotificationScheduler` Service

```typescript
// src/application/services/NotificationScheduler.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

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
    const result = await this.sendDailyReminder.execute();
    this.logger.log(`Daily reminder: sent=${result.sent}, skipped=${result.skipped}, errors=${result.errors}`);
  }

  @Cron(process.env.WEEKLY_DIGEST_CRON ?? '0 20 * * 0')
  async handleWeeklyDigest(): Promise<void> {
    this.logger.log('Weekly digest cron fired');
    const result = await this.sendWeeklyDigest.execute();
    this.logger.log(`Weekly digest: sent=${result.sent}, errors=${result.errors}`);
  }

  @Cron(process.env.MONTHLY_SUMMARY_CRON ?? '0 20 L * *')
  async handleMonthlySummary(): Promise<void> {
    this.logger.log('Monthly summary cron fired');
    const result = await this.sendMonthlySummary.execute();
    this.logger.log(`Monthly summary: sent=${result.sent}, errors=${result.errors}`);
  }
}
```

### Infrastructure Layer

#### `SupabaseNotificationPreferenceRepository`

```typescript
// src/infrastructure/repositories/SupabaseNotificationPreferenceRepository.ts
@Injectable()
export class SupabaseNotificationPreferenceRepository implements NotificationPreferenceRepository {
  private readonly client: SupabaseClient;

  constructor(@Inject(supabaseConfig.KEY) config: ConfigType<typeof supabaseConfig>) {
    this.client = createClient(config.url, config.key);
  }

  async findByUserId(userId: string): Promise<NotificationPreference | null> {
    const { data, error } = await this.client
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to find preference: ${error.message}`);
    return data ? this.toEntity(data) : null;
  }

  async upsert(userId: string, fields: Partial<Pick<NotificationPreference, 'dailyReminder' | 'weeklyDigest' | 'monthlySummary'>>): Promise<NotificationPreference> {
    const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
    if (fields.dailyReminder !== undefined) row.daily_reminder = fields.dailyReminder;
    if (fields.weeklyDigest !== undefined) row.weekly_digest = fields.weeklyDigest;
    if (fields.monthlySummary !== undefined) row.monthly_summary = fields.monthlySummary;

    const { data, error } = await this.client
      .from('notification_preferences')
      .upsert(row, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw new Error(`Failed to upsert preference: ${error.message}`);
    return this.toEntity(data);
  }

  async findEligibleUserIds(notificationType: 'dailyReminder' | 'weeklyDigest' | 'monthlySummary'): Promise<string[]> {
    // Map camelCase to column name
    const columnMap = { dailyReminder: 'daily_reminder', weeklyDigest: 'weekly_digest', monthlySummary: 'monthly_summary' };
    const column = columnMap[notificationType];

    // Query: whitelisted users who either have preference enabled OR have no preference record (default opt-in)
    const { data, error } = await this.client.rpc('get_eligible_notification_users', {
      notification_column: column,
    });

    if (error) throw new Error(`Failed to find eligible users: ${error.message}`);
    return (data ?? []).map((row: { id: string }) => row.id);
  }

  async createDefault(userId: string): Promise<NotificationPreference> {
    return this.upsert(userId, { dailyReminder: true, weeklyDigest: true, monthlySummary: true });
  }
}
```

#### Notification Config

```typescript
// Added to src/infrastructure/config/app.config.ts
export const notificationConfig = registerAs('notification', () => ({
  dailyReminderCron: process.env.DAILY_REMINDER_CRON ?? '0 20 * * *',
  weeklyDigestCron: process.env.WEEKLY_DIGEST_CRON ?? '0 20 * * 0',
  monthlySummaryCron: process.env.MONTHLY_SUMMARY_CRON ?? '0 20 L * *',
}));
```

#### BotService Preference Command Handling

New regex patterns and handler in `BotService`:

```typescript
// Notification preference patterns
const NOTIFICATION_ENABLE_DAILY = /^(bật\s*(nhắc\s*nhở|thông\s*báo\s*hàng\s*ngày))$/i;
const NOTIFICATION_DISABLE_DAILY = /^(tắt\s*(nhắc\s*nhở|thông\s*báo\s*hàng\s*ngày))$/i;
const NOTIFICATION_ENABLE_WEEKLY = /^bật\s*báo\s*cáo\s*tuần$/i;
const NOTIFICATION_DISABLE_WEEKLY = /^tắt\s*báo\s*cáo\s*tuần$/i;
const NOTIFICATION_ENABLE_MONTHLY = /^bật\s*báo\s*cáo\s*tháng$/i;
const NOTIFICATION_DISABLE_MONTHLY = /^tắt\s*báo\s*cáo\s*tháng$/i;
const NOTIFICATION_STATUS = /^(xem\s*thông\s*báo|cài\s*đặt\s*thông\s*báo)$/i;
```

These are checked after the access control gate and before other message routing in the `onMessage` handler.

## Data Models

### `notification_preferences` Table

```sql
-- sql/004-notification-preferences.sql

CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  daily_reminder boolean NOT NULL DEFAULT true,
  weekly_digest boolean NOT NULL DEFAULT true,
  monthly_summary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_preferences_user_id UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id
  ON notification_preferences(user_id);

-- Backfill: create default preferences for existing whitelisted users
INSERT INTO notification_preferences (user_id, daily_reminder, weekly_digest, monthly_summary)
SELECT id, true, true, true
FROM users
WHERE access_status = 'whitelisted'
  AND id NOT IN (SELECT user_id FROM notification_preferences)
ON CONFLICT (user_id) DO NOTHING;
```

### Eligible User Query (RPC or inline)

```sql
-- Database function to find eligible users for a notification type
-- Handles the "no preference record = all enabled" default
CREATE OR REPLACE FUNCTION get_eligible_notification_users(notification_column text)
RETURNS TABLE(id uuid, channel_user_id text) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.channel_user_id
  FROM users u
  LEFT JOIN notification_preferences np ON np.user_id = u.id
  WHERE u.access_status = 'whitelisted'
    AND (
      np.user_id IS NULL  -- no preference record = default all enabled
      OR (
        CASE notification_column
          WHEN 'daily_reminder' THEN np.daily_reminder
          WHEN 'weekly_digest' THEN np.weekly_digest
          WHEN 'monthly_summary' THEN np.monthly_summary
        END
      ) = true
    );
END;
$$ LANGUAGE plpgsql;
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DAILY_REMINDER_CRON` | `0 20 * * *` | Cron expression for daily reminder (8 PM daily) |
| `WEEKLY_DIGEST_CRON` | `0 20 * * 0` | Cron expression for weekly digest (8 PM Sunday) |
| `MONTHLY_SUMMARY_CRON` | `0 20 L * *` | Cron expression for monthly summary (8 PM last day of month) |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Error Isolation

*For any* notification job (daily/weekly/monthly) processing a list of N users, if delivery to user K fails with an error (0 ≤ K < N), all other users in the list shall still be processed and receive their notifications.

**Validates: Requirements 1.8, 2.6, 3.7, 4.9**

### Property 2: Daily Reminder Conditional

*For any* whitelisted user with daily_reminder enabled, the daily reminder is sent if and only if the user has zero transactions with `spent_at` on the current calendar date. Conversely, for any user with one or more transactions today, no reminder is sent regardless of preference state.

**Validates: Requirements 2.2, 2.3**

### Property 3: Eligible User Resolution

*For any* user and notification type T ∈ {dailyReminder, weeklyDigest, monthlySummary}, the user is eligible to receive notification T if and only if their `access_status` is `'whitelisted'` AND either (a) their preference record has T set to `true`, or (b) they have no preference record at all (default opt-in).

**Validates: Requirements 2.5, 3.6, 4.7, 7.1, 7.2, 7.3, 7.4, 7.5**

### Property 4: Week Date Range Correctness

*For any* reference date D (the Sunday when the weekly digest fires), the computed "current week" range shall always start at Monday 00:00:00 and end at Sunday 23:59:59 of the same ISO week containing D, and the "previous week" range shall cover the preceding Monday 00:00:00 to Sunday 23:59:59.

**Validates: Requirements 3.1**

### Property 5: Weekly Digest Content Completeness

*For any* non-empty set of expense transactions within a week, the generated digest message shall contain: (1) the total expense amount, (2) up to 3 spending categories sorted by total descending, and (3) a week-over-week comparison line (when previous week has transactions).

**Validates: Requirements 3.2**

### Property 6: Week-over-Week Comparison Formatting

*For any* pair (currentWeekTotal, previousWeekTotal) where previousWeekTotal > 0: if currentWeekTotal > previousWeekTotal, the message contains "📈 Tăng X%" with X = round((current - previous) / previous × 100); if currentWeekTotal ≤ previousWeekTotal, the message contains "📉 Giảm X%" with X = round((previous - current) / previous × 100).

**Validates: Requirements 3.3, 3.4**

### Property 7: Month Date Range Correctness

*For any* reference date D (the last day of a month when the monthly summary fires), the computed month range shall cover the 1st day of that month at 00:00:00 through the last day at 23:59:59.

**Validates: Requirements 4.1**

### Property 8: Monthly Summary Content Completeness

*For any* non-empty set of transactions within a month, the generated summary message shall contain: (1) total expenses (sum of positive amounts), (2) total income (sum of absolute negative amounts, if any), (3) category breakdown sorted by amount descending, and (4) the total number of transactions.

**Validates: Requirements 4.2**

### Property 9: Budget Status Formatting

*For any* pair (categorySpending, budgetLimit) where budgetLimit > 0: if categorySpending > budgetLimit, the message marks the category with "⚠️ Vượt X₫" where X = categorySpending − budgetLimit formatted in VND; if categorySpending ≤ budgetLimit, the message marks it with "✅ Còn X₫" where X = budgetLimit − categorySpending formatted in VND.

**Validates: Requirements 4.4, 4.5**

### Property 10: Default Opt-In for Missing Preferences

*For any* whitelisted user who has no record in the notification_preferences table, the system shall treat them as having all three notification types (dailyReminder, weeklyDigest, monthlySummary) enabled, making them eligible for all notification jobs.

**Validates: Requirements 7.5**

## Error Handling

| Scenario | Behavior |
|----------|----------|
| NotificationSender fails for a user | Log error with user ID and error details, increment error counter, continue processing remaining users |
| TransactionRepository query fails for a user | Log error, skip that user, continue with next |
| UserRepository.findById returns null | Skip user (orphan preference record), log warning |
| NotificationPreferenceRepository unavailable | Log error at scheduler level, abort the entire job (cannot determine eligibility) |
| Database migration fails | Standard migration error — application won't start with inconsistent schema |
| Invalid cron expression in env var | `@nestjs/schedule` will throw at bootstrap — application fails to start with clear error |

### Logging Strategy

- Each cron trigger logs start time and notification type
- Each job completion logs `sent`, `skipped`, and `errors` counts
- Individual user failures log the user ID and error stack
- Use NestJS `Logger` with context set to the service name for structured log output

## Testing Strategy

### Property-Based Tests (using `fast-check`)

The project already has `fast-check` as a dev dependency. Property-based tests target the pure logic functions:

- **Week/month date range calculation** — Generate random dates, verify range boundaries
- **Weekly digest formatting** — Generate random transaction sets, verify message completeness and comparison logic
- **Monthly summary formatting** — Generate random transaction sets, verify all required sections
- **Budget status formatting** — Generate random (spending, limit) pairs, verify correct marker and amount
- **Eligible user resolution** — Generate random user states and preferences, verify eligibility logic
- **Error isolation** — Generate random user lists with random failure indices, verify all non-failing users are processed
- **Daily reminder conditional** — Generate random (user, transactions) pairs, verify send/skip logic

Each property test runs minimum 100 iterations and is tagged with:
```
// Feature: proactive-notifications, Property N: [property text]
```

### Unit Tests (example-based)

- Command parsing: verify each `bật/tắt` pattern triggers correct preference update
- Message constants: verify exact message strings for daily reminder, zero-transaction cases
- Preference status display: verify formatted output for various preference combinations
- `NotificationScheduler` wiring: verify each cron handler calls the correct use case

### Integration Tests

- `SupabaseNotificationPreferenceRepository`: CRUD operations, upsert behavior, eligible user query
- `NotificationScheduler` cron registration: verify decorators are applied
- End-to-end preference flow: send command → preference updated → notification sent/skipped

### Test File Locations

```
test/
  notifications/
    send-daily-reminder.spec.ts
    send-weekly-digest.spec.ts
    send-monthly-summary.spec.ts
    notification-scheduler.spec.ts
    notification-preference-commands.spec.ts
  notifications/
    weekly-digest-format.property.spec.ts
    monthly-summary-format.property.spec.ts
    eligible-user-resolution.property.spec.ts
    date-range-calculation.property.spec.ts
    error-isolation.property.spec.ts
```
