# Requirements Document

## Introduction

This feature implements whitelist-based access control for the Oh My Fast Tracker bot. Only whitelisted users can interact with the bot to record transactions and generate reports. Unknown users are registered as pending and receive friendly replies. An internal Admin API allows operators to approve or block users, with automatic Telegram notification on approval. Additionally, this feature adds a `channel` column to the transactions table and a `plan` subscription placeholder to the users table.

## Glossary

- **Bot_Service**: The NestJS service (BotService) that receives incoming messages from chat channels and routes them to the appropriate use case
- **Access_Controller**: The logical component within Bot_Service responsible for checking a user's access status before processing messages
- **User_Repository**: The port/interface for persisting and querying user records including access status
- **Notification_Sender**: The port/interface responsible for sending outbound messages to users outside of a request-response cycle
- **Admin_API**: The internal HTTP controller that exposes user management endpoints protected by a shared secret
- **Access_Status**: An enumeration of user states: `pending`, `whitelisted`, `blocked`
- **Subscription_Plan**: An enumeration of plan tiers: `free`, `pro`, `max` (not enforced in this iteration)
- **Channel_User_ID**: The unique identifier of a user within a specific channel (e.g., Telegram chat ID)
- **Admin_Secret**: A shared secret string used to authenticate requests to the Admin_API via the `X-Admin-Secret` header

## Requirements

### Requirement 1: User Access Check on Message Receipt

**User Story:** As a bot operator, I want only whitelisted users to interact with the bot, so that I can control who uses the service.

#### Acceptance Criteria

1. WHEN an incoming message is received, THE Access_Controller SHALL look up the user's Access_Status by channel and Channel_User_ID before processing the message
2. WHILE a user's Access_Status is `whitelisted`, THE Bot_Service SHALL process the message using existing routing logic (transaction recording, reports, trend analysis)
3. WHILE a user's Access_Status is `pending` or `blocked`, THE Bot_Service SHALL reject the message and send a reply indicating the user is not yet authorized, without processing the command
4. THE Access_Controller SHALL perform the access check at a single point in Bot_Service before any routing logic executes
5. IF no user record is found for the given channel and Channel_User_ID, THEN THE Access_Controller SHALL treat the user as `pending` and create a new record with Access_Status `pending`
6. IF the database lookup fails due to a connection error or timeout (within 5 seconds), THEN THE Bot_Service SHALL send a reply indicating the service is temporarily unavailable and SHALL NOT process the message
7. THE Access_Controller SHALL recognise exactly three Access_Status values: `whitelisted`, `pending`, and `blocked`

### Requirement 2: Pending User Registration

**User Story:** As a new user, I want to be registered automatically when I first message the bot, so that an admin can later approve me.

#### Acceptance Criteria

1. WHEN a message is received from a user with no existing record in User_Repository, THE Bot_Service SHALL create a new user record with Access_Status set to `pending`, the channel set to the message channel, Channel_User_ID set to the sender's ID, and channel_username set to the sender's username from message metadata (nullable if unavailable)
2. WHEN the CheckUserAccess use case returns `isFirstMessage=true` for a pending user, THE Bot_Service SHALL reply with the welcome message: "Chào bạn! Bot đang trong giai đoạn thử nghiệm giới hạn người dùng.\nTài khoản của bạn đã được ghi nhận, mình sẽ duyệt sớm nhất có thể. Cảm ơn bạn đã quan tâm 🙏"
3. WHEN the CheckUserAccess use case returns `isFirstMessage=false` for a user with Access_Status `pending`, THE Bot_Service SHALL reply with: "Tài khoản của bạn vẫn đang chờ duyệt, mình sẽ thông báo khi có thể sử dụng nhé 🙏"
4. WHEN a user with Access_Status `blocked` sends a message, THE Bot_Service SHALL reply with the same message used for subsequent pending messages to avoid revealing the block status
5. IF User_Repository fails to create the new user record, THEN THE Bot_Service SHALL reply with a generic error message indicating a temporary issue and SHALL NOT process the original message

### Requirement 3: Admin API Authentication

**User Story:** As a system operator, I want the admin endpoints protected by a shared secret, so that only authorized personnel can manage user access.

#### Acceptance Criteria

1. WHEN a request to the Admin_API contains a valid `X-Admin-Secret` header whose value matches the configured Admin_Secret exactly (case-sensitive, full-string comparison), THE Admin_API SHALL forward the request to the target controller action
2. WHEN a request to the Admin_API contains an `X-Admin-Secret` header whose value does not match the configured Admin_Secret, or the header is missing or empty, THE Admin_API SHALL respond with HTTP 401 and a JSON body `{ "message": "Unauthorized" }` without invoking the target controller action
3. THE Admin_API SHALL compare the provided secret against the configured Admin_Secret using constant-time comparison to prevent timing attacks
4. IF the Admin_Secret environment variable is not set or is empty at application startup, THEN THE Admin_API SHALL fail to start and report a configuration error indicating the missing variable
5. THE Admin_API SHALL not include CORS headers on responses to `/internal/admin/*` routes

### Requirement 4: List Pending Users

**User Story:** As an admin, I want to see all users awaiting approval, so that I can decide whom to grant access.

#### Acceptance Criteria

1. WHEN a GET request is made to `/internal/admin/users` with query parameter `status=pending` and a valid Admin_Secret, THE Admin_API SHALL return an HTTP 200 response with body `{ "users": [...] }` containing all user records with Access_Status `pending`, ordered by `created_at` ascending (oldest first)
2. WHEN a GET request is made to `/internal/admin/users` without a `status` query parameter and a valid Admin_Secret, THE Admin_API SHALL default to filtering by Access_Status `pending`
3. THE Admin_API SHALL include the following fields in each user record: id, channel, channelUserId, channelUsername (null if unavailable), accessStatus, createdAt
4. WHEN a GET request is made to `/internal/admin/users` with `status` set to `whitelisted` or `blocked` and a valid Admin_Secret, THE Admin_API SHALL return user records filtered by the corresponding Access_Status
5. IF the `status` query parameter contains a value other than `pending`, `whitelisted`, or `blocked`, THEN THE Admin_API SHALL respond with HTTP 400 and an error message indicating the invalid status value
6. WHEN no users match the requested status filter, THE Admin_API SHALL return an HTTP 200 response with body `{ "users": [] }`

### Requirement 5: Approve User

**User Story:** As an admin, I want to approve a pending user, so that they can start using the bot immediately.

#### Acceptance Criteria

1. WHEN a POST request is made to `/internal/admin/users/:userId/approve` with a valid Admin_Secret, THE Admin_API SHALL update the user's Access_Status to `whitelisted`, set `whitelisted_at` to the current timestamp, and return a JSON response containing the fields: id, accessStatus, and whitelistedAt
2. WHEN a user is successfully approved, THE Notification_Sender SHALL send a Telegram message to the user's Channel_User_ID: "🎉 Tài khoản của bạn đã được kích hoạt! Giờ bạn có thể bắt đầu ghi chi tiêu rồi đó.\nGõ thử: 'ăn trưa 50k' để bắt đầu nhé!"
3. IF the Notification_Sender fails to deliver the approval message, THEN THE Admin_API SHALL still return a success response with the approved user data (notification failure does not rollback the approval)
4. WHEN a user is approved, THE Bot_Service SHALL allow the user to interact with the bot on the next message without requiring a restart or cache invalidation
5. IF the userId in the request does not match any existing user record, THEN THE Admin_API SHALL respond with HTTP 404 Not Found
6. IF the user's Access_Status is already `whitelisted`, THEN THE Admin_API SHALL process the request idempotently by updating `whitelisted_at` to the current timestamp and returning a success response without error

### Requirement 6: Block User

**User Story:** As an admin, I want to block a user, so that they can no longer interact with the bot.

#### Acceptance Criteria

1. WHEN a POST request is made to `/internal/admin/users/:userId/block` with a valid Admin_Secret, THE Admin_API SHALL update the user's Access_Status to `blocked` and return a JSON response containing the user's `id` and `accessStatus`
2. IF the `:userId` does not exist in User_Repository, THEN THE Admin_API SHALL respond with HTTP 404
3. IF the user's Access_Status is already `blocked`, THEN THE Admin_API SHALL return a success response with the current state without error (idempotent operation)
4. WHEN a user is blocked, THE Bot_Service SHALL enforce the block on the user's next incoming message without requiring a restart or cache invalidation

### Requirement 7: Database Schema Migration

**User Story:** As a developer, I want the users table extended with access control columns, so that the system can persist user status and plan information.

#### Acceptance Criteria

1. THE Database_Migration SHALL add the following columns to the `users` table using ALTER TABLE ADD COLUMN: `channel_username` (text, nullable), `access_status` (text, not null, default 'pending'), `plan` (text, not null, default 'free'), `whitelisted_at` (timestamptz, nullable), `plan_updated_at` (timestamptz, nullable), `updated_at` (timestamptz, not null, default now())
2. THE Database_Migration SHALL add a `channel` column (text, not null, default 'telegram') to the `transactions` table using ALTER TABLE ADD COLUMN
3. THE Database_Migration SHALL create index `idx_users_access_status` on `users(access_status)` and index `idx_transactions_channel_user` on `transactions(channel, user_id)` using CREATE INDEX IF NOT EXISTS
4. THE migration SQL file SHALL be idempotent — safe to run multiple times without error (use IF NOT EXISTS or equivalent guards)
5. IF the migration fails, THEN THE Database_Migration SHALL log the error and exit with a non-zero process code

### Requirement 8: Backfill Existing Users

**User Story:** As a bot operator, I want existing users automatically whitelisted during migration, so that current users are not disrupted.

#### Acceptance Criteria

1. THE Backfill_Migration SHALL insert a user record with Access_Status `whitelisted`, plan `free`, and `whitelisted_at` set to the migration execution timestamp for every distinct `user_id` found in the `transactions` table, using channel `telegram` and the transaction's `user_id` as Channel_User_ID, skipping any Channel_User_ID that already exists in the `users` table (ON CONFLICT DO NOTHING)
2. THE Backfill_Migration SHALL upsert the test user with Channel_User_ID `7046661244` on channel `telegram`, setting Access_Status to `whitelisted` and `whitelisted_at` to the migration execution timestamp regardless of the user's prior state (ON CONFLICT DO UPDATE)
3. THE Backfill_Migration SHALL execute after the schema migration that adds the `access_status`, `plan`, and `whitelisted_at` columns to the `users` table and before the application code with access control logic is deployed
4. WHEN the backfill completes, THE Bot_Service SHALL recognize all backfilled users as having Access_Status `whitelisted`, allowing them to record transactions and generate reports on their next message without re-registration

### Requirement 9: Channel Column on Transactions

**User Story:** As a developer, I want transactions to record which channel they originated from, so that the system supports multi-channel analytics.

#### Acceptance Criteria

1. WHEN a transaction is recorded via the Telegram bot, THE Transaction_Repository SHALL store the value `telegram` in the `channel` column of the transaction record
2. THE Transaction_Repository SHALL accept a `channel` parameter of type string when saving a transaction and persist it to the `channel` column
3. IF the `channel` parameter is not provided when saving a transaction, THEN THE Transaction_Repository SHALL default the `channel` value to `telegram`
4. WHEN the Transaction_Repository retrieves transactions via `findByUserAndDateRange`, THE Transaction_Repository SHALL include the `channel` field in each returned Transaction entity
5. THE RecordTransaction use case SHALL accept a `channel` parameter in addition to `userId` and `rawText`, and pass it to the Transaction_Repository when saving

### Requirement 10: Subscription Plan Placeholder

**User Story:** As a product owner, I want a plan field on users, so that future subscription enforcement can be added without another migration.

#### Acceptance Criteria

1. THE Database_Migration SHALL add a `plan` column to the `users` table as text, not null, with a default of `free`
2. THE Bot_Service SHALL not enforce any plan-based restrictions — the `plan` column SHALL NOT influence Access_Status checks, message routing, or any command processing logic
3. THE User entity type SHALL include a `plan` field with type `'free' | 'pro' | 'max'` but no service or use case SHALL read or branch on its value

### Requirement 11: Rollout Safety

**User Story:** As a developer, I want a defined deployment order, so that access control is enabled safely without locking out existing users.

#### Acceptance Criteria

1. THE deployment SHALL execute in this order: database migration (schema changes) → backfill existing users as whitelisted → deploy application code with access control enabled, where each step completes successfully before the next step begins
2. IF the application code is deployed before the backfill completes, THEN THE Bot_Service SHALL treat users missing from User_Repository as pending (safe default), allowing the user to gain access once the backfill runs without requiring a redeployment
3. IF a database migration step fails, THEN THE deployment SHALL halt without proceeding to subsequent steps
4. WHEN the deployment completes all three steps, THE system SHALL satisfy the following verification conditions: the test user with Channel_User_ID `7046661244` has Access_Status `whitelisted` in User_Repository, all existing rows in the transactions table have `channel` set to `telegram`, and the Bot_Service processes messages from previously active users without returning a pending reply
