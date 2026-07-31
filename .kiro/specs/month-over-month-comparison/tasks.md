# Implementation Plan: Month-over-Month Comparison

## Overview

This implementation adds month-over-month spending comparison to the Oh My Fast Tracker bot. Users can compare expenses between any two months via Telegram ("so sánh tháng 7 với tháng 8" or "so sánh tháng" for recent months). The feature includes a CompareMonths use case, REST API endpoints (JSON + Excel export), a 3-tab Excel workbook generator, and BotService integration replacing the current "not yet supported" handler.

## Tasks

- [x] 1. Domain entities and filename formatter
  - [x] 1.1 Create MonthComparisonResult and CategoryDiff entities
    - Create `src/domain/entities/MonthComparisonResult.ts` with the `CategoryDiff` interface (category, amountA, amountB, absoluteDiff, percentChange) and `MonthComparisonResult` interface (userId, monthA, monthB, totalDifference, totalPercentChange, categoryDiffs, generatedAt)
    - Import and reference existing `Transaction` entity
    - _Requirements: 3.3, 3.4, 4.1, 4.4_

  - [x] 1.2 Add formatCompareExportFilename to filename-formatter.ts
    - Append `formatCompareExportFilename(monthA, yearA, monthB, yearB)` function to existing `src/application/services/filename-formatter.ts`
    - Output pattern: `so-sanh-thang-{monthA}-{yearA}-vs-{monthB}-{yearB}.xlsx`
    - _Requirements: 8.5_

- [x] 2. CompareMonths use case
  - [x] 2.1 Implement CompareMonths use case
    - Create `src/application/usecases/CompareMonths.ts`
    - Define `CompareMonthsParams` interface (monthA, yearA, monthB, yearB)
    - Define `SameMonthError` and `InvalidMonthError` typed errors
    - Inject `TransactionRepository` via `@Inject("TransactionRepository")`
    - Implement `execute(userId, params)`: validate month range (1–12), validate different months, compute date ranges, query transactions via `findByUserAndDateRange`, aggregate by category (positive amounts only), compute absoluteDiff and percentChange per category, sort categoryDiffs by |absoluteDiff| descending, return `MonthComparisonResult`
    - Handle percentChange: null when amountA=0 and amountB>0 ("mới"), -100 when amountB=0 and amountA>0
    - _Requirements: 2.3, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4_

  - [ ]* 2.2 Write property tests for CompareMonths use case
    - **Property 1: Category diff sum equals total difference**
    - **Property 2: All categories from both months are represented**
    - **Property 4: Only expenses are aggregated (positive amounts only)**
    - **Property 5: Category diffs are sorted by absolute difference descending**
    - Generate random transaction arrays with random categories and amounts using fast-check
    - Extract pure aggregation logic into testable helper or test against mocked repository
    - **Validates: Requirements 3.2, 3.3, 3.4, 4.1, 4.4**

  - [ ]* 2.3 Write property test for percentage calculation
    - **Property 3: Percentage change calculation correctness**
    - Generate random amountA (≥0) and amountB (≥0) pairs
    - Verify: amountA>0 → percentChange = ((amountB-amountA)/amountA)*100, amountA=0 && amountB>0 → null, amountB=0 && amountA>0 → -100
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [ ]* 2.4 Write unit tests for CompareMonths use case
    - Test: explicit months comparison, default recent months, January year-crossing, months with no data, both months empty, same month error, invalid month error
    - Mock TransactionRepository.findByUserAndDateRange
    - _Requirements: 13.2_

- [x] 3. Checkpoint - Use case compiles and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. ExcelCompareGeneratorService
  - [x] 4.1 Implement ExcelCompareGeneratorService
    - Create `src/application/services/ExcelCompareGeneratorService.ts`
    - Tab 1 ("So sánh"): comparison overview with header, category rows showing amountA, amountB, absoluteDiff, percentChange — sorted by |absoluteDiff| descending, with "Tổng cộng" summary row
    - Tab 2 ("Tháng {A}"): category breakdown + transaction detail table (same layout as ExcelTrendGeneratorService monthly tabs: STT, date, category, note, amount) with "Tổng cộng" row
    - Tab 3 ("Tháng {B}"): same as Tab 2 for month B
    - Reuse styling constants (HEADER_FILL, ACCENT_FILL, ALTERNATING_ROW_FILL, ALL_BORDERS) from existing pattern
    - Apply auto-sized columns
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 4.2 Write unit tests for ExcelCompareGeneratorService
    - Test: output buffer is valid Excel, workbook has 3 worksheets, sheet names match ("So sánh", "Tháng {A}", "Tháng {B}"), comparison tab has correct column headers, category rows are sorted, "Tổng cộng" rows exist
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 5. CompareReportController
  - [x] 5.1 Implement CompareReportController
    - Create `src/infrastructure/http/controllers/compare-report.controller.ts`
    - `@Controller('api/report/compare')` with constructor injecting CompareMonths, ExcelCompareGeneratorService, TokenService
    - GET `/` endpoint: verify token → check yearA/yearB presence → validate monthA/monthB range → execute use case → return JSON
    - GET `/export` endpoint: same validation → execute use case → generate Excel → respond with Content-Type, Content-Disposition (using formatCompareExportFilename), and Access-Control-Expose-Headers
    - Error handling: 401 INVALID_TOKEN, 400 MISSING_YEAR, 400 INVALID_MONTH, 400 SAME_MONTH, 500 INTERNAL_ERROR
    - Validation order: token first, then yearA/yearB, then monthA/monthB
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 5.2 Write unit tests for CompareReportController
    - Test: valid token + correct params → 200 JSON, valid token + correct params → Excel export with headers, missing token → 401, invalid token → 401, missing yearA → 400 MISSING_YEAR, invalid month → 400 INVALID_MONTH, same month → 400 SAME_MONTH, internal error → 500
    - _Requirements: 13.3_

- [x] 6. BotService integration
  - [x] 6.1 Update BotService with compare months handler
    - Update `COMPARE_MONTHS_REGEX` to capture month numbers: `/so\s*sánh\s*tháng(?:\s+(\d{1,2})\s*(?:với|và|vs)\s*tháng\s*(\d{1,2}))?/i`
    - Inject `CompareMonths` use case into BotService constructor
    - Replace the current "not yet supported" block with routing to new `handleCompareMonths` private method
    - Implement `handleCompareMonths(userId, text)`:
      - If regex captures present → explicit months mode (parse X, Y, infer years)
      - If no captures (just "so sánh tháng") → default mode (current month vs previous month)
      - Year inference: if month > current month → assign previous year
      - Validate: same month → error reply; month outside 1–12 → error reply
      - Call `CompareMonths.execute()`, format Vietnamese reply with category breakdown
      - Generate token via TokenService, append webview link
    - Format reply per requirements: header with month labels, totals with diff, category lines with ↑/↓/→ indicators
    - Handle errors: same month, invalid month, no data, connection failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 10.1, 10.2, 10.3_

  - [ ]* 6.2 Write property tests for BotService comparison logic
    - **Property 6: Year inference maps future months to previous year**
    - Generate random month numbers (1–12) with random "current" month, verify year assignment
    - **Property 8: Default month comparison resolves to current and previous month**
    - Generate random "today" dates, verify resolved months with correct year-crossing
    - **Validates: Requirements 1.5, 2.1, 2.2**

  - [ ]* 6.3 Write unit tests for BotService compare handler
    - Test regex matches: "so sánh tháng 7 với tháng 8", "so sánh tháng 3 và tháng 5", "so sánh tháng 1 vs tháng 2", "so sánh tháng" (default mode)
    - Test error cases: same month → error reply, month outside 1–12 → error reply, connection failure → SERVICE_UNAVAILABLE_MSG
    - Test reply includes webview link
    - Test reply formatting with category breakdown
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3_

- [x] 7. Checkpoint - Bot integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Module registration and wiring
  - [x] 8.1 Register CompareMonths and ExcelCompareGeneratorService in ApplicationModule
    - Add `CompareMonths` and `ExcelCompareGeneratorService` to providers and exports in `src/application/application.module.ts`
    - _Requirements: 7.6, 8.5_

  - [x] 8.2 Register CompareReportController in HttpModule
    - Add `CompareReportController` to the controllers array in `src/infrastructure/http/http.module.ts`
    - Import CompareReportController at the top of the file
    - _Requirements: 7.1, 8.1_

- [ ] 9. Property test for filename format
  - [ ]* 9.1 Write property test for formatCompareExportFilename
    - **Property 7: Comparison filename format**
    - Generate random months (1–12) and years (2000–2100) using fast-check
    - Verify output matches pattern `so-sanh-thang-{monthA}-{yearA}-vs-{monthB}-{yearB}.xlsx`
    - **Validates: Requirements 8.5**

- [x] 10. Documentation updates
  - [x] 10.1 Update HELP_MSG in BotService
    - Add compare commands to the "📊 Xem báo cáo" section of HELP_MSG: "• so sánh tháng (2 tháng gần nhất)" and "• so sánh tháng X với tháng Y"
    - _Requirements: 12.1, 12.2_

  - [x] 10.2 Update README.md with compare API documentation
    - Add GET `/api/report/compare` endpoint documentation with query parameters, sample request URL, and sample JSON response structure
    - Add GET `/api/report/compare/export` endpoint documentation with query parameters and response format
    - Place in the same section as existing report and trend API documentation
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 11. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project already has `fast-check` and `exceljs` as dependencies
- The existing `COMPARE_MONTHS_REGEX` in BotService currently returns "not yet supported" — task 6.1 replaces it with the actual handler
- CompareMonths use case injects `TransactionRepository` via `@Inject("TransactionRepository")` following the same pattern as GenerateTrendReport
- ExcelCompareGeneratorService reuses styling constants from ExcelTrendGeneratorService pattern
- CompareReportController follows the exact same structure as TrendReportController

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2", "5.2"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3"] },
    { "id": 7, "tasks": ["8.1", "8.2"] },
    { "id": 8, "tasks": ["9.1", "10.1", "10.2"] }
  ]
}
```
