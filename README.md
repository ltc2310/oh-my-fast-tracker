# Oh My Fast Tracker

A Telegram chatbot that tracks personal expenses using natural Vietnamese language. Powered by NestJS, Supabase, and Google Gemini AI.

Type something like `ăn trưa 50k` and the bot parses the amount, detects the category, and saves it. Ask for a report anytime by typing `báo cáo`.

## Features

- **Natural Vietnamese input** — "ăn sáng 70k, grab 30k, gửi xe 10k" records 3 transactions at once
- **Abbreviation & slang support** — "cf 30k" (cà phê), "dt 500k" (điện thoại), "ts 30k" (trà sữa), informal spellings like "fở" (phở), and English keywords like "lunch", "gym", "parking"
- **AI-powered categorization** — Hybrid parser: enhanced keyword-based regex with abbreviation expansion, spelling normalization, emoji detection, and cross-segment linking for speed; Gemini Flash AI fallback for truly ambiguous cases
- **Enhanced regex parser** — Abbreviation expansion (cf, cp, dt, bv, st, ks, nt, ts), spelling normalization (f→ph, z→gi, w→qu), contextual emoji matching, cross-segment combination with connector verbs (hết, tốn, mất, trả, chi, xài, tiêu), longest-match category detection
- **Whitelist access control** — Only approved users can interact with the bot. New users auto-register as pending, admin approves/blocks via REST API. Approved users get a Telegram notification.
- **Past date support** — "hôm qua rửa xe 25k" saves with yesterday's `spent_at`
- **Flexible reporting** — "báo cáo tuần trước", "chi tiêu tháng này", "từ 1/6 đến 30/6"
- **Report webview** — generates a link with chart + detailed table
- **Excel report export** — Professional Vietnamese financial report with pie chart, category breakdown, transaction details, and alternating row styling (via `GET /api/report/export`)
- **Trend report** — Multi-month spending trend analysis (3–12 months) with half-period comparison algorithm, per-category trend detection (increasing/decreasing/stable), top growing/shrinking categories, and incomplete data warnings. Available via API JSON, Excel export (multi-tab workbook with overview + monthly detail tabs), and Telegram bot ("báo cáo 6 tháng", "xu hướng chi tiêu")
- **13 Vietnamese categories** — Ăn uống, Di chuyển, Mua sắm, Nhà ở, Tiện ích, Internet, Sức khỏe, Giáo dục, Giải trí, Con cái, Chi phí cố định, Thu nhập, Khác

## Architecture

NestJS + Clean Architecture (domain → application → infrastructure).

```
src/
  domain/           ← Pure interfaces, no dependencies
    entities/         Transaction, WeeklySummary, MonthlyBreakdown, CategoryTrend, TrendReport, User
    ports/            ChannelAdapter, Parser, TokenService, TransactionRepository, UserRepository, NotificationSender

  application/      ← Use cases, depends only on domain ports
    usecases/
      RecordTransaction.ts      parse + save expense(s)
      GenerateWeeklyReport.ts   aggregate by date range
      GenerateTrendReport.ts    multi-month trend analysis
      CheckUserAccess.ts        access gate (whitelist check + auto-register)
      ApproveUser.ts            approve pending user + notify
      BlockUser.ts              block a user
      ListPendingUsers.ts       list users by status
    services/
      ExcelGeneratorService.ts       generate weekly .xlsx reports
      ExcelTrendGeneratorService.ts  generate trend .xlsx (multi-tab)
      TrendAnalysisService.ts        half-period comparison algorithm
      filename-formatter.ts          format export filenames
      vnd-formatter.ts               format VND currency strings

  infrastructure/   ← Concrete implementations
    auth/             JwtTokenService
    channels/         TelegramAdapter, TelegramNotificationSender, BotService
    config/           NestJS ConfigModule (app, telegram, supabase, auth, ai, admin)
    parsers/          RegexParser, AIParser, HybridParser
    repositories/     SupabaseTransactionRepository, SupabaseUserRepository
    http/
      controllers/    HealthController, ReportController, ExportController, TrendReportController, AdminUserController
      guards/         AdminSecretGuard
      http.module.ts

  app.module.ts     ← Root NestJS module
  main.ts           ← Bootstrap
```

## How it works

```
User message → TelegramAdapter → BotService
  ├─ /id command?    → Reply with chat ID
  ├─ Access check    → CheckUserAccess (whitelist gate)
  │     ├─ New user?     → Create as pending, send welcome message
  │     ├─ Pending/Blocked? → Send "waiting for approval" message
  │     └─ Whitelisted?  → Continue ↓
  ├─ Trend request?  → GenerateTrendReport → send summary + links
  ├─ Report request? → GenerateWeeklyReport → send summary + link
  └─ Expense?        → HybridParser → RecordTransaction → save to Supabase
                          ├─ RegexParser (fast, free, keywords)
                          └─ AIParser (Gemini Flash, semantic fallback)
```

## Setup

### Prerequisites

- Node.js 18+
- A Telegram bot token (from @BotFather)
- A Supabase project
- A Google Gemini API key (from https://aistudio.google.com/apikey)

### Install & run

```bash
npm install
cp .env.example .env   # fill in all values
npm run migrate        # apply SQL schema to Supabase
npm run start:dev      # development with hot-reload
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `DATABASE_URL` | PostgreSQL connection string (for migrations) |
| `REPORT_TOKEN_SECRET` | Secret for signing report JWT tokens |
| `WEBVIEW_BASE_URL` | URL of the expense-report-web frontend |
| `CORS_ORIGIN` | Allowed CORS origin for the API |
| `PORT` | API server port (default: 3000) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_MODEL` | Gemini model (default: gemini-2.0-flash-lite) |
| `ADMIN_API_SECRET` | Secret for Admin API authentication (X-Admin-Secret header) |

### Database schema

```sql
transactions (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  amount      numeric NOT NULL,
  category    text NOT NULL,
  note        text,
  channel     text NOT NULL DEFAULT 'telegram',
  spent_at    timestamptz NOT NULL DEFAULT now(),  -- actual spending date
  created_at  timestamptz NOT NULL DEFAULT now()   -- record creation date
)

users (
  id                uuid PRIMARY KEY,
  channel           text NOT NULL,
  channel_user_id   text NOT NULL,
  channel_username  text,
  access_status     text NOT NULL DEFAULT 'pending',  -- pending | whitelisted | blocked
  plan              text NOT NULL DEFAULT 'free',     -- free | pro | max
  whitelisted_at    timestamptz,
  plan_updated_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel, channel_user_id)
)
```

### Database migrations

```bash
npm run migrate   # applies all SQL files in order

# Migration files:
# sql/schema.sql                        — base transactions table
# sql/002-whitelist-access-control.sql  — users table + indexes
# sql/003-backfill-whitelist.sql        — backfill existing users as whitelisted
```

### Seed mock data (for testing trend report)

```bash
# Insert 150 transactions (3 months × 50) for user 7046661244
# Run sql/seed-trend-mock.sql in Supabase SQL Editor
```

## Bot commands (via chat)

| Message | Action |
|---------|--------|
| `/id` | Show your Telegram chat ID |
| `ăn trưa 50k` | Record expense (today) |
| `hôm qua grab 30k` | Record expense (yesterday) |
| `3 ngày trước cafe 25k` | Record expense (3 days ago) |
| `ăn sáng 70k, rửa xe 30k` | Record multiple expenses |
| `báo cáo` | Report last 7 days |
| `báo cáo tuần trước` | Report previous week |
| `chi tiêu tháng này` | Report current month |
| `chi tiêu tháng trước` | Report previous month |
| `chi tiêu 3 ngày qua` | Report last 3 days |
| `chi tiêu từ 1/6 đến 30/6` | Report specific date range |
| `cf 30k` | Abbreviation: cà phê → Ăn uống |
| `ts 30k` | Abbreviation: trà sữa → Ăn uống |
| `dt 500k` | Abbreviation: điện thoại → Tiện ích |
| `fở 50k` | Informal spelling (phở → Ăn uống) |
| `lunch 50k` | English keyword → Ăn uống |
| `đi ăn, hết 200k` | Cross-segment: keyword + connector verb + amount |
| `báo cáo 6 tháng` | Trend report for last 6 months |
| `xu hướng chi tiêu 3 tháng` | Trend report for last 3 months |
| `báo cáo xu hướng` | Trend report (default 6 months) |
| `gửi báo cáo` | Send report via email (planned) |
| `định mức ăn uống 5tr` | Set category budget limit (planned) |
| `xem định mức` | View budget status (planned) |

## API Endpoints

### Public APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/report?token=xxx` | Get weekly report data (used by webview) |
| GET | `/api/report/export?token=xxx` | Download weekly Excel report (.xlsx) |
| GET | `/api/report/trend?token=xxx&months=6&endMonth=2026-07` | Get trend report JSON (3–12 months) |
| GET | `/api/report/trend/export?token=xxx&months=6&endMonth=2026-07` | Download trend Excel report (.xlsx) |

### Admin APIs (require `X-Admin-Secret` header)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/internal/admin/users` | List users (default: pending) |
| GET | `/internal/admin/users?status=whitelisted` | List whitelisted users |
| GET | `/internal/admin/users?status=blocked` | List blocked users |
| POST | `/internal/admin/users/:userId/approve` | Approve a pending user |
| POST | `/internal/admin/users/:userId/block` | Block a user |

#### Admin API Examples

```bash
# List pending users
curl http://localhost:3000/internal/admin/users \
  -H "X-Admin-Secret: $ADMIN_API_SECRET"

# Approve a user
curl -X POST http://localhost:3000/internal/admin/users/{userId}/approve \
  -H "X-Admin-Secret: $ADMIN_API_SECRET"

# Block a user
curl -X POST http://localhost:3000/internal/admin/users/{userId}/block \
  -H "X-Admin-Secret: $ADMIN_API_SECRET"
```

#### Admin API Responses

```json
// GET /internal/admin/users
{
  "users": [
    {
      "id": "uuid",
      "channel": "telegram",
      "channelUserId": "7046661244",
      "channelUsername": "john_doe",
      "accessStatus": "pending",
      "createdAt": "2025-07-30T10:00:00.000Z"
    }
  ]
}

// POST /internal/admin/users/:userId/approve
{
  "id": "uuid",
  "accessStatus": "whitelisted",
  "whitelistedAt": "2025-07-30T10:05:00.000Z"
}

// POST /internal/admin/users/:userId/block
{
  "id": "uuid",
  "accessStatus": "blocked"
}
```

### Trend Report API Details

**Query parameters:**
- `token` (required) — JWT report token
- `months` (optional, default: 6) — Number of months to analyze (3–12)
- `endMonth` (optional, default: current month) — End month in YYYY-MM format

**Error codes:**
- `401 INVALID_TOKEN` — Missing or invalid token
- `400 MONTHS_BELOW_MINIMUM` — months < 3
- `400 MONTHS_LIMIT_EXCEEDED` — months > 12

## Access Control Flow

1. **New user** messages the bot → auto-registered as `pending` → receives welcome message
2. **Admin** reviews pending users via `GET /internal/admin/users`
3. **Admin** approves via `POST /internal/admin/users/:id/approve`
4. **User** receives Telegram notification that their account is activated
5. **User** can now record expenses and view reports

Users who are `pending` or `blocked` receive a polite message and cannot use the bot.

## Testing

```bash
npm test              # run all tests (248 tests across 14 suites)
npm run test:watch    # watch mode
```

## Roadmap

- [x] **Trend report** — Multi-month spending analysis with half-period comparison, per-category trends, Excel multi-tab export, and Telegram bot routing. *(completed)*
- [x] **Trend report web UI** — Frontend page at `/trend?token=xxx` to visualize trend data with charts (line chart for monthly totals, bar chart for category breakdown). Backend API is ready.
- [x] **Whitelist access control** — Only approved users can use the bot. New users auto-register as pending, admin approves/blocks via REST API with `X-Admin-Secret` auth. Approved users get a Telegram notification. *(completed)*
- [ ] **Email report delivery** — Send expense reports via email with Excel attachment and professional HTML body. Users trigger via "gửi báo cáo" phrases. Email collected on first use and saved permanently. *(spec complete, implementation pending)*
- [ ] **Category budget limits & alerts** — Set monthly spending caps per category (e.g., "định mức ăn uống 5tr"). Bot warns inline at 80% usage, alerts at 100% with option to update limit. View budget status via "xem định mức". *(spec in progress)*
- [ ] **Month-over-month comparison** — "so sánh tháng 7 với tháng 8" shows spending comparison by category between two months
- [ ] **Recurring expenses** — auto-detect and track fixed monthly costs
- [ ] **Multi-channel support** — ZaloAdapter (interface is ready)
- [ ] **Production deployment** — Render/Railway with webhook mode for Telegram
