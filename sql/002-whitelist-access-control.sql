-- 002-whitelist-access-control.sql
-- Add access control columns to users table and channel column to transactions table.

-- Add access control columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS channel_username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS whitelisted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_updated_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Add channel column to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'telegram';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_access_status ON users(access_status);
CREATE INDEX IF NOT EXISTS idx_transactions_channel_user ON transactions(channel, user_id);
