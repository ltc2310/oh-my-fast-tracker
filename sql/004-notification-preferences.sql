-- 004-notification-preferences.sql
-- Create notification_preferences table for per-user opt-in/opt-out of scheduled notifications.
-- Depends on: sql/002-whitelist-access-control.sql (users table with access_status column)

-- Create notification_preferences table
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

-- Index for efficient lookup by user_id
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id
  ON notification_preferences(user_id);

-- Backfill: create default preferences for existing whitelisted users
INSERT INTO notification_preferences (user_id, daily_reminder, weekly_digest, monthly_summary)
SELECT id, true, true, true
FROM users
WHERE access_status = 'whitelisted'
  AND id NOT IN (SELECT user_id FROM notification_preferences)
ON CONFLICT (user_id) DO NOTHING;

-- Database function to find eligible users for a notification type.
-- Handles the "no preference record = all enabled" default (opt-in by default).
CREATE OR REPLACE FUNCTION get_eligible_notification_users(notification_column text)
RETURNS TABLE(id uuid, channel_user_id text) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.channel_user_id
  FROM users u
  LEFT JOIN notification_preferences np ON np.user_id = u.id
  WHERE u.access_status = 'whitelisted'
    AND (
      np.user_id IS NULL
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
