# Implementation Plan: Proactive Notifications

## Overview

This implementation adds proactive scheduled notifications (daily reminder, weekly digest, monthly summary) to the Oh My Fast Tracker bot. It introduces a new database table for notification preferences, domain entities/ports, application use cases, a cron-based scheduler using `@nestjs/schedule`, preference management commands in BotService, and a Supabase repository for preference persistence.

## Tasks

- [x] 1. Database schema and migration
  - [x] 1.1 Create SQL migration file for notification_preferences table
    - Create `sql/004-notification-preferences.sql` with the notification_preferences table definition
    - Include unique constraint on user_id, index, and backfill for existing whitelisted users
    - Create the `get_eligible_notification_users` database function (RPC)
    - Use IF NOT EXISTS guards for idempotency
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 2. Domain layer: entity and port
  - [x] 2.1 Create NotificationPreference entity
    - Create `src/domain/entities/NotificationPreference.ts` with the interface: id, userId, dailyReminder, weeklyDigest, monthlySummary, createdAt, updatedAt
    - _Requirements: 5.9, 6.1_

  - [x] 2.2 Create NotificationPreferenceRepository port
    - Create `src/domain/ports/NotificationPreferenceRepository.ts` with methods: findByUserId, upsert, findEligibleUserIds, createDefault
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 3. Infrastructure layer: repository and config
  - [x] 3.1 Create SupabaseNotificationPreferenceRepository
    - Create `src/infrastructure/repositories/SupabaseNotificationPreferenceRepository.ts` implementing the port
    - Implement findByUserId, upsert (with onConflict: 'user_id'), findEligibleUserIds (calling the RPC function), and createDefault
    - _Requirements: 5.9, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 3.2 Add notification config to app.config.ts
    - Add `notificationConfig` registered as 'notification' with DAILY_REMINDER_CRON, WEEKLY_DIGEST_CRON, MONTHLY_SUMMARY_CRON environment variables and their defaults
    - _Requirements: 1.5, 1.6, 1.7_

  - [x] 3.3 Register NotificationPreferenceRepository in InfrastructureModule
    - Add provider `{ provide: 'NotificationPreferenceRepository', useClass: SupabaseNotificationPreferenceRepository }` and export it
    - _Requirements: 5.9_

  - [x] 3.4 Write unit tests for SupabaseNotificationPreferenceRepository
    - Test upsert behavior, findByUserId, findEligibleUserIds with mock Supabase client
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 4. Application layer: use cases
  - [x] 4.1 Implement SendDailyReminder use case
    - Create `src/application/usecases/SendDailyReminder.ts`
    - Query eligible users, check each user's transaction count for current date, send reminder only if zero transactions
    - Return { sent, skipped, errors } for logging
    - Use per-user try/catch for error isolation
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 4.2 Write property test for SendDailyReminder (Property 2: Daily Reminder Conditional)
    - **Property 2: Daily Reminder Conditional**
    - Generate random (user, transactions[]) pairs, verify reminder sent iff transactions.length === 0
    - **Validates: Requirements 2.2, 2.3**

  - [x] 4.3 Implement SendWeeklyDigest use case
    - Create `src/application/usecases/SendWeeklyDigest.ts`
    - Compute current week (Mon–Sun) and previous week date ranges
    - For each eligible user: query transactions, format digest with total, top 3 categories, week-over-week comparison
    - Handle zero-transaction week with special message
    - Handle missing previous week data (omit comparison)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 4.4 Write property tests for SendWeeklyDigest
    - **Property 4: Week Date Range Correctness** — Generate random dates, verify Monday-Sunday boundaries
    - **Property 5: Weekly Digest Content Completeness** — Generate random transaction sets, verify total + top 3 categories + comparison present
    - **Property 6: Week-over-Week Comparison Formatting** — Generate (current, previous) totals, verify "📈 Tăng X%" / "📉 Giảm X%" formatting
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [x] 4.5 Implement SendMonthlySummary use case
    - Create `src/application/usecases/SendMonthlySummary.ts`
    - Compute completed month range (1st to last day)
    - For each eligible user: query transactions, format summary with total expenses, total income, category breakdown, transaction count
    - Optionally include budget comparison section if budget data is available
    - Handle zero-transaction month with special message
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 4.6 Write property tests for SendMonthlySummary
    - **Property 7: Month Date Range Correctness** — Generate random dates, verify 1st-to-last-day boundaries
    - **Property 8: Monthly Summary Content Completeness** — Generate random transaction sets, verify all required sections
    - **Property 9: Budget Status Formatting** — Generate (spending, limit) pairs, verify "⚠️ Vượt" / "✅ Còn" formatting
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.5**

  - [x] 4.7 Write property test for error isolation (Property 1)
    - **Property 1: Error Isolation**
    - Generate random user lists with random failure indices, verify all non-failing users are processed
    - **Validates: Requirements 1.8, 2.6, 3.7, 4.9**

- [x] 5. Checkpoint - Ensure use cases compile and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Notification scheduler service
  - [x] 6.1 Implement NotificationScheduler
    - Create `src/application/services/NotificationScheduler.ts`
    - Register with `@nestjs/schedule` ScheduleModule
    - Add three @Cron-decorated methods: handleDailyReminder, handleWeeklyDigest, handleMonthlySummary
    - Read cron expressions from config (with defaults)
    - Log start/completion with sent/skipped/errors counts
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 6.2 Install @nestjs/schedule and register ScheduleModule
    - Add `@nestjs/schedule` dependency to package.json
    - Import ScheduleModule.forRoot() in AppModule
    - _Requirements: 1.1_

  - [x] 6.3 Register use cases and scheduler in ApplicationModule
    - Add SendDailyReminder, SendWeeklyDigest, SendMonthlySummary, and NotificationScheduler to ApplicationModule providers and exports
    - _Requirements: 1.1_

  - [x] 6.4 Write unit tests for NotificationScheduler
    - Verify each cron handler calls the correct use case
    - Test that errors in use cases are logged, not propagated
    - _Requirements: 1.1, 1.8_

- [x] 7. Preference management commands in BotService
  - [x] 7.1 Add notification preference command handling to BotService
    - Add regex patterns for bật/tắt nhắc nhở, bật/tắt báo cáo tuần, bật/tắt báo cáo tháng, xem thông báo
    - Inject NotificationPreferenceRepository into BotService
    - Place command checks after access control gate, before edit intent detection
    - Handle each command: call upsert on repository, reply with confirmation message
    - Implement "xem thông báo" status display with current preference states
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 7.2 Write unit tests for notification preference commands
    - Test each bật/tắt pattern triggers correct preference update and confirmation message
    - Test "xem thông báo" displays correct status for various preference combinations
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 7.3 Write property test for eligible user resolution (Property 3)
    - **Property 3: Eligible User Resolution**
    - Generate random user states (whitelisted/pending/blocked) and preference combinations, verify eligibility logic
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

  - [x] 7.4 Write property test for default opt-in (Property 10)
    - **Property 10: Default Opt-In for Missing Preferences**
    - Generate whitelisted users with no preference record, verify treated as all-enabled
    - **Validates: Requirements 7.5**

- [x] 8. Default preferences on user approval
  - [x] 8.1 Create default notification preferences when user is approved
    - Modify ApproveUser use case or hook into the approval flow to call NotificationPreferenceRepository.createDefault(userId) when access_status changes to 'whitelisted'
    - _Requirements: 5.8_

- [x] 9. Checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Update /help message and environment documentation
  - [x] 10.1 Update HELP_MSG in BotService with notification commands
    - Add a new "🔔 Thông báo:" section to the HELP_MSG constant listing: bật/tắt nhắc nhở, bật/tắt báo cáo tuần, bật/tắt báo cáo tháng, xem thông báo
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 10.2 Update .env.example with new environment variables
    - Add DAILY_REMINDER_CRON, WEEKLY_DIGEST_CRON, MONTHLY_SUMMARY_CRON with default values and comments
    - _Requirements: 1.5, 1.6, 1.7_

- [x] 11. Update README.md with proactive notifications documentation
  - [x] 11.1 Update README.md
    - Add proactive notifications to the Features section
    - Add new bot commands (bật/tắt nhắc nhở, bật/tắt báo cáo tuần, bật/tắt báo cáo tháng, xem thông báo) to Bot commands table
    - Add new environment variables to the Environment variables table
    - Update Database schema section with notification_preferences table
    - Update the Roadmap to mark proactive notifications as completed
    - Update the "How it works" diagram to include notification flow
    - _Requirements: 1.5, 1.6, 1.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 12. Final checkpoint - All tests pass and documentation is complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project already has `fast-check` as a dev dependency for property-based tests
- `@nestjs/schedule` needs to be installed as a new dependency (task 6.2)
- Budget comparison in monthly summary is conditional on the budget-limit-alerts feature being implemented

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2"] },
    { "id": 1, "tasks": ["3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3", "3.4", "6.2"] },
    { "id": 3, "tasks": ["4.1", "4.3", "4.5"] },
    { "id": 4, "tasks": ["4.2", "4.4", "4.6", "4.7"] },
    { "id": 5, "tasks": ["6.1", "6.3"] },
    { "id": 6, "tasks": ["6.4", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "7.4", "8.1"] },
    { "id": 8, "tasks": ["10.1", "10.2"] },
    { "id": 9, "tasks": ["11.1"] }
  ]
}
```
