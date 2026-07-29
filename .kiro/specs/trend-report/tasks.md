# Implementation Plan: Multi-Month Trend Report

## Overview

This plan implements the Trend Report feature following the existing Clean Architecture pattern: domain entities first, then application-layer services and use case, then infrastructure (HTTP controller + bot routing), and finally tests. The implementation is fully independent of `GenerateWeeklyReport` and `ExcelGeneratorService` — those files are never modified.

## Tasks

- [x] 1. Create domain entities
  - [x] 1.1 Create MonthlyBreakdown entity
    - Create `src/domain/entities/MonthlyBreakdown.ts`
    - Define the `MonthlyBreakdown` interface with fields: `month` (YYYY-MM), `monthLabel` (Vietnamese), `totalSpent`, `totalIncome`, `transactionCount`, `byCategory` (Record<string, number>), `topCategory` ({ name, amount } | null)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 1.2 Create CategoryTrend entity
    - Create `src/domain/entities/CategoryTrend.ts`
    - Define the `CategoryTrend` interface with fields: `category`, `monthlyAmounts` (number[]), `changePercent`, `direction` ('increasing' | 'decreasing' | 'stable'), `averageMonthly`
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 1.3 Create TrendReport entity
    - Create `src/domain/entities/TrendReport.ts`
    - Define the `TrendReport` interface with fields: `userId`, `periodStart`, `periodEnd`, `monthsCount`, `overview` (with `totalSpent`, `averageMonthlySpent`, `highestMonth`, `lowestMonth`, `overallDirection`, `overallChangePercent`, `hasIncompleteData`, `monthsWithData`), `monthlyBreakdown`, `categoryTrends`, `topGrowingCategories`, `topShrinkingCategories`, `generatedAt`
    - Import `MonthlyBreakdown` and `CategoryTrend` types
    - _Requirements: 1.1, 7.1, 7.2_

- [x] 2. Create TrendAnalysisService
  - [x] 2.1 Implement the half-period comparison algorithm
    - Create `src/application/services/TrendAnalysisService.ts`
    - Mark as `@Injectable()`
    - Implement `analyzeOverallTrend(monthlyTotals: number[]): { direction, changePercent }`:
      - Split months into first half and second half (exclude middle month if odd count)
      - Compute avgFirstHalf and avgSecondHalf
      - Handle edge case: both averages = 0 → stable, 0%
      - Handle edge case: first half = 0, second half > 0 → increasing, 100%
      - Compute changePercent = (avgSecondHalf - avgFirstHalf) / avgFirstHalf * 100
      - Classify: > +10% → increasing, < -10% → decreasing, else → stable
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 2.2 Implement category trend analysis
    - Add `analyzeCategoryTrends(monthlyBreakdowns: MonthlyBreakdown[], minMonthsPresence?: number): CategoryTrend[]` method:
      - Default `minMonthsPresence` to 3
      - Collect all unique categories across all months
      - For each category: build `monthlyAmounts` array (0 for months without that category)
      - Filter out categories appearing in fewer than `minMonthsPresence` months
      - For each qualifying category: compute trend using the same half-period algorithm
      - Compute `averageMonthly` as sum / monthsCount
      - Sort result by |changePercent| descending
    - Add `getTopGrowing(trends: CategoryTrend[], limit?: number): CategoryTrend[]`:
      - Filter direction === 'increasing', sort by changePercent descending, take top `limit` (default 3)
    - Add `getTopShrinking(trends: CategoryTrend[], limit?: number): CategoryTrend[]`:
      - Filter direction === 'decreasing', sort by changePercent ascending, take top `limit` (default 3)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 3. Create GenerateTrendReport use case
  - [x] 3.1 Implement the use case with validation and data grouping
    - Create `src/application/usecases/GenerateTrendReport.ts`
    - Define `TrendReportParams` interface: `{ months: number; endMonth?: string }`
    - Define error classes: `MonthsBelowMinimumError` (code: MONTHS_BELOW_MINIMUM, min: 3) and `MonthsLimitExceededError` (code: MONTHS_LIMIT_EXCEEDED, max: 12)
    - Mark as `@Injectable()`, inject `TransactionRepository` and `TrendAnalysisService`
    - Implement `execute(userId: string, params: TrendReportParams): Promise<TrendReport>`:
      - Validate months ∈ [3, 12], throw typed errors if not
      - Parse endMonth (default: current month) → compute periodEnd as last day of that month
      - Compute periodStart as first day of (endMonth - months + 1)
      - Call `repository.findByUserAndDateRange(userId, periodStart, periodEnd)` — ONCE
      - Group transactions by calendar month (YYYY-MM key)
      - Build `MonthlyBreakdown[]` for all N months (including empty ones with zeros)
      - Call `trendAnalysis.analyzeOverallTrend()` with monthly totals
      - Call `trendAnalysis.analyzeCategoryTrends()` with monthly breakdowns
      - Compute overview: totalSpent, averageMonthlySpent, highestMonth, lowestMonth, hasIncompleteData, monthsWithData
      - Assemble and return complete `TrendReport` with `generatedAt` timestamp
    - _Requirements: 3.1, 3.3, 3.4, 4.1, 5.1, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 10.1, 10.2_

- [x] 4. Checkpoint — Domain + Application layer
  - Verify the project compiles with `npm run build`. Fix any TypeScript errors before proceeding.

- [x] 5. Create ExcelTrendGeneratorService
  - [x] 5.1 Implement Overview tab generation
    - Create `src/application/services/ExcelTrendGeneratorService.ts`
    - Mark as `@Injectable()`
    - Implement `generate(report: TrendReport): Promise<Buffer>`:
      - Create workbook, add "Tổng quan" worksheet first
      - Build header: report title "BÁO CÁO XU HƯỚNG CHI TIÊU", period string, generation date (Asia/Ho_Chi_Minh timezone)
      - Build summary stats table: total, average/month, highest month, lowest month, overall direction (with ↑↓→ symbols), overall change %
      - Build top growing categories table (top 3 with % change)
      - Build top shrinking categories table (top 3 with % change)
      - Apply styling: bold headers, HEADER_FILL, ACCENT_FILL, ALL_BORDERS, auto-size columns (min 8, max 50)
    - _Requirements: 8.1, 8.4_

  - [x] 5.2 Implement monthly detail tabs
    - For each month in `monthlyBreakdown` (chronological order), add a worksheet named `T{M}-{YYYY}`
    - Build category breakdown table: "Danh mục" + "Số tiền" columns, sorted by amount descending, VND formatted
    - Build transaction detail table: STT, Ngày (dd/MM/yyyy), Danh mục, Ghi chú, Số tiền (VND)
    - Sort transactions by spentAt descending, sequential STT from 1
    - Add "Tổng cộng" sum row at bottom (bold, accent fill)
    - Apply alternating row styling on transaction rows
    - Apply thin borders on all data cells
    - Handle months with no transactions (empty table with headers only)
    - _Requirements: 8.2, 8.3, 8.5, 8.6, 8.7_

  - [x] 5.3 Extend filename-formatter for trend report
    - Add a new function `formatTrendExportFilename(userId: string, periodStart: string, periodEnd: string): string` in `src/application/services/filename-formatter.ts`
    - Return `bao-cao-xu-huong-{userId}-{periodStart}-{periodEnd}.xlsx`
    - Ensure no modification to the existing `formatExportFilename` function
    - _Requirements: 2.3, 11.1_

- [x] 6. Checkpoint — Excel generation
  - Verify the project compiles with `npm run build`. Fix any TypeScript errors before proceeding.

- [x] 7. Create TrendReportController
  - [x] 7.1 Implement the trend report API endpoint
    - Create `src/infrastructure/http/controllers/trend-report.controller.ts`
    - `@Controller("api/report/trend")`
    - Implement `@Get()` handler:
      - Parse `token`, `months` (parseInt, default 6), `endMonth` (string, optional)
      - Verify token via TokenService.verifyReportToken → 401 on failure
      - Call `GenerateTrendReport.execute(userId, { months, endMonth })`
      - Catch `MonthsBelowMinimumError` → 400 with `{ error: "MONTHS_BELOW_MINIMUM", min: 3 }`
      - Catch `MonthsLimitExceededError` → 400 with `{ error: "MONTHS_LIMIT_EXCEEDED", max: 12 }`
      - Catch unexpected errors → 500, log with Logger.error()
      - Return TrendReport as JSON
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 7.2 Implement the trend export endpoint
    - Implement `@Get("export")` handler:
      - Same token/months/endMonth parsing and validation as 7.1
      - Call `GenerateTrendReport.execute()` to get TrendReport
      - Call `ExcelTrendGeneratorService.generate(report)` to get Buffer
      - Set headers: Content-Type (xlsx MIME), Content-Disposition (using formatTrendExportFilename), Access-Control-Expose-Headers
      - Send buffer as response
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 8. Update module wiring
  - [x] 8.1 Update ApplicationModule
    - Add `TrendAnalysisService`, `ExcelTrendGeneratorService`, and `GenerateTrendReport` to providers and exports in `src/application/application.module.ts`
    - _Requirements: 1.1_

  - [x] 8.2 Update HttpModule
    - Add `TrendReportController` to controllers array in `src/infrastructure/http/http.module.ts`
    - _Requirements: 1.1_

- [x] 9. Implement Telegram bot routing
  - [x] 9.1 Add trend report detection and routing to BotService
    - Add new regex constants at the top of `bot.service.ts`:
      - `TREND_REPORT_REGEX`: matches `báo cáo N tháng`, `xu hướng chi tiêu N tháng`, `báo cáo xu hướng`
      - `COMPARE_MONTHS_REGEX`: matches `so sánh tháng X với/và/vs tháng Y`
    - In `onModuleInit`, add checks BEFORE the existing `REPORT_REGEX` test:
      1. Check `COMPARE_MONTHS_REGEX` → reply "chưa hỗ trợ" message, return
      2. Check `TREND_REPORT_REGEX` → parse months (default 6), call `handleTrendReportRequest`
    - Ensure existing `REPORT_REGEX` is NOT triggered by trend keywords (messages like "báo cáo 6 tháng" must NOT fall through to `handleReportRequest`)
    - _Requirements: 9.1, 9.2, 9.6_

  - [x] 9.2 Implement handleTrendReportRequest
    - Add `private async handleTrendReportRequest(userId: string, months: number): Promise<void>`:
      - If months < 3 or months > 12: send friendly error message (range reminder), return early without calling use case
      - Call `GenerateTrendReport.execute(userId, { months })`
      - Generate token for webview link: `{WEBVIEW_BASE_URL}/trend?token=xxx`
      - Build export link: `/api/report/trend/export?token=xxx&months=N`
      - Format concise reply (see format below), send via channelAdapter
    - Reply format:
      ```
      📊 Xu hướng chi tiêu {N} tháng qua ({from} - {to})
      Tổng chi: {total}đ · TB: {avg}đ/tháng
      {icon} Xu hướng: {direction} ({changePercent}% so với đầu kỳ)
      📅 Tháng cao nhất: {month} ({amount}đ)
      🔺 Tăng mạnh nhất: {category} (+{percent}%)
      🔻 Giảm mạnh nhất: {category} ({percent}%)

      👉 Xem chi tiết đầy đủ: {webview_link}
      📥 Tải báo cáo Excel: {export_link}
      ```
    - If `hasIncompleteData`: prepend warning line about limited data
    - _Requirements: 9.3, 9.4, 9.5, 7.4_

- [x] 10. Checkpoint — Full integration
  - Verify the project compiles with `npm run build`. Ensure no modifications to `GenerateWeeklyReport.ts` or `ExcelGeneratorService.ts`. Fix any issues before proceeding.

- [x] 11. Write tests
  - [x] 11.1 Write unit tests for TrendAnalysisService
    - Create `test/services/trend-analysis.spec.ts`
    - Test: 6 months increasing trend (change > +10%) → direction "increasing"
    - Test: 6 months decreasing trend (change < -10%) → direction "decreasing"
    - Test: 6 months stable trend (change within ±10%) → direction "stable"
    - Test: 7 months (odd) — middle month excluded from both halves
    - Test: all monthly totals = 0 → stable, changePercent = 0
    - Test: first half = 0, second half > 0 → increasing, changePercent = 100
    - Test: category with < 3 months presence excluded from categoryTrends
    - Test: category monthlyAmounts array always has N elements (with 0 for missing months)
    - Test: topGrowing limited to 3, sorted by changePercent descending
    - Test: topShrinking limited to 3, sorted by changePercent ascending
    - _Design Properties: 2, 3, 4, 5, 6, 10_

  - [x] 11.2 Write unit tests for GenerateTrendReport
    - Create `test/usecases/generate-trend-report.spec.ts`
    - Test: months=2 throws MonthsBelowMinimumError
    - Test: months=13 throws MonthsLimitExceededError
    - Test: months=6 returns monthlyBreakdown with exactly 6 elements
    - Test: months with no transactions have transactionCount=0, totalSpent=0
    - Test: hasIncompleteData=true when any month has 0 transactions
    - Test: monthsWithData counts correctly
    - Test: repository.findByUserAndDateRange called exactly once
    - Test: transactions are grouped by calendar month correctly
    - Mock TransactionRepository and TrendAnalysisService
    - _Design Properties: 1, 7, 8, 11_

  - [x] 11.3 Write unit tests for TrendReportController
    - Create `test/controllers/trend-report-controller.spec.ts`
    - Test: valid token + months=6 returns 200 with TrendReport JSON
    - Test: missing token returns 401 with INVALID_TOKEN error
    - Test: invalid token returns 401
    - Test: months=2 returns 400 with MONTHS_BELOW_MINIMUM
    - Test: months=15 returns 400 with MONTHS_LIMIT_EXCEEDED
    - Test: export endpoint returns xlsx with correct Content-Type and Content-Disposition
    - Test: export exposes Content-Disposition in Access-Control-Expose-Headers
    - Mock TokenService, GenerateTrendReport, ExcelTrendGeneratorService
    - _Requirements: 1.1–1.7, 2.1–2.5_

  - [x] 11.4 Write unit tests for ExcelTrendGeneratorService
    - Create `test/services/excel-trend-generator.spec.ts`
    - Test: workbook has N+1 sheets for N months
    - Test: first sheet named "Tổng quan"
    - Test: monthly sheets named T{M}-{YYYY} in chronological order
    - Test: no sheet name exceeds 31 characters
    - Test: overview tab contains summary statistics
    - Test: monthly tabs contain transaction tables with correct column headers
    - Test: months with no transactions produce valid sheet (headers only)
    - _Design Properties: 9, Requirements: 8.1–8.7_

  - [x] 11.5 Write unit tests for bot trend routing
    - Create `test/channels/bot-trend-routing.spec.ts`
    - Test: "báo cáo 6 tháng" triggers trend report handler
    - Test: "xu hướng chi tiêu 3 tháng" triggers with months=3
    - Test: "báo cáo xu hướng" defaults to months=6
    - Test: "báo cáo 2 tháng" replies with range error, GenerateTrendReport NOT called
    - Test: "báo cáo 18 tháng" replies with range error, GenerateTrendReport NOT called
    - Test: "so sánh tháng 1 với tháng 6" replies "chưa hỗ trợ", no parser/usecase call
    - Test: "báo cáo tháng này" still routes to existing weekly report handler (not trend)
    - Test: "báo cáo tuần này" still routes to existing weekly report handler
    - _Requirements: 9.1–9.6_

- [x] 12. Final checkpoint
  - Run `npm run build` and `npm test`. Ensure all tests pass. Verify no changes to `GenerateWeeklyReport.ts` or `ExcelGeneratorService.ts`. Confirm acceptance criteria from requirements are met.

## Notes

- This feature is completely additive — no existing files are modified except `application.module.ts`, `http.module.ts`, `bot.service.ts`, and `filename-formatter.ts` (extended with new export, not modifying existing functions)
- The `TransactionRepository` interface already has `findByUserAndDateRange` which is sufficient — no new port methods needed
- The `(user_id, spent_at)` index already exists in the schema — no migration required
- ExcelJS is already installed (used by `ExcelGeneratorService`) — no new dependencies needed
- `fast-check` is already available for property-based tests if desired (optional enhancement)
- The `TokenService` port can be reused for trend report tokens — the token just needs `userId`; the `from`/`to` dates for trend are computed from `months`/`endMonth` params, not stored in the token

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"], "description": "Domain entities (no dependencies)" },
    { "id": 1, "tasks": ["2.1", "2.2"], "description": "TrendAnalysisService (depends on entities)" },
    { "id": 2, "tasks": ["3.1"], "description": "GenerateTrendReport use case (depends on TrendAnalysisService)" },
    { "id": 3, "tasks": ["4"], "description": "Checkpoint: compile check" },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3"], "description": "ExcelTrendGeneratorService + filename util (depends on entities)" },
    { "id": 5, "tasks": ["6"], "description": "Checkpoint: compile check" },
    { "id": 6, "tasks": ["7.1", "7.2", "8.1", "8.2"], "description": "Controller + module wiring (depends on use case + excel service)" },
    { "id": 7, "tasks": ["9.1", "9.2"], "description": "Bot routing (depends on use case)" },
    { "id": 8, "tasks": ["10"], "description": "Checkpoint: full integration compile" },
    { "id": 9, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5"], "description": "All tests (depends on all implementation)" },
    { "id": 10, "tasks": ["12"], "description": "Final checkpoint" }
  ]
}
```
