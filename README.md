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
- **14 Vietnamese categories** — Ăn uống, Di chuyển, Mua sắm, Nhà ở, Tiện ích, Internet, Sức khỏe, Giáo dục, Giải trí, Con cái, Chi phí cố định, Tiết kiệm & Đầu tư, Thu nhập, Khác
- **Income tracking** — "lương 20tr", "thưởng 5tr" stored as negative amounts to separate income from expenses in reports
- **Undo / Edit / Delete** — "xoá" removes last transaction, "sửa thành 30k" edits amount, "sửa thành ăn uống" changes category, "sửa ngày hôm qua" changes date, or combine: "sửa thành cà phê 25k hôm qua"
- **Proactive notifications** — Automated scheduled messages via `@nestjs/schedule`: conditional daily reminder (only if no transaction logged today), weekly digest (Sunday summary with top categories and week-over-week comparison), monthly summary (category breakdown and budget status). Each notification type is independently opt-in/opt-out per user.
- **Voice message input** — Send a voice message describing your expense in Vietnamese → Gemini 2.0 Flash multimodal transcribes and extracts amount, category, note → confirmation flow before saving
- **Bank transfer screenshot** — Send a screenshot of a bank transfer → Gemini 2.0 Flash multimodal OCR extracts amount, recipient, bank → confirmation flow before saving

## Architecture

NestJS + Clean Architecture (domain → application → infrastructure).

```
src/
  domain/           ← Pure interfaces, no dependencies
    constants/        income-categories (income category set)
    entities/         Transaction, WeeklySummary, MonthlyBreakdown, CategoryTrend, TrendReport, User, NotificationPreference
    ports/            ChannelAdapter, Parser, TokenService, TransactionRepository, UserRepository, NotificationSender, NotificationPreferenceRepository

  application/      ← Use cases, depends only on domain ports
    usecases/
      RecordTransaction.ts      parse + save expense(s)
      GenerateWeeklyReport.ts   aggregate by date range
      GenerateTrendReport.ts    multi-month trend analysis
      UndoLastTransaction.ts    delete most recent transaction
      DeleteTransaction.ts      delete by ID with ownership check
      EditTransaction.ts        edit amount/category/note
      CheckUserAccess.ts        access gate (whitelist check + auto-register)
      ApproveUser.ts            approve pending user + notify
      BlockUser.ts              block a user
      ListPendingUsers.ts       list users by status
      SendDailyReminder.ts      send conditional daily reminder
      SendWeeklyDigest.ts       send weekly spending digest
      SendMonthlySummary.ts     send monthly spending summary
    services/
      ExcelGeneratorService.ts       generate weekly .xlsx reports
      ExcelTrendGeneratorService.ts  generate trend .xlsx (multi-tab)
      TrendAnalysisService.ts        half-period comparison algorithm
      NotificationScheduler.ts       cron-based notification scheduling
      filename-formatter.ts          format export filenames
      vnd-formatter.ts               format VND currency strings

  infrastructure/   ← Concrete implementations
    auth/             JwtTokenService
    channels/         TelegramAdapter, TelegramNotificationSender, BotService
    config/           NestJS ConfigModule (app, telegram, supabase, auth, ai, admin, notification)
    parsers/          RegexParser, AIParser, HybridParser
    repositories/     SupabaseTransactionRepository, SupabaseUserRepository, SupabaseNotificationPreferenceRepository
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
  ├─ /start command? → Send onboarding message + continue to access check
  ├─ id command?     → Reply with chat ID
  ├─ Access check    → CheckUserAccess (whitelist gate)
  │     ├─ New user?     → Create as pending, send welcome message
  │     ├─ Pending/Blocked? → Send "waiting for approval" message
  │     └─ Whitelisted?  → Continue ↓
  ├─ /help command?  → Send command reference
  ├─ Voice message?  → GeminiMultimodalParser.parseVoice → ConfirmationManager → confirm
  ├─ Photo message?  → GeminiMultimodalParser.parseImage → ConfirmationManager → confirm
  ├─ Pending confirm? → handleConfirmation (ok/đổi/bỏ)
  ├─ Notification prefs? → bật/tắt nhắc nhở, báo cáo tuần/tháng, xem thông báo
  ├─ Undo/Delete?    → UndoLastTransaction → confirm deletion
  ├─ Edit?           → EditIntentDetector → EditTransaction → confirm update
  ├─ Trend request?  → GenerateTrendReport → send summary + links
  ├─ Report request? → GenerateWeeklyReport → send summary + link
  └─ Expense?        → HybridParser → RecordTransaction → save to Supabase
                          ├─ RegexParser (fast, free, keywords)
                          └─ AIParser (Gemini Flash, semantic fallback)

Scheduled notifications (via @nestjs/schedule):
  NotificationScheduler
  ├─ Daily 20:00    → SendDailyReminder → remind if no transactions today
  ├─ Sunday 20:00   → SendWeeklyDigest → weekly spending summary
  └─ Last day 20:00 → SendMonthlySummary → monthly category breakdown
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
| `GEMINI_MULTIMODAL_MODEL` | Gemini model for voice/image parsing (default: gemini-2.0-flash) |
| `ADMIN_API_SECRET` | Secret for Admin API authentication (X-Admin-Secret header) |
| `DAILY_REMINDER_CRON` | Cron for daily reminder (default: `0 20 * * *` — 8 PM daily) |
| `WEEKLY_DIGEST_CRON` | Cron for weekly digest (default: `0 20 * * 0` — 8 PM Sunday) |
| `MONTHLY_SUMMARY_CRON` | Cron for monthly summary (default: `0 20 L * *` — 8 PM last day of month) |

### Database schema

```sql
transactions (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  amount      numeric NOT NULL,       -- positive = expense, negative = income
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

notification_preferences (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) UNIQUE,
  daily_reminder   boolean NOT NULL DEFAULT true,
  weekly_digest    boolean NOT NULL DEFAULT true,
  monthly_summary  boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
)
```

### Database migrations

```bash
npm run migrate   # applies all SQL files in order

# Migration files:
# sql/schema.sql                        — base transactions table
# sql/002-whitelist-access-control.sql  — users table + indexes
# sql/003-backfill-whitelist.sql        — backfill existing users as whitelisted
# sql/004-notification-preferences.sql  — notification_preferences table + backfill
```

### Seed mock data (for testing trend report)

```bash
# Insert 150 transactions (3 months × 50) for user 7046661244
# Run sql/seed-trend-mock.sql in Supabase SQL Editor
```

## Bot commands (via chat)

| Message | Action |
|---------|--------|
| `/start` | Onboarding: introduce the bot + examples |
| `/help` | Show full command reference |
| `id` | Show your Telegram chat ID |
| `ăn trưa 50k` | Record expense (today) |
| `hôm qua grab 30k` | Record expense (yesterday) |
| `3 ngày trước cafe 25k` | Record expense (3 days ago) |
| `ăn sáng 70k, rửa xe 30k` | Record multiple expenses |
| `lương 20tr` | Record income (stored as negative amount) |
| `xoá` / `huỷ` / `undo` | Delete last recorded transaction |
| `sửa thành 30k` | Edit last transaction's amount |
| `sửa thành ăn uống` | Edit last transaction's category |
| `sửa ngày hôm qua` | Edit last transaction's date |
| `sửa thành cà phê 25k hôm qua` | Edit multiple fields at once |
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
| `bật nhắc nhở` | Enable daily reminder notification |
| `tắt nhắc nhở` | Disable daily reminder notification |
| `bật báo cáo tuần` | Enable weekly digest notification |
| `tắt báo cáo tuần` | Disable weekly digest notification |
| `bật báo cáo tháng` | Enable monthly summary notification |
| `tắt báo cáo tháng` | Disable monthly summary notification |
| `xem thông báo` | View current notification preferences |
| 🎤 Gửi voice message | Record expense via voice (Vietnamese) |
| 📸 Gửi ảnh chuyển khoản | Record expense from bank transfer screenshot |
| `ok` / `lưu` | Confirm and save pending voice/photo transaction |
| `đổi danh mục [tên]` | Change category of pending transaction |
| `đổi số tiền [số]` | Change amount of pending transaction |
| `bỏ` | Cancel pending voice/photo transaction |

## API Endpoints

### Public APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/report?token=xxx` | Get weekly report data (used by webview) |
| GET | `/api/report/export?token=xxx` | Download weekly Excel report (.xlsx) |
| GET | `/api/report/trend?token=xxx&months=6&endMonth=2026-07` | Get trend report JSON (3–12 months) |
| GET | `/api/report/trend/export?token=xxx&months=6&endMonth=2026-07` | Download trend Excel report (.xlsx) |
| GET | `/api/report/compare?token=xxx&monthA=7&yearA=2025&monthB=8&yearB=2025` | Get month comparison JSON |
| GET | `/api/report/compare/export?token=xxx&monthA=7&yearA=2025&monthB=8&yearB=2025` | Download comparison Excel report (.xlsx) |

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

### Compare Report API Details

#### GET /api/report/compare

Compare spending between two months.

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| token | Yes | JWT report token |
| monthA | Yes | First month (1-12) |
| yearA | Yes | First month's year |
| monthB | Yes | Second month (1-12) |
| yearB | Yes | Second month's year |

**Sample Request:**
```
GET /api/report/compare?token=xxx&monthA=7&yearA=2025&monthB=8&yearB=2025
```

**Sample Response:**
```json
{
  "userId": "user-123",
  "monthA": {
    "month": 7,
    "year": 2025,
    "label": "Tháng 7/2025",
    "totalSpent": 5000000,
    "transactionCount": 15,
    "byCategory": { "Ăn uống": 2000000, "Di chuyển": 1500000 }
  },
  "monthB": {
    "month": 8,
    "year": 2025,
    "label": "Tháng 8/2025",
    "totalSpent": 6000000,
    "transactionCount": 18,
    "byCategory": { "Ăn uống": 2500000, "Di chuyển": 1800000 }
  },
  "totalDifference": 1000000,
  "totalPercentChange": 20.0,
  "categoryDiffs": [
    {
      "category": "Ăn uống",
      "amountA": 2000000,
      "amountB": 2500000,
      "absoluteDiff": 500000,
      "percentChange": 25.0
    }
  ],
  "generatedAt": "2025-07-15T10:00:00.000Z"
}
```

**Error Responses:**
| Status | Error Code | Description |
|--------|-----------|-------------|
| 401 | INVALID_TOKEN | Missing or invalid token |
| 400 | MISSING_YEAR | yearA or yearB not provided |
| 400 | INVALID_MONTH | monthA or monthB outside 1-12 |
| 400 | SAME_MONTH | Both months are the same |
| 500 | INTERNAL_ERROR | Unexpected server error |

#### GET /api/report/compare/export

Export month comparison as Excel file.

**Query Parameters:** Same as GET /api/report/compare

**Response:** Excel file (.xlsx) with Content-Disposition attachment header.

Filename pattern: `so-sanh-thang-{monthA}-{yearA}-vs-{monthB}-{yearB}.xlsx`

## Access Control Flow

1. **New user** messages the bot → auto-registered as `pending` → receives welcome message
2. **Admin** reviews pending users via `GET /internal/admin/users`
3. **Admin** approves via `POST /internal/admin/users/:id/approve`
4. **User** receives Telegram notification that their account is activated
5. **User** can now record expenses and view reports

Users who are `pending` or `blocked` receive a polite message and cannot use the bot.

## Testing

```bash
npm test              # run all tests (265 tests across 18 suites)
npm run test:watch    # watch mode
```

## Roadmap

- [x] **Trend report** — Multi-month spending analysis with half-period comparison, per-category trends, Excel multi-tab export, and Telegram bot routing. *(completed)*
- [x] **Trend report web UI** — Frontend page at `/trend?token=xxx` to visualize trend data with charts (line chart for monthly totals, bar chart for category breakdown). Backend API is ready.
- [x] **Whitelist access control** — Only approved users can use the bot. New users auto-register as pending, admin approves/blocks via REST API with `X-Admin-Secret` auth. Approved users get a Telegram notification. *(completed)*
- [x] **Income/expense sign fix** — Income categories (Thu nhập, Tiết kiệm & Đầu tư) stored with negative amounts. Reports correctly separate income from expenses. *(completed)*
- [x] **Undo / Edit / Delete transactions** — "xoá", "sửa thành 30k", "sửa thành ăn uống", "sửa ngày hôm qua". Natural language edit with hybrid regex + AI detection. Repository supports findById, findLastByUser, update, deleteById. *(completed)*
- [x] **/start & /help commands** — Onboarding message for new users, full command reference for whitelisted users. *(completed)*
- [ ] **Email report delivery** — Send expense reports via email with Excel attachment and professional HTML body. Users trigger via "gửi báo cáo" phrases. Email collected on first use and saved permanently. *(spec complete, implementation pending)*
- [ ] **Category budget limits & alerts** — Set monthly spending caps per category (e.g., "định mức ăn uống 5tr"). Bot warns inline at 80% usage, alerts at 100% with option to update limit. View budget status via "xem định mức". *(spec complete, implementation pending)*
- [x] **Proactive notifications** — Daily reminder (conditional), weekly digest, monthly summary via @nestjs/schedule. Per-user opt-in/opt-out with Vietnamese chat commands. *(completed)*
- [x] **Month-over-month comparison** — "so sánh tháng 7 với tháng 8" shows spending comparison by category between two months
- [x] **Voice message support** — Telegram voice → Gemini 2.0 Flash multimodal transcription + expense extraction → confirmation flow *(completed)*
- [x] **Bank transfer screenshot** — Gửi ảnh chuyển khoản ngân hàng để bot tự nhận dạng số tiền, người nhận, ngân hàng via Gemini 2.0 Flash multimodal + confirmation flow *(completed)*
- [ ] **Recurring expenses** — auto-detect and track fixed monthly costs
- [ ] **Multi-channel support** — ZaloAdapter (interface is ready)
- [ ] **Production deployment** — Render/Railway with webhook mode for Telegram
