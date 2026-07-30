# Implementation Plan: Whitelist Access Control

## Overview

This plan implements whitelist-based access control for the Telegram bot following the existing Clean Architecture layers. The implementation order is: database migrations → domain layer → application layer → infrastructure layer → integration into existing code → module wiring → tests. The feature gates all bot interactions behind a user status check, auto-registers new users as `pending`, and exposes an internal Admin API for managing user access.

## Tasks

- [x] 1. Database migrations
  - [x] 1.1 Create schema migration SQL
    - Create `sql/002-whitelist-access-control.sql`
    - Add columns to `users` table: `channel_username` (text, nullable), `access_status` (text, not null, default 'pending'), `plan` (text, not null, default 'free'), `whitelisted_at` (timestamptz, nullable), `plan_updated_at` (timestamptz, nullable), `updated_at` (timestamptz, not null, default now())
    - Add `channel` column to `transactions` table (text, not null, default 'telegram')
    - Create index `idx_users_access_status` on `users(access_status)`
    - Create index `idx_transactions_channel_user` on `transactions(channel, user_id)`
    - Use `IF NOT EXISTS` guards for idempotency
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 9.2, 10.1_

  - [x] 1.2 Create backfill migration SQL
    - Create `sql/003-backfill-whitelist.sql`
    - Insert whitelisted records for all distinct `user_id` values from `transactions` table with channel `telegram`, plan `free`, `whitelisted_at = now()`, using `ON CONFLICT DO NOTHING`
    - Upsert test user `7046661244` on channel `telegram` as whitelisted using `ON CONFLICT DO UPDATE`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 2. Domain layer
  - [x] 2.1 Create User entity
    - Create `src/domain/entities/User.ts`
    - Define `AccessStatus` type: `'pending' | 'whitelisted' | 'blocked'`
    - Define `SubscriptionPlan` type: `'free' | 'pro' | 'max'`
    - Define `User` interface with fields: `id?`, `channel`, `channelUserId`, `channelUsername?`, `accessStatus`, `plan`, `whitelistedAt?`, `planUpdatedAt?`, `createdAt?`, `updatedAt?`
    - _Requirements: 1.7, 10.2, 10.3_

  - [x] 2.2 Create UserRepository port
    - Create `src/domain/ports/UserRepository.ts`
    - Define `UserRepository` interface with methods: `findByChannelAndUserId(channel, channelUserId)`, `create(user)`, `updateAccessStatus(id, status, whitelistedAt?)`, `findById(id)`, `findByStatus(status)`
    - _Requirements: 1.1, 1.5, 2.1_

  - [x] 2.3 Create NotificationSender port
    - Create `src/domain/ports/NotificationSender.ts`
    - Define `NotificationSender` interface with method: `sendMessage(channelUserId, text)`
    - _Requirements: 5.2, 5.3_

  - [x] 2.4 Add `channel` field to Transaction entity
    - Modify `src/domain/entities/Transaction.ts` to add optional `channel?: string` field
    - _Requirements: 9.1, 9.2_

  - [x] 2.5 Add `username` field to IncomingMessage interface
    - Modify `src/domain/ports/ChannelAdapter.ts` to add optional `username?: string | null` field to `IncomingMessage`
    - _Requirements: 2.1_

- [x] 3. Application layer — use cases
  - [x] 3.1 Implement CheckUserAccess use case
    - Create `src/application/usecases/CheckUserAccess.ts`
    - Inject `UserRepository` port
    - Implement `execute(channel, channelUserId, channelUsername?)` method returning `{ allowed, isFirstMessage, user }`
    - Logic: lookup user → if not found, create as pending (isFirstMessage=true) → if whitelisted, allowed=true → if pending/blocked, allowed=false
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.7, 2.1_

  - [x] 3.2 Implement ApproveUser use case
    - Create `src/application/usecases/ApproveUser.ts`
    - Inject `UserRepository` and `NotificationSender` ports
    - Implement `execute(userId)`: find user → throw NotFoundException if not found → update status to `whitelisted` with `whitelistedAt = new Date()` → fire-and-forget notification → return updated user
    - Log warning on notification failure, do NOT throw
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [x] 3.3 Implement BlockUser use case
    - Create `src/application/usecases/BlockUser.ts`
    - Inject `UserRepository` port
    - Implement `execute(userId)`: find user → throw NotFoundException if not found → update status to `blocked` → return updated user
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 3.4 Implement ListPendingUsers use case
    - Create `src/application/usecases/ListPendingUsers.ts`
    - Inject `UserRepository` port
    - Implement `execute(status?)`: default status to `pending`, call `findByStatus(status)`, return users ordered by `createdAt` ascending
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6_

- [x] 4. Checkpoint — Domain + Application layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Infrastructure layer — repositories and services
  - [x] 5.1 Implement SupabaseUserRepository
    - Create `src/infrastructure/repositories/SupabaseUserRepository.ts`
    - Follow the same pattern as `SupabaseTransactionRepository`: inject `supabaseConfig.KEY`, create `SupabaseClient` in constructor
    - Implement all `UserRepository` methods with snake_case ↔ camelCase mapping
    - _Requirements: 1.1, 1.5, 2.1, 4.1, 5.1, 6.1_

  - [x] 5.2 Implement TelegramNotificationSender
    - Create `src/infrastructure/channels/TelegramNotificationSender.ts`
    - Inject `ChannelAdapter` port and delegate `sendMessage` to `channelAdapter.sendText`
    - _Requirements: 5.2, 5.3_

  - [x] 5.3 Add adminConfig to app.config.ts
    - Add `export const adminConfig = registerAs('admin', () => ({ secret: requireEnv('ADMIN_API_SECRET') }))` to `src/infrastructure/config/app.config.ts`
    - _Requirements: 3.1, 3.4_

  - [x] 5.4 Implement AdminSecretGuard
    - Create `src/infrastructure/http/guards/admin-secret.guard.ts`
    - Inject `adminConfig.KEY`, implement `CanActivate`
    - Read `X-Admin-Secret` header, compare with configured secret using `crypto.timingSafeEqual`
    - Handle length mismatch, missing header, and empty values → throw `UnauthorizedException`
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [x] 5.5 Implement AdminUserController
    - Create `src/infrastructure/http/controllers/admin-user.controller.ts`
    - Controller path: `/internal/admin/users`
    - Apply `@UseGuards(AdminSecretGuard)` on entire controller
    - `GET /` with optional `status` query param → `ListPendingUsers`, validate status enum, return `{ users: [...] }`
    - `POST /:userId/approve` → `ApproveUser`, return `{ id, accessStatus, whitelistedAt }`
    - `POST /:userId/block` → `BlockUser`, return `{ id, accessStatus }`
    - Handle 404 for unknown userId, 400 for invalid status
    - _Requirements: 4.1, 4.3, 4.5, 5.1, 5.5, 6.1, 6.2_

- [x] 6. Integration into existing code
  - [x] 6.1 Populate username in TelegramAdapter
    - Modify `src/infrastructure/channels/TelegramAdapter.ts` to set `username: msg.from?.username ?? null` in the `IncomingMessage` passed to the handler
    - _Requirements: 2.1_

  - [x] 6.2 Add access check to BotService
    - Modify `src/infrastructure/channels/bot.service.ts`:
    - Inject `CheckUserAccess` use case
    - Add access check as the first step after the `/^id$/i` debug command
    - If `allowed=false` and `isFirstMessage=true`: send welcome message (Vietnamese)
    - If `allowed=false` and `isFirstMessage=false`: send pending message (same for blocked users)
    - If access check throws: send "service temporarily unavailable" message, return
    - If `allowed=true`: proceed with existing routing
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 2.2, 2.3, 2.4, 2.5_

  - [x] 6.3 Add channel parameter to RecordTransaction
    - Modify `src/application/usecases/RecordTransaction.ts`: add `channel: string = 'telegram'` parameter to `execute`, pass it to each transaction object
    - _Requirements: 9.5_

  - [x] 6.4 Persist and return channel in SupabaseTransactionRepository
    - Modify `src/infrastructure/repositories/SupabaseTransactionRepository.ts`: include `channel` field in save and in query result mapping
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 6.5 Update .env.example
    - Add `ADMIN_API_SECRET=` to `.env.example`
    - _Requirements: 3.4_

- [x] 7. Module wiring
  - [x] 7.1 Update InfrastructureModule
    - Modify `src/infrastructure/infrastructure.module.ts`:
    - Add `ConfigModule.forFeature(adminConfig)` to imports
    - Add `{ provide: 'UserRepository', useClass: SupabaseUserRepository }` and `{ provide: 'NotificationSender', useClass: TelegramNotificationSender }` to providers
    - Export `'UserRepository'` and `'NotificationSender'`
    - _Requirements: 1.1, 5.2_

  - [x] 7.2 Update ApplicationModule
    - Modify `src/application/application.module.ts`:
    - Add `CheckUserAccess`, `ApproveUser`, `BlockUser`, `ListPendingUsers` to providers and exports
    - _Requirements: 1.1, 5.1, 6.1, 4.1_

  - [x] 7.3 Update HttpModule
    - Modify `src/infrastructure/http/http.module.ts`:
    - Add `AdminUserController` to controllers array
    - Add `AdminSecretGuard` as a provider
    - _Requirements: 3.1, 4.1, 5.1, 6.1_

- [x] 8. Checkpoint — Full integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Property-based tests
  - [ ]* 9.1 Write property test for access check gating (Property 1)
    - **Property 1: Access check gates all message processing**
    - Generate random access statuses (`pending`/`blocked`), random messages — verify no downstream use case is called. For `whitelisted`, verify routing proceeds.
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 9.2 Write property test for new user registration (Property 2)
    - **Property 2: New users are always registered as pending**
    - Generate random (channel, channelUserId) pairs not in repository — verify creation with `pending` status and `isFirstMessage=true`
    - **Validates: Requirements 1.5, 2.1**

  - [ ]* 9.3 Write property test for access status trichotomy (Property 3)
    - **Property 3: Access status trichotomy**
    - Generate random user records — verify accessStatus is always one of `'whitelisted'`, `'pending'`, `'blocked'`
    - **Validates: Requirements 1.7**

  - [ ]* 9.4 Write property test for blocked equals pending reply (Property 4)
    - **Property 4: Blocked users receive the same reply as pending users**
    - Generate blocked and returning-pending users — verify identical reply text
    - **Validates: Requirements 2.4**

  - [ ]* 9.5 Write property test for admin guard correctness (Property 5)
    - **Property 5: Admin guard correctness**
    - Generate random strings for the secret header — verify pass iff exact match with configured secret
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 9.6 Write property test for approve-then-access (Property 6)
    - **Property 6: Approve then access is immediate**
    - Generate pending users, approve, verify next CheckUserAccess returns `allowed=true`
    - **Validates: Requirements 5.4**

  - [ ]* 9.7 Write property test for block-then-deny (Property 7)
    - **Property 7: Block then deny is immediate**
    - Generate whitelisted users, block, verify next CheckUserAccess returns `allowed=false`
    - **Validates: Requirements 6.4**

  - [ ]* 9.8 Write property test for approve idempotency (Property 8)
    - **Property 8: Approve is idempotent**
    - Generate already-whitelisted users, approve again — verify success and updated `whitelistedAt`
    - **Validates: Requirements 5.6**

  - [ ]* 9.9 Write property test for block idempotency (Property 9)
    - **Property 9: Block is idempotent**
    - Generate already-blocked users, block again — verify success without error
    - **Validates: Requirements 6.3**

  - [ ]* 9.10 Write property test for transaction channel round-trip (Property 10)
    - **Property 10: Transaction channel round-trip**
    - Generate random channel strings, save via RecordTransaction, retrieve — verify channel equality
    - **Validates: Requirements 9.1, 9.2, 9.4, 9.5**

  - [ ]* 9.11 Write property test for status filter correctness (Property 11)
    - **Property 11: Status filter returns only matching users**
    - Generate random user sets with mixed statuses, filter by each status — verify only matching users returned in `createdAt` order
    - **Validates: Requirements 4.1, 4.4**

  - [ ]* 9.12 Write property test for plan independence (Property 12)
    - **Property 12: Plan does not affect access decisions**
    - Generate whitelisted users with varying plan values — verify CheckUserAccess always returns `allowed=true`
    - **Validates: Requirements 10.2**

- [ ] 10. Unit tests
  - [ ]* 10.1 Write unit tests for CheckUserAccess
    - Create `test/usecases/check-user-access.spec.ts`
    - Test each branch: new user → pending/isFirstMessage, whitelisted → allowed, pending → denied, blocked → denied
    - Mock `UserRepository`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.7_

  - [ ]* 10.2 Write unit tests for BotService access check integration
    - Create `test/channels/bot-access-check.spec.ts`
    - Test: whitelisted user message proceeds to transaction recording
    - Test: first-time user receives welcome message, no downstream processing
    - Test: pending user receives pending message
    - Test: blocked user receives same message as pending (indistinguishable)
    - Test: DB failure sends "service unavailable" message
    - Mock `CheckUserAccess`, `ChannelAdapter`, `RecordTransaction`
    - _Requirements: 1.2, 1.3, 1.4, 1.6, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 10.3 Write unit tests for AdminSecretGuard
    - Create `test/guards/admin-secret-guard.spec.ts`
    - Test: valid secret → returns true
    - Test: invalid secret → throws UnauthorizedException
    - Test: missing header → throws UnauthorizedException
    - Test: empty header → throws UnauthorizedException
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 10.4 Write unit tests for AdminUserController
    - Create `test/controllers/admin-user-controller.spec.ts`
    - Test: GET /internal/admin/users returns pending users
    - Test: GET with status=whitelisted filters correctly
    - Test: GET with invalid status returns 400
    - Test: POST approve returns approved user with whitelistedAt
    - Test: POST approve unknown userId returns 404
    - Test: POST block returns blocked user
    - Test: POST block unknown userId returns 404
    - Mock `ApproveUser`, `BlockUser`, `ListPendingUsers`
    - _Requirements: 4.1, 4.3, 4.5, 5.1, 5.5, 6.1, 6.2_

  - [ ]* 10.5 Write unit tests for ApproveUser
    - Create `test/usecases/approve-user.spec.ts`
    - Test: success case updates status and sends notification
    - Test: user not found → NotFoundException
    - Test: notification failure → logs warning, still returns success
    - Test: already whitelisted → idempotent, updates whitelistedAt
    - Mock `UserRepository`, `NotificationSender`
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [ ]* 10.6 Write unit tests for BlockUser
    - Create `test/usecases/block-user.spec.ts`
    - Test: success case updates status to blocked
    - Test: user not found → NotFoundException
    - Test: already blocked → idempotent, returns current state
    - Mock `UserRepository`
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 11. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check`
- Unit tests validate specific examples and edge cases using Jest
- The `ChannelAdapter` interface's `sendText` method is reused by `TelegramNotificationSender` — no new bot connection needed
- The existing `SupabaseTransactionRepository` pattern is replicated for `SupabaseUserRepository`
- Access check is the first step in BotService (after the `id` debug command) — no middleware/interceptor needed
- The `plan` field is stored but never read by any service logic in this iteration

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 6, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8", "9.9", "9.10", "9.11", "9.12"] },
    { "id": 7, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5", "10.6"] }
  ]
}
```
