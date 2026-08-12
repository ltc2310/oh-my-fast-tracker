# Oh My Fast Tracker

A Telegram chatbot that tracks personal expenses using natural Vietnamese language. Powered by NestJS, Supabase, and Google Gemini AI.

Type something like `ăn trưa 50k` and the bot parses the amount, detects the category, and saves it. Ask for a report anytime by typing `báo cáo`.

## Features

- **Natural Vietnamese input** — "ăn sáng 70k, grab 30k, gửi xe 10k" records 3 transactions at once
- **Abbreviation & slang support** — "cf 30k" (cà phê), "dt 500k" (điện thoại), "ts 30k" (trà sữa), informal spellings like "fở" (phở), and English keywords like "lunch", "gym", "parking"
- **Brand & chain recognition** — ~230 well-known Vietnamese brands map straight to a category with no AI call: "kfc 120k", "phúc long 65k", "haidilao 800k", "circle k 45k", "bách hoá xanh 250k" → Ăn uống; "xanh sm 45k" → Di chuyển; "shopee 350k" → Mua sắm; "cgv 120k" → Giải trí; "pharmacity 95k" → Sức khỏe; "viettel 200k" → Internet. Longest-match disambiguation handles overlaps: "lotte" → Ăn uống but "lotte cinema" → Giải trí; "grab" → Di chuyển but "grabfood" → Ăn uống
- **AI-powered categorization** — Hybrid parser: enhanced keyword-based regex with abbreviation expansion, spelling normalization, emoji detection, and cross-segment linking for speed; Gemini Flash AI fallback for truly ambiguous cases
- **Enhanced regex parser** — Brand/chain table matched against raw text, abbreviation expansion (cf, cp, dt, bv, st, ks, nt, ts), spelling normalization (f→ph, z→gi, w→qu), contextual emoji matching, cross-segment combination with connector verbs (hết, tốn, mất, trả, chi, xài, tiêu), longest-match category detection across both brands and keywords
- **Validated AI output** — Categories returned by Gemini are funnelled through a canonical whitelist (`normalizeCategory`), and amounts are rejected unless finite and positive. Prevents hallucinated categories and `NaN` amounts from reaching the database
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
- **List transactions in chat** — "hôm nay chi gì", "5 khoản gần nhất", "hôm qua chi gì" to view transaction details without opening the web dashboard
- **Inline keyboard** — Confirmation flow (voice/ảnh) with tap-to-confirm buttons (Lưu, Đổi danh mục, Đổi số tiền, Huỷ). After recording an expense, inline [✏️ Sửa] [🗑 Xoá] buttons appear for quick edit/delete. Category selection via 14-button keyboard. Delete confirmation via inline buttons.
- **Budget limits per category** — "định mức ăn uống 5tr" sets monthly spending cap. Inline warnings at 80% (⚠️) and 100% (🚨) usage. "xem định mức" shows all budgets with % progress.
- **Delete by keyword** — "xoá khoản cà phê" finds matching transactions and presents inline keyboard for selection. Supports multiple matches with numbered list.
- **Admin chat commands** — `/pending`, `/approve <id>`, `/approve all`, `/block <id>`, `/stats` for admin users (configured via `ADMIN_CHAT_IDS` env var). Auto-notification to admins when new users register.

## Architecture

NestJS + Clean Architecture (domain → application → infrastructure).

```
src/
  domain/           ← Pure interfaces, no dependencies
    constants/        categories (canonical 14 + normalizeCategory), income-categories
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
      ConfirmationManager.ts         pending voice/photo confirmations (in-memory, 5 min TTL)
      PendingEditManager.ts          tracks which transaction an inline edit targets

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

### ⚠️ The two-ID rule (read before touching BotService)

There are two different user identifiers in this codebase. Mixing them up silently
splits a user's data in half and disables every ownership check:

| ID | Value | Used for |
|----|-------|----------|
| `channelUserId` | Telegram chat ID, e.g. `"7046661244"` | **Only** sending messages back to the user (`channelAdapter.sendText`, `answerCallbackQuery`) |
| `internalUserId` | `users.id` UUID | **Everything else** — all use cases, all repositories, report token payloads |

Rules:

1. Every private handler in `BotService` takes **both**, named `channelUserId` and `internalUserId`.
2. Never pass `channelUserId` to a use case or repository.
3. Inline keyboard callbacks only carry `channelUserId`. Resolve the internal ID via
   `resolveInternalUserId(channel, channelUserId)` before touching persisted data.
4. Never call `transactionRepository.deleteById()` from `BotService` — use the
   `DeleteTransaction` use case, which verifies ownership.

This is enforced by `test/channels/bot-userid-contract.spec.ts`, which drives every
command path with deliberately different values for the two IDs and asserts each one
lands in the right place. If you add a command, add it there too.

### Categories: one source of truth

`src/domain/constants/categories.ts` owns the canonical list of 14 categories. Nothing
else may declare its own copy.

| Helper | Use |
|--------|-----|
| `CATEGORIES` | The canonical array. Used to build inline keyboards and error messages |
| `isValidCategory(s)` | Type guard for exact canonical names |
| `normalizeCategory(s)` | Coerce arbitrary text (AI output) into a canonical name, falling back to `Khác` |

Every AI parser (`AIParser`, `GeminiMultimodalParser`) runs its output through
`normalizeCategory()` before returning. This is not optional: the multimodal prompt once
emitted `"Tiết kiệm"` instead of `"Tiết kiệm & Đầu tư"`, which is not a canonical name, so
`isIncomeCategory()` returned false and savings were persisted as **positive expenses**.

`test/domain/categories.spec.ts` asserts every entry of `INCOME_CATEGORIES` is a valid
category, so that mismatch cannot recur.

### Category resolution pipeline

`resolveCategory(text)` in `RegexParser` is the shared entry point used by both the parser
and the bot layer:

```
raw text
  ├─ BRAND_KEYWORDS   ← matched against RAW lowercase text
  └─ CATEGORY_KEYWORDS ← matched after expandAbbreviations + normalizeSpelling
       ↓
   longest match wins (brands win ties)
```

Brands are matched against raw text on purpose. `normalizeSpelling` rewrites word-initial
`f→ph`, `z→gi`, `w→qu`, which would turn `fpt` into `phpt`, `zara` into `giara` and
`watsons` into `quatsons`. `test/parsers/regex-parser-brands.spec.ts` pins this behaviour.

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
                          ├─ RegexParser (fast, free)
                          │    ├─ BRAND_KEYWORDS   (kfc, phúc long, haidilao, ...)
                          │    └─ CATEGORY_KEYWORDS (ăn, grab, xăng, ...)
                          └─ AIParser (Gemini, semantic fallback — only when
                             no brand/keyword matched; output normalized
                             through the canonical category list)

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
| `ADMIN_CHAT_IDS` | Comma-separated Telegram chat IDs of admin users (for /pending, /approve, /block, /stats commands) |
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

budget_limits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id),
  category         text NOT NULL,
  monthly_limit    numeric NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, category)
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
| `kfc 120k` | Brand → Ăn uống |
| `phúc long 65k` | Brand → Ăn uống (works with or without diacritics) |
| `haidilao 800k` | Brand → Ăn uống |
| `circle k 45k` | Brand → Ăn uống |
| `bách hoá xanh 250k` | Brand → Ăn uống |
| `xanh sm 45k` | Brand → Di chuyển |
| `shopee 350k` | Brand → Mua sắm |
| `cgv 120k` | Brand → Giải trí |
| `pharmacity 95k` | Brand → Sức khỏe |
| `lotte cinema 120k` | Brand → Giải trí (beats bare `lotte` → Ăn uống) |
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
| `hôm nay chi gì` | List today's expenses with time |
| `chi tiêu hôm nay` | Same as above (alternate phrasing) |
| `hôm qua chi gì` | List yesterday's expenses |
| `chi tiêu hôm qua` | Same as above (alternate phrasing) |
| `5 khoản gần nhất` | List N most recent transactions |
| `lịch sử 3` | List 3 most recent transactions |
| `xem 7 khoản` | List 7 most recent transactions |
| [✏️ Sửa] button | After recording — tap to edit amount/category/date of **that** transaction |
| [🗑 Xoá] button | After recording — tap to delete immediately |
| `xoá khoản vừa rồi` | Delete last transaction (also: `xoá khoản cuối`, `xoá khoản gần nhất`) |
| `xoá khoản cà phê` | Find and delete a transaction by keyword |
| `xoá khoản grab hôm qua` | Delete specific transaction with keyword + date |
| `định mức ăn uống 5tr` | Set monthly budget limit for a category |
| `định mức mua sắm 2000000` | Same, with a full number instead of a unit |
| `xem định mức` | View all budget limits with % usage |
| `xoá định mức ăn uống` | Remove budget limit for a category |
| `/pending` | (Admin) List pending users |
| `/approve <id>` | (Admin) Approve a user |
| `/approve all` | (Admin) Approve all pending users |
| `/block <id>` | (Admin) Block a user |
| `/stats` | (Admin) View system statistics |

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
npm test              # run all tests (622 tests across 43 suites)
npm run test:watch    # watch mode
```

### Regression guards

These suites exist specifically to stop bugs that have shipped before. Keep them updated
when adding commands, brands or categories:

| Suite | Guards against |
|-------|----------------|
| `test/channels/bot-userid-contract.spec.ts` | Passing `channelUserId` where `internalUserId` is required, and bypassing ownership checks on delete |
| `test/channels/bot-command-routing.spec.ts` | Regex ordering/precedence mistakes (e.g. `xoá khoản vừa rồi` being read as a keyword search, `định mức … 5000000` being recorded as an expense) |
| `test/domain/categories.spec.ts` | Income categories drifting out of the canonical list (the `Tiết kiệm` savings-sign bug) |
| `test/parsers/ai-parser-validation.spec.ts` | Hallucinated categories and `NaN` / negative amounts from Gemini reaching the DB |
| `test/parsers/regex-parser-brands.spec.ts` | Brand regressions, and spelling normalization mangling Latin brand names |

## Roadmap

- [x] **Trend report** — Multi-month spending analysis with half-period comparison, per-category trends, Excel multi-tab export, and Telegram bot routing. *(completed)*
- [x] **Trend report web UI** — Frontend page at `/trend?token=xxx` to visualize trend data with charts (line chart for monthly totals, bar chart for category breakdown). Backend API is ready.
- [x] **Whitelist access control** — Only approved users can use the bot. New users auto-register as pending, admin approves/blocks via REST API with `X-Admin-Secret` auth. Approved users get a Telegram notification. *(completed)*
- [x] **Income/expense sign fix** — Income categories (Thu nhập, Tiết kiệm & Đầu tư) stored with negative amounts. Reports correctly separate income from expenses. *(completed)*
- [x] **Undo / Edit / Delete transactions** — "xoá", "sửa thành 30k", "sửa thành ăn uống", "sửa ngày hôm qua". Natural language edit with hybrid regex + AI detection. Repository supports findById, findLastByUser, update, deleteById. *(completed)*
- [x] **/start & /help commands** — Onboarding message for new users, full command reference for whitelisted users. *(completed)*
- [ ] **Email report delivery** — Send expense reports via email with Excel attachment and professional HTML body. Users trigger via "gửi báo cáo" phrases. Email collected on first use and saved permanently. *(spec complete, implementation pending)*
- [x] **Category budget limits & alerts** — Set monthly spending caps per category (e.g., "định mức ăn uống 5tr"). Bot warns inline at 80% usage, alerts at 100%. View budget status via "xem định mức", delete via "xoá định mức". *(completed)*
- [x] **Proactive notifications** — Daily reminder (conditional), weekly digest, monthly summary via @nestjs/schedule. Per-user opt-in/opt-out with Vietnamese chat commands. *(completed)*
- [x] **Month-over-month comparison** — "so sánh tháng 7 với tháng 8" shows spending comparison by category between two months
- [x] **Voice message support** — Telegram voice → Gemini 2.0 Flash multimodal transcription + expense extraction → confirmation flow *(completed)*
- [x] **Bank transfer screenshot** — Gửi ảnh chuyển khoản ngân hàng để bot tự nhận dạng số tiền, người nhận, ngân hàng via Gemini 2.0 Flash multimodal + confirmation flow *(completed)*
- [x] **Inline keyboard** — Confirmation flow with tap-to-confirm buttons, category selection via 14-button keyboard, delete confirmation. Backward-compatible with text commands. *(completed)*
- [x] **List transactions in chat** — "hôm nay chi gì", "5 khoản gần nhất", "hôm qua chi gì" to quickly review spending without opening web. *(completed)*
- [x] **Admin chat commands** — `/pending`, `/approve`, `/block`, `/stats` for admin users in Telegram. Auto-notification on new user registration. *(completed)*
- [x] **Delete by keyword** — "xoá khoản cà phê" finds matching transactions with fuzzy search, presents inline keyboard for selection when multiple matches. *(completed)*
- [x] **Brand & chain recognition** — ~230 Vietnamese brands (KFC, Phúc Long, Haidilao, Circle K, Bách Hoá Xanh, Xanh SM, Shopee, CGV, Pharmacity, Viettel, SSI, ...) resolve to a category without an AI call, with longest-match disambiguation for overlapping names. *(completed)*
- [x] **Canonical category enforcement** — Single source of truth in `domain/constants/categories.ts`; all AI output normalized through it, amounts validated finite and positive. *(completed)*
- [ ] **Recurring expenses** — auto-detect and track fixed monthly costs
- [ ] **Multi-channel support** — ZaloAdapter (interface is ready)
- [ ] **Production deployment** — Render/Railway with webhook mode for Telegram
