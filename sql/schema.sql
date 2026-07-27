create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  channel_user_id text not null,
  created_at timestamptz not null default now(),
  unique (channel, channel_user_id)
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  amount numeric not null,
  category text not null,
  note text,
  spent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_spent
  on transactions (user_id, spent_at);
