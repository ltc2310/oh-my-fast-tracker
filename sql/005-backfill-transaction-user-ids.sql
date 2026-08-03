-- 005-backfill-transaction-user-ids.sql
-- Migrates transactions.user_id from Telegram chat IDs (text) to internal users.id (UUID).
-- Depends on: sql/002-whitelist-access-control.sql (users table with channel_user_id)
--
-- Before this migration, transactions were saved with the Telegram chat ID as user_id.
-- After this migration, transactions.user_id contains the UUID from users.id,
-- matching the notification_preferences.user_id foreign key convention.
--
-- This is a DATA migration — run it ONCE after deploying the code fix.

-- Step 1: Update transactions where user_id matches a known channel_user_id in users table.
-- Only update rows that look like telegram chat IDs (numeric strings, not UUIDs).
UPDATE transactions t
SET user_id = u.id::text
FROM users u
WHERE t.user_id = u.channel_user_id
  AND u.channel = 'telegram'
  AND t.user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Step 2: Report any orphaned transactions (chat IDs with no matching user).
-- These would need manual resolution or deletion.
-- SELECT DISTINCT user_id FROM transactions
-- WHERE user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
