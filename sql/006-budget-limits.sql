-- 006-budget-limits.sql
-- Create budget_limits table for per-user monthly category spending caps.

CREATE TABLE IF NOT EXISTS budget_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  category text NOT NULL,
  monthly_limit numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_budget_user_category UNIQUE (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_budget_limits_user_id ON budget_limits(user_id);
