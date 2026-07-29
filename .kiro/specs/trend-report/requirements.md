# Requirements Document

## Introduction

This feature adds a multi-month Trend Report capability to the oh-my-fast-tracker system. It allows users to view spending trends across 3–12 months (default 6), with monthly breakdowns, category trend analysis, and a multi-tab Excel export. The feature is fully independent of the existing `GenerateWeeklyReport` use case — no existing code is modified.

The Trend Report answers "how is my spending trending over time?" (a time-series analysis) as opposed to the existing weekly report which answers "how much did I spend in this period?" (a single aggregate). It includes Telegram bot integration for requesting reports via chat, an HTTP API for webview consumption, and Excel export with one overview tab plus N monthly detail tabs.

## Glossary

- **TrendReport**: The complete result object containing overview statistics, monthly breakdowns, and category trend analysis for a multi-month period
- **MonthlyBreakdown**: Aggregated spending data for a single calendar month including total, income, transaction count, and per-category breakdown
- **CategoryTrend**: Analysis of a single category's spending trajectory across the report period, including direction (increasing/decreasing/stable) and percentage change
- **TrendAnalysisService**: Application-layer service implementing the half-period comparison algorithm for determining spending trends
- **ExcelTrendGeneratorService**: Application-layer service that produces a multi-tab Excel workbook (overview + N monthly tabs)
- **GenerateTrendReport**: The use case orchestrating data retrieval, trend analysis, and result assembly — fully separate from GenerateWeeklyReport
- **Half-Period Comparison**: The algorithm comparing average spending of the first half of months vs the second half, with ±10% threshold for stable classification
- **Category Minimum Presence**: The rule requiring a category to appear in at least 3 months before being eligible for trend analysis

## Requirements

### Requirement 1: Trend Report API Endpoint

**User Story:** As a user of the expense-report-web app, I want to request a multi-month trend report via API, so that the webview can display my spending trends over time.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/report/trend` with a valid `token` query parameter, THE TrendReportController SHALL return a JSON response with HTTP status 200 containing a complete `TrendReport` object
2. THE endpoint SHALL accept an optional `months` query parameter (integer) that defaults to `6` when not provided
3. THE endpoint SHALL accept an optional `endMonth` query parameter (format `YYYY-MM`) that defaults to the current month when not provided
4. IF the `token` query parameter is missing or invalid/expired, THEN THE TrendReportController SHALL return HTTP 401 with `{ "error": "INVALID_TOKEN" }`
5. IF the `months` parameter is less than 3, THEN THE TrendReportController SHALL return HTTP 400 with `{ "error": "MONTHS_BELOW_MINIMUM", "min": 3 }`
6. IF the `months` parameter is greater than 12, THEN THE TrendReportController SHALL return HTTP 400 with `{ "error": "MONTHS_LIMIT_EXCEEDED", "max": 12 }`
7. IF the user has no transactions at all, THEN THE TrendReportController SHALL return HTTP 200 with a valid `TrendReport` where all amounts are 0 and `hasIncompleteData` is true — not an error response

### Requirement 2: Trend Report Excel Export Endpoint

**User Story:** As a user, I want to export my multi-month trend report as a multi-tab Excel file, so that I can save, share, or review detailed monthly data offline.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/report/trend/export` with a valid `token` query parameter, THE TrendReportController SHALL return an Excel file as a binary response with HTTP status 200
2. THE export endpoint SHALL set the `Content-Type` header to `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
3. THE export endpoint SHALL set the `Content-Disposition` header to `attachment; filename="bao-cao-xu-huong-{userId}-{periodStart}-{periodEnd}.xlsx"` using the filename-formatter utility
4. THE export endpoint SHALL accept the same query parameters as the trend API endpoint (`token`, `months`, `endMonth`) with identical validation rules
5. THE export endpoint SHALL expose the `Content-Disposition` header to cross-origin clients via `Access-Control-Expose-Headers`

### Requirement 3: Monthly Breakdown Calculation

**User Story:** As a user, I want my spending broken down by individual month, so that I can see exactly how much I spent each month and in which categories.

#### Acceptance Criteria

1. THE GenerateTrendReport use case SHALL return a `monthlyBreakdown` array with exactly N elements (where N = requested months), sorted in ascending chronological order
2. EACH MonthlyBreakdown element SHALL contain: month identifier (YYYY-MM format), Vietnamese label ("Tháng M/YYYY"), totalSpent, totalIncome, transactionCount, per-category amounts (byCategory), and topCategory
3. IF a month has no transactions, THE MonthlyBreakdown for that month SHALL have `totalSpent: 0`, `transactionCount: 0`, and `byCategory: {}` — the month SHALL NOT be omitted from the array
4. THE system SHALL query all transactions in the full period range in a single database call, then group by month in the application layer (no N+1 queries)

### Requirement 4: Overall Trend Analysis

**User Story:** As a user, I want to know whether my spending is increasing, decreasing, or stable over the report period, so that I can understand my financial trajectory at a glance.

#### Acceptance Criteria

1. THE TrendAnalysisService SHALL calculate `overallDirection` by comparing the average spending of the first half of months with the average spending of the second half of months
2. IF `changePercent` (computed as `(avgSecondHalf - avgFirstHalf) / avgFirstHalf * 100`) is greater than +10%, THEN `overallDirection` SHALL be `"increasing"`
3. IF `changePercent` is less than -10%, THEN `overallDirection` SHALL be `"decreasing"`
4. IF `changePercent` is between -10% and +10% (inclusive), THEN `overallDirection` SHALL be `"stable"`
5. IF the number of months is odd, THE middle month SHALL be excluded from both halves (not counted in either average)
6. IF `avgFirstHalf` is 0 and `avgSecondHalf` is also 0, THEN `overallDirection` SHALL be `"stable"` and `changePercent` SHALL be 0
7. IF `avgFirstHalf` is 0 and `avgSecondHalf` is greater than 0, THEN `overallDirection` SHALL be `"increasing"` and `changePercent` SHALL be 100

### Requirement 5: Category Trend Analysis

**User Story:** As a user, I want to know which spending categories are growing or shrinking over time, so that I can identify areas where I'm spending more or less.

#### Acceptance Criteria

1. THE TrendAnalysisService SHALL compute a `CategoryTrend` for each category that appears in at least 3 of the N months in the report period
2. Categories appearing in fewer than 3 months SHALL be included in `monthlyBreakdown` data but SHALL NOT appear in `categoryTrends`, `topGrowingCategories`, or `topShrinkingCategories`
3. FOR each qualifying category, THE `monthlyAmounts` array SHALL have exactly N elements (one per month in chronological order), with `0` for months where the category has no transactions
4. THE `changePercent` and `direction` for each category SHALL be calculated using the same half-period comparison algorithm as the overall trend (Requirement 4)
5. `topGrowingCategories` SHALL contain at most 3 categories with `direction === "increasing"`, sorted by `changePercent` descending
6. `topShrinkingCategories` SHALL contain at most 3 categories with `direction === "decreasing"`, sorted by `changePercent` ascending (most negative first)
7. IF fewer than 3 categories qualify for growing or shrinking, THE arrays SHALL contain only those that qualify — no padding or fabrication

### Requirement 6: Months Validation

**User Story:** As the system operator, I want strict validation on the months parameter, so that the system only processes meaningful trend analyses and avoids excessive resource usage.

#### Acceptance Criteria

1. THE GenerateTrendReport use case SHALL validate that `months` is within the range [3, 12] inclusive, rejecting values outside this range with a descriptive error
2. THIS validation SHALL be performed at the use case layer (not only at the controller or bot layer), ensuring consistency regardless of the calling source
3. IF `months < 3`, THE use case SHALL throw an error indicating the minimum is 3
4. IF `months > 12`, THE use case SHALL throw an error indicating the maximum is 12

### Requirement 7: Incomplete Data Handling

**User Story:** As a new user who hasn't been tracking expenses for the full report period, I want the report to still work and clearly indicate which months lack data, so that I'm not confused by the results.

#### Acceptance Criteria

1. THE TrendReport overview SHALL include `hasIncompleteData: boolean` set to `true` if any month in the period has zero transactions
2. THE TrendReport overview SHALL include `monthsWithData: number` indicating how many months actually contain transaction data
3. MONTHS with no data SHALL still be included in all calculations (treated as 0 spending), reflecting the actual usage timeline
4. THE Telegram bot reply SHALL include a warning message when `hasIncompleteData` is true, informing the user that trend accuracy may be limited

### Requirement 8: Excel Multi-Tab Structure

**User Story:** As a user exporting the trend report, I want the Excel file organized with an overview tab and individual monthly tabs, so that I can navigate between summary and detailed data easily.

#### Acceptance Criteria

1. THE ExcelTrendGeneratorService SHALL produce a workbook with exactly N+1 tabs: 1 "Tổng quan" (Overview) tab followed by N monthly detail tabs
2. THE tab order SHALL be: Overview → oldest month → ... → most recent month (chronological)
3. EACH monthly tab SHALL be named in the format `T{M}-{YYYY}` (e.g., `T2-2026`, `T12-2026`) to stay within Excel's 31-character sheet name limit
4. THE Overview tab SHALL contain: report header (user, period), summary statistics table (total, average, highest/lowest month, overall direction with arrow symbol), top growing categories table, and top shrinking categories table
5. EACH monthly detail tab SHALL contain: pie chart of category breakdown, category amounts table, and detailed transaction list (date, amount, category, note) with alternating row styling
6. THE ExcelTrendGeneratorService SHALL reuse styling patterns (alternating rows, VND formatting, Vietnamese labels) from the existing ExcelGeneratorService for visual consistency
7. TAB names SHALL NOT contain any of the characters `/ \ ? * [ ] :` (Excel restriction)

### Requirement 9: Telegram Bot Integration

**User Story:** As a Telegram user, I want to request trend reports via chat commands, so that I can get a quick summary of my spending trends without opening the web app.

#### Acceptance Criteria

1. THE BotService SHALL recognize messages matching patterns: `báo cáo N tháng`, `xu hướng chi tiêu N tháng`, `báo cáo xu hướng` (defaults to 6 months), where N is parsed from the message
2. THE bot trend report route SHALL be evaluated BEFORE the existing report route to avoid conflicts with messages like `báo cáo tháng này`
3. WHEN a valid trend report is generated, THE bot SHALL reply with a concise summary: total, average, overall direction with percentage, highest month, top growing category, top shrinking category, webview link, and export link
4. THE bot reply SHALL NOT include full monthly breakdowns or complete category lists — detailed data is accessed via the webview link
5. WHEN `months` is outside the [3, 12] range, THE bot SHALL reply with a friendly message explaining the valid range and suggesting an example (e.g., "báo cáo 6 tháng"), WITHOUT calling GenerateTrendReport
6. WHEN the message matches "so sánh tháng X với tháng Y" pattern, THE bot SHALL reply that this feature is not yet supported and suggest using the trend report instead — this message SHALL NOT be passed to the parser or treated as a transaction

### Requirement 10: Performance

**User Story:** As a user with many months of transaction data, I want the trend report to load quickly, so that I don't have to wait excessively for results.

#### Acceptance Criteria

1. THE system SHALL fetch all transactions for the full report period in a single database query using the existing `(user_id, spent_at)` index
2. THE system SHALL perform monthly grouping and aggregation in the application layer after retrieving data, not via N separate queries
3. THE system SHALL NOT require any new database tables or schema changes for the initial implementation (the existing `transactions` table and index are sufficient)

### Requirement 11: Isolation from Existing Features

**User Story:** As a developer, I want the trend report feature to be fully isolated from existing report functionality, so that changes don't introduce regressions.

#### Acceptance Criteria

1. THE implementation SHALL NOT modify any code in `GenerateWeeklyReport.ts` or `ExcelGeneratorService.ts`
2. THE implementation SHALL create new, separate files: `GenerateTrendReport.ts`, `TrendAnalysisService.ts`, `ExcelTrendGeneratorService.ts`, and `TrendReportController.ts`
3. THE implementation MAY reuse existing shared utilities (`vnd-formatter.ts`, `filename-formatter.ts`) and the `TransactionRepository` port
4. THE implementation SHALL add new domain entities (`MonthlyBreakdown.ts`, `TrendReport.ts`, `CategoryTrend.ts`) without modifying existing entities
