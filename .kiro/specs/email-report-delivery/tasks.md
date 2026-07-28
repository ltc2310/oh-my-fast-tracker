# Implementation Plan: Email Report Delivery

## Overview

Add email report delivery to the expense-tracking bot. Users can request reports via email through trigger phrases. The system collects email on first use, generates Excel reports using the existing `ExcelGeneratorService`, and sends them as attachments with a professional HTML body via SMTP. Built on NestJS clean architecture with new domain ports, infrastructure implementations, and conversation state management.

## Tasks

- [ ] 1. Database migration and domain ports
  - [ ] 1.1 Add email column to users table
    - Create migration SQL: `ALTER TABLE users ADD COLUMN email varchar(254) DEFAULT NULL`
    - Update `sql/schema.sql` to include the email column in the table definition
    - _Requirements: 4.1_

  - [ ] 1.2 Create EmailService port
    - Create `src/domain/ports/EmailService.ts` with `EmailAttachment` and `SendEmailOptions` interfaces and `EmailService` interface
    - _Requirements: 3.2, 3.3, 3.7_

  - [ ] 1.3 Create UserRepository port
    - Create `src/domain/ports/UserRepository.ts` with `getEmailByChannelUser(channel, channelUserId)` and `saveEmail(channel, channelUserId, email)` methods
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [ ] 2. Infrastructure implementations
  - [ ] 2.1 Implement SupabaseUserRepository
    - Create `src/infrastructure/repositories/SupabaseUserRepository.ts`
    - Implement `getEmailByChannelUser` with single query on `(channel, channel_user_id)`
    - Implement `saveEmail` with upsert on `(channel, channel_user_id)` setting the email column
    - Inject `supabaseConfig` for database connection
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 2.2 Add SMTP configuration
    - Add `smtpConfig` to `src/infrastructure/config/app.config.ts` using `registerAs("smtp", ...)`
    - Config reads `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
    - Update `.env.example` with SMTP environment variables
    - _Requirements: 3.2_

  - [ ] 2.3 Implement NodemailerEmailService
    - Create `src/infrastructure/email/NodemailerEmailService.ts`
    - Create nodemailer transporter from smtpConfig
    - Implement `send(options)` with 30-second AbortSignal timeout
    - Use `smtpConfig.from` as sender address
    - _Requirements: 3.2, 3.3, 3.9_

  - [ ]* 2.4 Write unit tests for NodemailerEmailService
    - Test timeout behavior (>30s → throws)
    - Test correct transporter configuration
    - Mock nodemailer.createTransport
    - _Requirements: 3.9_

- [ ] 3. Email utilities and ConversationStateManager
  - [ ] 3.1 Create email validation and masking utilities
    - Create `src/infrastructure/channels/email-utils.ts`
    - Implement `isValidEmail(text)`: check length ≤254 and regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
    - Implement `maskEmail(email)`: produce `{first_char}***@{domain}` format
    - _Requirements: 2.4, 4.4, 5.1, 5.5_

  - [ ] 3.2 Implement ConversationStateManager
    - Create `src/infrastructure/channels/ConversationStateManager.ts`
    - In-memory `Map<string, ConversationState>` with `setState`, `getState`, `clearState`
    - `getState` auto-clears entries older than 5 minutes (TTL_MS = 300000)
    - Define `ConversationState` type with `type`, `dateRange?`, `attempts`, `createdAt`
    - _Requirements: 2.5_

  - [ ]* 3.3 Write unit tests for email-utils
    - Test `isValidEmail` with valid emails, invalid formats, >254 chars
    - Test `maskEmail` output format for various email addresses
    - _Requirements: 2.4, 4.4, 5.1, 5.5_

  - [ ]* 3.4 Write unit tests for ConversationStateManager
    - Test TTL expiry (state cleared after 5 min)
    - Test setState/getState/clearState basic operations
    - _Requirements: 2.5_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Application layer services
  - [ ] 5.1 Create EmailTemplateService
    - Create `src/application/services/EmailTemplateService.ts`
    - Implement `renderReportEmail(summary, from, to)` returning HTML string
    - HTML includes: branded header, report period (dd/MM/yyyy), total in VND, category breakdown sorted descending, note about attached Excel
    - Use inline CSS with professional styling, responsive single-column layout
    - _Requirements: 3.7, 3.8_

  - [ ] 5.2 Implement SendEmailReport use case
    - Create `src/application/usecases/SendEmailReport.ts`
    - Inject `EmailService`, `ExcelGeneratorService`, `EmailTemplateService`
    - Orchestrate: generate Excel buffer → render HTML → send email with attachment
    - Use subject format `"Báo cáo chi tiêu {DD/MM/YYYY} - {DD/MM/YYYY}"`
    - Use `formatExportFilename(from, to)` for attachment filename
    - _Requirements: 3.1, 3.2, 3.3, 3.7_

  - [ ]* 5.3 Write unit tests for EmailTemplateService
    - Test HTML output contains dates, total VND, all categories sorted desc, attachment note
    - Test with edge cases: single category, many categories
    - _Requirements: 3.7, 3.8_

  - [ ]* 5.4 Write unit tests for SendEmailReport
    - Mock EmailService, ExcelGeneratorService, EmailTemplateService
    - Verify correct orchestration: excel generated → template rendered → email sent
    - Verify subject line format and attachment filename
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 6. Bot integration - trigger detection and email flows
  - [ ] 6.1 Add EMAIL_REPORT_REGEX and EMAIL_UPDATE_REGEX to BotService
    - Add `EMAIL_REPORT_REGEX` matching: "gửi báo cáo", "gửi report", "gửi email báo cáo", "report cho tôi", "email report"
    - Add `EMAIL_UPDATE_REGEX` matching: "đổi email", "cập nhật email", "thay đổi email", "sửa email"
    - Check `EMAIL_REPORT_REGEX` and `EMAIL_UPDATE_REGEX` **before** `REPORT_REGEX` in `onMessage` handler
    - Route matching messages to respective handlers
    - _Requirements: 1.1, 1.2, 1.5, 5.1_

  - [ ] 6.2 Implement email collection flow in BotService
    - Inject `ConversationStateManager` and `UserRepository` into BotService
    - In `onMessage`, check conversation state **first** before trigger matching
    - If state exists and message is valid email → save email, clear state, proceed with report/update
    - If state exists and message is invalid email → increment attempts, inform user (max 3)
    - If state exists and message is not email-like → cancel state, process as normal message
    - If max attempts exceeded → cancel flow, inform user
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ] 6.3 Implement handleEmailReportRequest in BotService
    - Parse date range using existing `parseReportDateRange` (default: last 7 days)
    - Look up user email via UserRepository
    - If no email → set conversation state (type: email_collection, dateRange) and ask user
    - If email exists → invoke SendEmailReport use case
    - If no transactions → notify user without sending email
    - On success → confirm with destination email
    - On failure → notify user of error
    - _Requirements: 1.3, 1.4, 2.1, 3.1, 3.4, 3.5, 3.6_

  - [ ] 6.4 Implement handleEmailUpdateRequest in BotService
    - Look up current email via UserRepository
    - If has email → show masked email, enter email_update state
    - If no email → enter email collection as first-time setup
    - On valid new email → save via UserRepository, confirm with masked new email
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 7. Module wiring and DI registration
  - [ ] 7.1 Register new providers in InfrastructureModule
    - Add `ConfigModule.forFeature(smtpConfig)` to imports
    - Register `SupabaseUserRepository` as provider for `"UserRepository"` token
    - Register `NodemailerEmailService` as provider for `"EmailService"` token
    - Register `ConversationStateManager` as a provider
    - Export `"UserRepository"`, `"EmailService"`, and `ConversationStateManager`
    - _Requirements: all_

  - [ ] 7.2 Register new services in ApplicationModule
    - Add `EmailTemplateService` and `SendEmailReport` to providers and exports
    - _Requirements: all_

  - [ ] 7.3 Update BotService constructor injections
    - Add `@Inject("UserRepository")`, `@Inject("EmailService")`, `ConversationStateManager`, and `SendEmailReport` to BotService constructor
    - _Requirements: all_

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Property-based tests
  - [ ]* 9.1 Write property test for email trigger routing priority
    - **Property 1: Email trigger routing priority**
    - **Validates: Requirements 1.1, 1.2, 1.5**
    - Generate random messages containing EMAIL_REPORT_REGEX phrases; verify they match EMAIL_REPORT_REGEX
    - Generate random messages matching REPORT_REGEX but not EMAIL_REPORT_REGEX; verify they don't match EMAIL_REPORT_REGEX

  - [ ]* 9.2 Write property test for valid email persistence round-trip
    - **Property 2: Valid email persistence round-trip**
    - **Validates: Requirements 2.2, 4.2**
    - Generate random valid emails; after saveEmail → getEmailByChannelUser returns same email

  - [ ]* 9.3 Write property test for invalid email rejection
    - **Property 3: Invalid email rejection**
    - **Validates: Requirements 2.4, 5.4**
    - Generate random strings not matching email format; verify isValidEmail returns false

  - [ ]* 9.4 Write property test for email subject line formatting
    - **Property 4: Email subject line formatting**
    - **Validates: Requirements 3.3**
    - Generate random date ranges; verify subject matches `"Báo cáo chi tiêu {DD/MM/YYYY} - {DD/MM/YYYY}"`

  - [ ]* 9.5 Write property test for attachment filename consistency
    - **Property 5: Attachment filename consistency**
    - **Validates: Requirements 3.2**
    - Generate random date ranges; verify attachment filename equals `formatExportFilename(from, to)`

  - [ ]* 9.6 Write property test for HTML template completeness
    - **Property 6: HTML template completeness**
    - **Validates: Requirements 3.7**
    - Generate random WeeklySummary with ≥1 category; verify HTML contains dates, total VND, all categories sorted desc, attachment note

  - [ ]* 9.7 Write property test for email upsert overwrite
    - **Property 7: Email upsert overwrites previous value**
    - **Validates: Requirements 4.2, 5.3**
    - Generate random (channel, channelUserId) with two different emails; save both sequentially; verify only last is returned

  - [ ]* 9.8 Write property test for email length enforcement
    - **Property 8: Email length enforcement**
    - **Validates: Requirements 4.4**
    - Generate random strings >254 chars; verify isValidEmail returns false

  - [ ]* 9.9 Write property test for email masking format
    - **Property 9: Email masking format**
    - **Validates: Requirements 5.1, 5.5**
    - Generate random valid emails; verify maskEmail output matches `{first_char}***@{domain}`

- [ ] 10. Unit tests for bot flows
  - [ ]* 10.1 Write unit tests for email collection flow
    - Test: first-time user → bot asks for email → user replies → email saved → report sent
    - Test: invalid email → bot asks again → valid email → success
    - Test: 3 invalid attempts → flow cancelled
    - Test: non-email message during collection → state cancelled, message re-routed
    - Test: state expires after 5 minutes → message processed normally
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 10.2 Write unit tests for email update flow
    - Test: existing email → show masked → new email → confirm with masked
    - Test: no existing email → enter collection flow
    - Test: invalid email during update → ask again
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 10.3 Write unit tests for email report request handling
    - Test: email exists + transactions → report sent successfully
    - Test: email exists + no transactions → notify user
    - Test: email send failure → error notification to user
    - Test: date range parsing (tháng này, tuần trước, default 7 days)
    - _Requirements: 1.3, 1.4, 3.1, 3.4, 3.5, 3.6_

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific flows and edge cases
- The project uses TypeScript, NestJS, Jest, and fast-check (already in devDependencies)
- Existing services (`ExcelGeneratorService`, `formatExportFilename`, `parseReportDateRange`) are reused without modification

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "3.1", "3.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "3.3", "3.4"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "5.4", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 7, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8", "9.9"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.3"] }
  ]
}
```
