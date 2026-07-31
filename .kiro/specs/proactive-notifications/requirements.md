# Requirements Document

## Introduction

This feature adds proactive scheduled notifications to the Oh My Fast Tracker bot. Using `@nestjs/schedule` with cron expressions, the system sends three types of automated messages to whitelisted users via Telegram: a conditional daily reminder (only if the user has not logged any transaction that day), a weekly digest summarizing the past week's spending, and a monthly summary with category breakdown and budget status. Users can opt-in or opt-out of each notification type independently.

## Glossary

- **Notification_Scheduler**: The NestJS service that executes cron-based scheduled tasks using `@nestjs/schedule` and triggers notification use cases
- **Daily_Reminder_Service**: The application use case responsible for checking each user's transaction activity for the current day and sending a reminder if no transaction has been recorded
- **Weekly_Digest_Service**: The application use case responsible for generating and sending a weekly spending summary to opted-in users
- **Monthly_Summary_Service**: The application use case responsible for generating and sending an end-of-month spending summary with category breakdown and budget comparison
- **Notification_Preference**: A per-user configuration record indicating which notification types the user has opted into or out of (daily_reminder, weekly_digest, monthly_summary)
- **Notification_Preference_Repository**: The port/interface for persisting and querying user notification preferences
- **Transaction_Repository**: The existing port for querying transaction data
- **User_Repository**: The existing port for querying user records and access status
- **NotificationSender**: The existing port for sending outbound messages to users via their messaging channel
- **Whitelisted_User**: A user whose Access_Status is `whitelisted` in User_Repository
- **Budget_Limit**: A per-category monthly spending cap configured via the budget-limit-alerts feature (if available)

## Requirements

### Requirement 1: Notification Scheduling Infrastructure

**User Story:** As a developer, I want a cron-based scheduling infrastructure using `@nestjs/schedule`, so that notification jobs execute automatically at configured times.

#### Acceptance Criteria

1. THE Notification_Scheduler SHALL register three cron jobs: daily_reminder, weekly_digest, and monthly_summary using `@nestjs/schedule` decorators
2. WHEN the daily_reminder cron fires, THE Notification_Scheduler SHALL invoke the Daily_Reminder_Service for all eligible users
3. WHEN the weekly_digest cron fires, THE Notification_Scheduler SHALL invoke the Weekly_Digest_Service for all eligible users
4. WHEN the monthly_summary cron fires, THE Notification_Scheduler SHALL invoke the Monthly_Summary_Service for all eligible users
5. THE Notification_Scheduler SHALL configure the daily_reminder cron expression via the `DAILY_REMINDER_CRON` environment variable, defaulting to `0 20 * * *` (8:00 PM daily, server timezone)
6. THE Notification_Scheduler SHALL configure the weekly_digest cron expression via the `WEEKLY_DIGEST_CRON` environment variable, defaulting to `0 20 * * 0` (8:00 PM every Sunday)
7. THE Notification_Scheduler SHALL configure the monthly_summary cron expression via the `MONTHLY_SUMMARY_CRON` environment variable, defaulting to `0 20 L * *` (8:00 PM on the last day of each month)
8. IF a notification job throws an error for a specific user, THEN THE Notification_Scheduler SHALL log the error and continue processing remaining users without halting the entire job

### Requirement 2: Daily Reminder (Conditional)

**User Story:** As a user, I want to receive a daily reminder to log my expenses if I haven't recorded anything today, so that I maintain a consistent tracking habit.

#### Acceptance Criteria

1. WHEN the daily_reminder job executes, THE Daily_Reminder_Service SHALL query Transaction_Repository for each eligible user to determine if any transaction exists with `spent_at` on the current calendar date (server timezone)
2. WHEN a Whitelisted_User has zero transactions for the current date AND the user has opted into daily_reminder notifications, THE Daily_Reminder_Service SHALL send a reminder message via NotificationSender to the user's Channel_User_ID
3. WHEN a Whitelisted_User has one or more transactions for the current date, THE Daily_Reminder_Service SHALL skip sending a reminder to that user
4. THE Daily_Reminder_Service SHALL send the message: "📝 Hôm nay bạn chưa ghi chi tiêu nào. Gõ nhanh khoản chi để không quên nhé! Ví dụ: 'ăn trưa 50k'"
5. THE Daily_Reminder_Service SHALL only process users whose Access_Status is `whitelisted` in User_Repository
6. IF NotificationSender fails to deliver the reminder to a specific user, THEN THE Daily_Reminder_Service SHALL log the failure and continue processing remaining users

### Requirement 3: Weekly Digest

**User Story:** As a user, I want to receive a weekly spending summary every Sunday, so that I can review my financial habits without manually requesting a report.

#### Acceptance Criteria

1. WHEN the weekly_digest job executes, THE Weekly_Digest_Service SHALL generate a spending summary for each eligible user covering the preceding 7 days (Monday 00:00:00 to Sunday 23:59:59 of the completed week)
2. THE Weekly_Digest_Service SHALL include in the digest message: total expenses for the week, top 3 spending categories with amounts, and a comparison with the previous week's total (percentage increase or decrease)
3. WHEN the current week's total expenses exceed the previous week's total, THE Weekly_Digest_Service SHALL include the text "📈 Tăng X% so với tuần trước" where X is the rounded percentage increase
4. WHEN the current week's total expenses are less than or equal to the previous week's total, THE Weekly_Digest_Service SHALL include the text "📉 Giảm X% so với tuần trước" where X is the rounded percentage decrease
5. WHEN a user has zero transactions for the current week, THE Weekly_Digest_Service SHALL send a message: "📊 Tuần này bạn chưa ghi khoản chi tiêu nào. Hãy bắt đầu ghi lại chi tiêu để theo dõi tài chính nhé!"
6. THE Weekly_Digest_Service SHALL only process users whose Access_Status is `whitelisted` AND who have opted into weekly_digest notifications
7. IF NotificationSender fails to deliver the digest to a specific user, THEN THE Weekly_Digest_Service SHALL log the failure and continue processing remaining users
8. WHEN a user has transactions in the current week but zero transactions in the previous week, THE Weekly_Digest_Service SHALL omit the week-over-week comparison line from the message

### Requirement 4: Monthly Summary

**User Story:** As a user, I want to receive a monthly spending summary at the end of each month, so that I can understand my overall spending patterns and budget adherence.

#### Acceptance Criteria

1. WHEN the monthly_summary job executes, THE Monthly_Summary_Service SHALL generate a spending summary for each eligible user covering the entire completed calendar month (first day 00:00:00 to last day 23:59:59)
2. THE Monthly_Summary_Service SHALL include in the summary message: total expenses for the month, total income for the month (if any), category breakdown showing each category and its total (sorted by amount descending), and the number of transactions recorded
3. WHEN Budget_Limit data is available for the user, THE Monthly_Summary_Service SHALL include a budget comparison section showing each category with a configured limit, the actual spending, and a status indicator (within budget or over budget)
4. WHEN a category's spending exceeds its Budget_Limit, THE Monthly_Summary_Service SHALL mark it with "⚠️ Vượt X₫" where X is the excess amount formatted in VND
5. WHEN a category's spending is within its Budget_Limit, THE Monthly_Summary_Service SHALL mark it with "✅ Còn X₫" where X is the remaining budget formatted in VND
6. WHEN Budget_Limit data is not configured for the user, THE Monthly_Summary_Service SHALL omit the budget comparison section entirely
7. THE Monthly_Summary_Service SHALL only process users whose Access_Status is `whitelisted` AND who have opted into monthly_summary notifications
8. WHEN a user has zero transactions for the completed month, THE Monthly_Summary_Service SHALL send a message: "📅 Tháng vừa qua bạn chưa ghi khoản chi tiêu nào. Tháng mới rồi, hãy bắt đầu theo dõi chi tiêu nhé!"
9. IF NotificationSender fails to deliver the summary to a specific user, THEN THE Monthly_Summary_Service SHALL log the failure and continue processing remaining users

### Requirement 5: Notification Preference Management

**User Story:** As a user, I want to opt-in or opt-out of specific notification types via chat commands, so that I only receive the notifications I find useful.

#### Acceptance Criteria

1. WHEN a Whitelisted_User sends "bật nhắc nhở" or "bật thông báo hàng ngày", THE Bot_Service SHALL set the user's daily_reminder preference to enabled in Notification_Preference_Repository and confirm with: "✅ Đã bật nhắc nhở hàng ngày. Mình sẽ nhắc bạn ghi chi tiêu mỗi tối nếu bạn chưa ghi."
2. WHEN a Whitelisted_User sends "tắt nhắc nhở" or "tắt thông báo hàng ngày", THE Bot_Service SHALL set the user's daily_reminder preference to disabled in Notification_Preference_Repository and confirm with: "🔕 Đã tắt nhắc nhở hàng ngày."
3. WHEN a Whitelisted_User sends "bật báo cáo tuần", THE Bot_Service SHALL set the user's weekly_digest preference to enabled and confirm with: "✅ Đã bật báo cáo tuần. Mỗi Chủ nhật bạn sẽ nhận tổng kết chi tiêu tuần."
4. WHEN a Whitelisted_User sends "tắt báo cáo tuần", THE Bot_Service SHALL set the user's weekly_digest preference to disabled and confirm with: "🔕 Đã tắt báo cáo tuần."
5. WHEN a Whitelisted_User sends "bật báo cáo tháng", THE Bot_Service SHALL set the user's monthly_summary preference to enabled and confirm with: "✅ Đã bật báo cáo tháng. Cuối mỗi tháng bạn sẽ nhận tổng kết chi tiêu."
6. WHEN a Whitelisted_User sends "tắt báo cáo tháng", THE Bot_Service SHALL set the user's monthly_summary preference to disabled and confirm with: "🔕 Đã tắt báo cáo tháng."
7. WHEN a Whitelisted_User sends "xem thông báo" or "cài đặt thông báo", THE Bot_Service SHALL reply with the current notification preference status showing each type and its enabled/disabled state
8. WHEN a new user is approved (Access_Status changes to `whitelisted`), THE Notification_Preference_Repository SHALL create a default preference record with all three notification types enabled
9. THE Notification_Preference_Repository SHALL persist preferences to the database so they survive application restarts

### Requirement 6: Notification Preference Database Schema

**User Story:** As a developer, I want a notification_preferences table in the database, so that user opt-in/opt-out choices are persisted.

#### Acceptance Criteria

1. THE Database_Migration SHALL create a `notification_preferences` table with columns: `id` (uuid, primary key, default gen_random_uuid()), `user_id` (uuid, not null, references users(id)), `daily_reminder` (boolean, not null, default true), `weekly_digest` (boolean, not null, default true), `monthly_summary` (boolean, not null, default true), `created_at` (timestamptz, not null, default now()), `updated_at` (timestamptz, not null, default now())
2. THE Database_Migration SHALL add a unique constraint on `notification_preferences(user_id)` to ensure one preference record per user
3. THE Database_Migration SHALL create an index on `notification_preferences(user_id)` for efficient lookup
4. THE migration SQL file SHALL be idempotent — safe to run multiple times without error (use IF NOT EXISTS or equivalent guards)
5. WHEN the migration is applied, THE Database_Migration SHALL insert a default notification_preferences record (all enabled) for every existing Whitelisted_User who does not already have a preference record (backfill)

### Requirement 7: Eligible User Resolution

**User Story:** As a developer, I want a clear definition of which users receive notifications, so that the system only contacts active, opted-in users.

#### Acceptance Criteria

1. THE Notification_Scheduler SHALL define an eligible user as one whose Access_Status is `whitelisted` AND whose corresponding Notification_Preference has the relevant notification type set to enabled
2. WHEN resolving eligible users for daily_reminder, THE Notification_Scheduler SHALL query users where Access_Status is `whitelisted` AND daily_reminder preference is true
3. WHEN resolving eligible users for weekly_digest, THE Notification_Scheduler SHALL query users where Access_Status is `whitelisted` AND weekly_digest preference is true
4. WHEN resolving eligible users for monthly_summary, THE Notification_Scheduler SHALL query users where Access_Status is `whitelisted` AND monthly_summary preference is true
5. IF a Whitelisted_User has no record in Notification_Preference_Repository, THEN THE Notification_Scheduler SHALL treat the user as having all notifications enabled (opt-in by default)
