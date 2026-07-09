# Micro finance bot - Clean Architecture

A chat bot that tracks expenses. Users type something like "ăn trưa 50k"
(lunch 50k) and the bot parses the amount + category and saves it to Supabase.

## Folder structure (4 Clean Architecture layers)

```
src/
  domain/                  <- Depends on nothing else
    entities/               Transaction
    ports/                  ChannelAdapter, Parser, TransactionRepository (interfaces)

  application/               <- Only depends on domain/ports, knows nothing
    usecases/                  about Telegram, Supabase, or Regex specifically
      RecordTransaction.ts
      GenerateWeeklyReport.ts

  infrastructure/            <- Concrete implementation for each port
    channels/TelegramAdapter.ts     implements ChannelAdapter
    parsers/RegexParser.ts          implements Parser
    repositories/SupabaseTransactionRepository.ts   implements TransactionRepository
    config/env.ts

  main.ts                  <- Composition root: the ONLY place that "new"s concrete classes
```

Dependency rule: `domain` imports nothing from `application`/`infrastructure`.
`application` only imports from `domain`. `infrastructure` implements the
interfaces defined in `domain`. `main.ts` is the only file aware of all
three layers, and it wires them together.

## Status - what's done so far

- [x] Domain layer: `Transaction` entity + 3 ports (`ChannelAdapter`, `Parser`, `TransactionRepository`)
- [x] Application layer: `RecordTransaction` and `GenerateWeeklyReport` use cases
- [x] Infrastructure: `RegexParser` (amount + category detection for Vietnamese text)
- [x] Infrastructure: `TelegramAdapter` (polling mode, ready for local dev/testing)
- [x] Infrastructure: `SupabaseTransactionRepository` + SQL schema (`sql/schema.sql`)
- [x] Composition root (`main.ts`) wiring everything together, with a friendly
      fallback reply when a message can't be parsed
- [ ] Weekly report webview (a page that reads `user_id` from the URL and
      renders a chart) - **not built yet**, only the `GenerateWeeklyReport`
      use case and `sendWeeklyReports` function exist
- [ ] Cron job to actually call `sendWeeklyReports` on a schedule - not wired up yet
- [ ] Deployment to Render/Railway - not done yet
- [ ] `AIParser` / `ZaloAdapter` - not built (the interfaces are ready for them)

In short: the bot can already receive a Telegram message, parse it, save it
to Supabase, and reply — end to end. What's missing is the weekly report
page + the scheduled job that sends it, and the production deploy.

## How to run this locally

1. **Install dependencies**
   ```bash
   cd micro-finance-bot
   npm install
   ```

2. **Create a Telegram bot and get a token**
   - Open Telegram, message `@BotFather`, send `/newbot`, follow the prompts
   - Copy the token it gives you

3. **Create a Supabase project**
   - Go to supabase.com, create a new project
   - In the SQL editor, run the contents of `sql/schema.sql`
   - Get your project URL and `service_role` key from Project settings > API

4. **Set environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY=your_supabase_service_role_key
   WEBVIEW_BASE_URL=http://localhost:3000/report
   ```

5. **Run in dev mode**
   ```bash
   npm run dev
   ```
   You should see `Bot is running.` in the console.

6. **Test it**
   - Open your bot in Telegram, send it a message like `ăn trưa 50k`
   - The bot should reply confirming the amount + category
   - Check the `transactions` table in Supabase to confirm the row was saved

7. **Build for production**
   ```bash
   npm run build   # compiles TypeScript to dist/
   npm start       # runs dist/main.js
   ```

## How to swap to an AI parser (without touching the use case)

1. Create `src/infrastructure/parsers/AIParser.ts` implementing `Parser`:
   ```ts
   export class AIParser implements Parser {
     async parse(text: string): Promise<ParsedExpense | null> { ... }
   }
   ```
2. In `main.ts`, change:
   ```ts
   const parser: Parser = new RegexParser();
   // to
   const parser: Parser = new AIParser(apiKey);
   ```
   No changes needed in `RecordTransaction`, `TelegramAdapter`, or the database layer.

## How to add Zalo (without touching the use case or parser)

1. Create `src/infrastructure/channels/ZaloAdapter.ts` implementing
   `ChannelAdapter` with the same 4 methods: `onMessage`, `sendText`,
   `sendLink`, `start`.
2. In `main.ts`, either swap the `channelAdapter` initialization to
   `ZaloAdapter`, or initialize both and run them side by side for
   multi-channel support.

## Deploying (Render/Railway)

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Set the environment variables in the Render/Railway dashboard
- For production, switch `TelegramAdapter` from polling to webhook mode
  to avoid Telegram's rate limits on continuous polling.
