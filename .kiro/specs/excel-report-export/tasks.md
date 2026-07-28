# Implementation Plan: Excel Report Export

## Overview

This plan implements a `GET /api/report/export` endpoint that generates a professionally styled Excel financial report with Vietnamese locale formatting. The implementation follows the existing Clean Architecture pattern: utilities first, then the application-layer service, then the HTTP controller, and finally module wiring and tests.

## Tasks

- [x] 1. Create utility functions
  - [x] 1.1 Create VND formatter utility
    - Create `src/application/services/vnd-formatter.ts`
    - Implement `formatVND(amount: number): string` that formats numbers with period as thousands separator and trailing " ₫" suffix
    - Handle zero, integers, and decimal amounts (round to whole number)
    - _Requirements: 4.2, 4.5, 5.4_

  - [x] 1.2 Create filename formatter utility
    - Create `src/application/services/filename-formatter.ts`
    - Implement `formatExportFilename(from: Date, to: Date): string` returning `bao-cao-chi-tieu-{dd-MM-yyyy}-{dd-MM-yyyy}.xlsx`
    - Zero-pad day and month values
    - _Requirements: 1.3_

- [x] 2. Implement ExcelGeneratorService
  - [x] 2.1 Create ExcelGeneratorService with header and summary sections
    - Create `src/application/services/ExcelGeneratorService.ts`
    - Install `exceljs` dependency: `npm install exceljs` and `npm install -D @types/exceljs` (if available, otherwise exceljs ships its own types)
    - Implement the `generate(summary: WeeklySummary, options: { from: Date; to: Date }): Promise<Buffer>` method
    - Build header section: title "BÁO CÁO CHI TIÊU" in merged row 1 (bold 16pt, centered), date range row 2 (italic 11pt, centered), generation date row 3 in Asia/Ho_Chi_Minh timezone (italic 11pt, centered), empty row 4
    - Build summary section: "TỔNG QUAN" header (bold 13pt), total spending row with VND formatting, category table sorted descending by amount with columns "Danh mục" and "Số tiền"
    - Handle empty categories case (display 0 ₫ total, empty table)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 2.2 Add transactions section to ExcelGeneratorService
    - Add "CHI TIẾT GIAO DỊCH" section header (bold 13pt)
    - Build transaction table with columns: STT, Ngày, Danh mục, Ghi chú, Số tiền
    - Sort transactions by effective date (spentAt ?? createdAt) descending, assign sequential STT starting from 1
    - Format dates as dd/MM/yyyy, amounts as VND
    - Add "Tổng cộng" sum row at bottom (bold)
    - Handle empty transactions (header row + sum row with 0 ₫)
    - Handle empty note field (display empty cell)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 8.1_

  - [x] 2.3 Add professional styling to ExcelGeneratorService
    - Apply header row style to table headers: bold font (10-12pt), solid background fill, thin borders on all sides
    - Apply thin borders to all data cells in tables
    - Auto-size columns with min 8 / max 50 character width
    - Apply alternating row fills on transaction data rows (no fill on odd rows, light fill on even rows)
    - Use at most two structural fill colors: one for all table headers, one distinct accent for total/summary rows
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 2.4 Add pie chart to ExcelGeneratorService
    - When `byCategory.length >= 2`, add a pie chart below the category table (at least one empty row gap)
    - Label each segment with category name and percentage rounded to nearest whole number (e.g., "Ăn uống 45%")
    - Omit the chart when fewer than 2 categories
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 3. Checkpoint
  - Ensure the ExcelGeneratorService compiles without errors and the utilities are importable. Ask the user if questions arise.

- [x] 4. Implement ExportController and module wiring
  - [x] 4.1 Create ExportController
    - Create `src/infrastructure/http/controllers/export.controller.ts`
    - Implement `GET /api/report/export` with `@Query("token")` parameter
    - Validate token presence → 400 with `{ "message": "Missing token" }` if absent
    - Verify token via `TokenService.verifyReportToken` → 404 with `{ "message": "Report not found or link expired" }` if invalid
    - Convert token payload dates (ISO strings) to Date objects
    - Call `GenerateWeeklyReport.execute(userId, { from, to })`
    - Call `ExcelGeneratorService.generate(summary, { from, to })`
    - Set response headers: `Content-Type` to xlsx MIME type, `Content-Disposition` using filename-formatter, `Access-Control-Expose-Headers: Content-Disposition`
    - Send buffer as response body
    - Wrap in try/catch: unexpected errors → log with NestJS Logger at error level, return 500 with `{ "message": "Failed to generate report" }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 8.2, 8.3, 9.2_

  - [x] 4.2 Update ApplicationModule to export ExcelGeneratorService
    - Add `ExcelGeneratorService` to providers and exports in `src/application/application.module.ts`
    - _Requirements: 1.1_

  - [x] 4.3 Update HttpModule to register ExportController
    - Add `ExportController` to controllers in `src/infrastructure/http/http.module.ts`
    - _Requirements: 1.1_

  - [x] 4.4 Configure CORS for Content-Disposition header exposure
    - Ensure the main CORS configuration (in `src/main.ts` or app bootstrap) exposes the `Content-Disposition` header via `exposedHeaders`
    - Verify CORS origin is read from `CORS_ORIGIN` environment variable
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 5. Checkpoint
  - Ensure the project builds successfully with `npm run build`. Ensure all tests pass with `npm test`. Ask the user if questions arise.

- [x] 6. Write tests
  - [x] 6.1 Write unit tests for ExportController
    - Create `test/controllers/export-controller.spec.ts`
    - Test: valid token returns 200 with correct Content-Type and Content-Disposition headers
    - Test: missing token returns 400 with error message
    - Test: invalid/expired token returns 404 with error message
    - Test: unexpected error returns 500 and logs the error
    - Mock TokenService, GenerateWeeklyReport, and ExcelGeneratorService
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.3, 8.2, 8.3_

  - [x] 6.2 Write unit tests for ExcelGeneratorService
    - Create `test/services/excel-generator.spec.ts`
    - Test: generated workbook has correct header section (title, date range, generation date)
    - Test: generated workbook has summary section with VND-formatted totals
    - Test: transactions are sorted descending by date with sequential STT
    - Test: empty transactions produce valid workbook with 0 ₫ totals
    - Test: pie chart is included when categories >= 2, omitted otherwise
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.5, 7.1, 7.4, 8.1_

  - [ ]* 6.3 Write property tests for VND formatter
    - Create `test/services/vnd-formatter.property.spec.ts`
    - **Property 1: VND Currency Formatting Round-Trip**
    - Generate random non-negative integers and decimals, verify period separators and ₫ suffix, verify parsing back yields original amount
    - **Validates: Requirements 4.2, 4.5, 5.4**

  - [ ]* 6.4 Write property tests for filename formatter
    - Create `test/services/filename-formatter.property.spec.ts`
    - **Property 9: Content-Disposition Filename Format**
    - Generate random valid date pairs, verify output matches `bao-cao-chi-tieu-{DD-MM-YYYY}-{DD-MM-YYYY}.xlsx` with zero-padded components
    - **Validates: Requirements 1.3**

  - [ ]* 6.5 Write property tests for ExcelGeneratorService
    - Create `test/services/excel-generator.property.spec.ts`
    - **Property 2: Category Sort Order** — generate random category arrays, verify descending order in output
    - **Property 3: Transaction Sort Order and Sequential STT** — generate random transactions, verify sort and STT sequence
    - **Property 4: Transaction Total Row Integrity** — generate random transactions, verify sum row equals sum of amounts
    - **Property 8: Chart Conditional Inclusion** — generate random summaries with 0-10 categories, verify chart presence iff categories >= 2
    - **Validates: Requirements 4.4, 5.5, 5.6, 5.7, 7.1, 7.4**

- [x] 7. Final checkpoint
  - Ensure all tests pass with `npm test`. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TypeScript with NestJS and Jest for testing
- `fast-check` is already installed for property-based testing
- `exceljs` needs to be installed as a new dependency

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 4, "tasks": ["4.4"] },
    { "id": 5, "tasks": ["6.1", "6.2", "6.3", "6.4"] },
    { "id": 6, "tasks": ["6.5"] }
  ]
}
```
