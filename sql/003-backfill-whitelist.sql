-- Backfill: whitelist all existing users who have recorded transactions
-- Depends on: sql/002-whitelist-access-control.sql (adds access_status, plan, whitelisted_at columns)

-- Insert whitelisted records for all distinct user_id values from transactions table
INSERT INTO users (channel, channel_user_id, access_status, plan, whitelisted_at)
SELECT DISTINCT 'telegram', user_id, 'whitelisted', 'free', now()
FROM transactions
WHERE user_id IS NOT NULL
ON CONFLICT (channel, channel_user_id) DO NOTHING;

-- Upsert test user 7046661244 as whitelisted (force update even if already exists)
INSERT INTO users (channel, channel_user_id, access_status, plan, whitelisted_at)
VALUES ('telegram', '7046661244', 'whitelisted', 'free', now())
ON CONFLICT (channel, channel_user_id)
DO UPDATE SET access_status = 'whitelisted', whitelisted_at = now(), updated_at = now();
