# Oh My Fast Tracker

A Telegram chatbot that tracks personal expenses using natural Vietnamese language. Powered by NestJS, Supabase, and Google Gemini AI.

Type something like `ăn trưa 50k` and the bot parses the amount, detects the category, and saves it. Ask for a report anytime by typing `báo cáo`.

## Features

- **Natural Vietnamese input** — "ăn sáng 70k, grab 30k, gửi xe 10k" records 3 transactions at once
- **AI-powered categorization** — Hybrid parser: keyword-based regex for speed, Gemini Flash AI fallback for semantic understanding (e.g. "đi chợ" → Ăn uống)
- **Past date support** — "hôm qua rửa xe 25k" saves with yesterday's `spent_at`
- **Flexible reporting** — "báo cáo tuần trước", "chi tiêu tháng này", "từ 1/6 đến 30/6"
- **Report webview** — generates a link with chart + detailed table + Excel export
- **13 Vietnamese categories** — Ăn uống, Di chuyển, Mua sắm, Nhà ở, Tiện ích, Internet, Sức khỏe, Giáo dục, Giải trí, Con cái, Chi phí cố định, Thu nhập, Khác

## Architecture

NestJS + Clean Architecture (domain → application → infrastructure).

```
src/
  domain/           ← Pure interfaces, no dependencies
    entities/         Transaction, WeeklySummary
    ports/            ChannelAdapter, Parser, TokenService, TransactionRepository

  application/      ← Use cases, depends only on domain ports
    usecases/
      RecordTransaction.ts      parse + save expense(s)
      GenerateWeeklyReport.ts   aggregate by date range

  infrastructure/   ← Concrete implementations
    auth/             JwtTokenService
    channels/         TelegramAdapter, BotService (message routing)
    config/           NestJS ConfigModule (app, telegram, supabase, auth, ai)
    parsers/          RegexParser, AIParser, HybridParser
    repositories/     SupabaseTransactionRepository
    http/
      controllers/    HealthController, ReportController
      http.module.ts

  app.module.ts     ← Root NestJS module
  main.ts           ← Bootstrap
```

## How it works

```
User message → TelegramAdapter → BotService
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
| `GEMINI_MODEL` | Gemini model (default: gemini-3.5-flash-lite) |

### Database schema

```sql
transactions (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  amount      numeric NOT NULL,
  category    text NOT NULL,
  note        text,
  spent_at    timestamptz NOT NULL DEFAULT now(),  -- actual spending date
  created_at  timestamptz NOT NULL DEFAULT now()   -- record creation date
)
```

## Bot commands (via chat)

| Message | Action |
|---------|--------|
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

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/report?token=xxx` | Get report data (used by webview) |

## Testing

```bash
npm test              # run all tests
npm run test:watch    # watch mode
```

## Roadmap

- [ ] **Category budget limits** — set a monthly spending cap per category (e.g. "tháng này ăn uống tối đa 5tr"). When exceeded, bot sends a notification: "Bạn đã chi vượt mức Ăn uống tháng này (5.2tr / 5tr)"
- [ ] **Month-over-month comparison** — "so sánh tháng 7 với tháng 8" shows a bar chart comparing spending by category between two months, with a list of categories that increased
- [ ] **Recurring expenses** — auto-detect and track fixed monthly costs
- [ ] **Multi-channel support** — ZaloAdapter (interface is ready)
- [ ] **AI Parser improvements** — better handling of slang, abbreviations, mixed language
- [ ] **Production deployment** — Render/Railway with webhook mode for Telegram
