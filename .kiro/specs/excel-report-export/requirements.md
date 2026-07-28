# Requirements Document

## Introduction

This feature adds a new API endpoint to the oh-my-fast-tracker backend that generates and returns a professionally formatted Excel financial report. The endpoint is consumed by the expense-report-web frontend when users click the "Export" button. The Excel file presents expense data as a formal financial report suitable for business use, with Vietnamese locale support (VND currency formatting).

## Glossary

- **Export_Controller**: The NestJS controller that handles the Excel export HTTP request at `GET /api/report/export`
- **Excel_Generator**: The application-layer service responsible for building the Excel workbook from a WeeklySummary
- **WeeklySummary**: Existing domain entity containing total spending, category breakdown, and transaction list for a date range
- **Report_Token**: A JWT token containing userId, from (ISO date), and to (ISO date) used to authenticate and scope the report
- **Workbook**: The Excel file object containing one or more worksheets with formatted data
- **Category_Summary**: A row in the category breakdown section showing category name and total amount
- **Transaction_Row**: A row in the detailed transactions section showing date, category, note, and amount

## Requirements

### Requirement 1: Excel Export Endpoint

**User Story:** As a user of the expense-report-web app, I want to export my financial report as an Excel file, so that I can save, print, or share a professional report of my expenses.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/report/export` with a valid `token` query parameter, THE Export_Controller SHALL return an Excel file as a binary response body with HTTP status 200
2. WHEN the Export_Controller returns a successful response, THE Export_Controller SHALL set the `Content-Type` response header to `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
3. WHEN the Export_Controller returns a successful response, THE Export_Controller SHALL set the `Content-Disposition` response header to `attachment; filename="bao-cao-chi-tieu-{from}-{to}.xlsx"` where `{from}` and `{to}` are the Report_Token dates formatted as `dd-MM-yyyy`
4. IF the `token` query parameter is missing, THEN THE Export_Controller SHALL return HTTP 400 with a JSON error message indicating the token is required
5. IF the `token` is invalid or expired, THEN THE Export_Controller SHALL return HTTP 404 with a JSON error message consistent with the existing report endpoint

### Requirement 2: Token Authentication

**User Story:** As the system operator, I want the export endpoint to use the same JWT authentication as the existing report endpoint, so that only authorized users can export their data.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/report/export` with a `token` query parameter, THE Export_Controller SHALL verify the Report_Token by calling TokenService.verifyReportToken
2. THE Export_Controller SHALL pass the extracted userId, from, and to fields from the verified Report_Token to the GenerateWeeklyReport use case, converting the from and to ISO date strings to Date objects
3. IF the Report_Token verification fails due to an invalid signature or expiration, THEN THE Export_Controller SHALL return HTTP 404 with an error message consistent with the existing report endpoint behavior

### Requirement 3: Report Header Section

**User Story:** As a user, I want the Excel report to have a professional header, so that the report is clearly identified with title, date range, and generation date.

#### Acceptance Criteria

1. THE Excel_Generator SHALL include a report title "BÁO CÁO CHI TIÊU" (Expense Report) in row 1, merged and center-aligned across all data columns of the worksheet
2. THE Excel_Generator SHALL display the date range in row 2, formatted as "Từ dd/MM/yyyy đến dd/MM/yyyy" using the from and to dates from the Report_Token, center-aligned across all data columns
3. THE Excel_Generator SHALL display the report generation date in row 3, formatted as "Ngày xuất: dd/MM/yyyy HH:mm" using the server's local timezone (Asia/Ho_Chi_Minh), center-aligned across all data columns
4. THE Excel_Generator SHALL style the title row with bold font and size 16
5. THE Excel_Generator SHALL style the subtitle row (row 2) and generation date row (row 3) with italic font and size 11
6. THE Excel_Generator SHALL leave row 4 empty as a visual separator between the header section and the content sections below

### Requirement 4: Summary Section

**User Story:** As a user, I want to see a summary of my spending by category, so that I can quickly understand where my money went.

#### Acceptance Criteria

1. THE Excel_Generator SHALL include a "TỔNG QUAN" (Summary) section header with bold font and size 13
2. THE Excel_Generator SHALL display a "Tổng chi tiêu:" label followed by the total spending amount formatted as VND currency (e.g., "1.234.567 ₫") positioned above the category breakdown table
3. THE Excel_Generator SHALL display a table of spending by category with columns "Danh mục" (Category) and "Số tiền" (Amount), where the Amount column is formatted as VND currency
4. THE Excel_Generator SHALL sort the category breakdown by amount in descending order
5. THE Excel_Generator SHALL format all monetary values using Vietnamese locale with period as thousands separator and "₫" symbol
6. IF the WeeklySummary contains zero categories, THEN THE Excel_Generator SHALL display the summary section with a total of "0 ₫" and an empty category table

### Requirement 5: Detailed Transactions Section

**User Story:** As a user, I want to see a detailed list of all transactions in the report, so that I can review individual expenses.

#### Acceptance Criteria

1. THE Excel_Generator SHALL include a "CHI TIẾT GIAO DỊCH" (Transaction Details) section header with bold font and size 13
2. THE Excel_Generator SHALL display a table with columns: "STT" (No.), "Ngày" (Date), "Danh mục" (Category), "Ghi chú" (Note), "Số tiền" (Amount)
3. THE Excel_Generator SHALL format the "Ngày" column as dd/MM/yyyy
4. THE Excel_Generator SHALL format the "Số tiền" column using Vietnamese locale with period as thousands separator and "₫" symbol, consistent with the Summary section formatting
5. THE Excel_Generator SHALL sort transactions by spentAt date in descending order (most recent first), and assign the "STT" column sequentially starting from 1 based on the sorted order
6. IF a transaction has no spentAt value, THEN THE Excel_Generator SHALL fall back to the createdAt date for sorting and display
7. THE Excel_Generator SHALL include a sum total row at the bottom of the transactions table with the label "Tổng cộng" in the "Ghi chú" column and the sum of all displayed transaction amounts in the "Số tiền" column, styled with bold font
8. IF the note field of a transaction is empty, THEN THE Excel_Generator SHALL display an empty cell in the "Ghi chú" column

### Requirement 6: Professional Styling

**User Story:** As a user, I want the Excel report to look professional like a business financial report, so that I can present it formally if needed.

#### Acceptance Criteria

1. THE Excel_Generator SHALL apply a header row style to table headers with bold font, font size between 10pt and 12pt, a solid background fill color, and thin borders on all four sides of each header cell
2. THE Excel_Generator SHALL apply thin borders on all four sides to every data cell in tables
3. THE Excel_Generator SHALL auto-size column widths to fit content with a minimum width of 8 characters and a maximum width of 50 characters
4. THE Excel_Generator SHALL apply an alternating background fill color to data rows in the transactions table, starting with no fill on the first data row and a light fill on the second data row, repeating for all subsequent rows
5. THE Excel_Generator SHALL use the same background fill color for all table header rows across the report and a distinct accent fill color for all total/summary rows, so that no more than two fill colors are used for structural emphasis throughout the workbook

### Requirement 7: Category Chart

**User Story:** As a user, I want a visual chart showing spending by category, so that I can quickly grasp the distribution of my expenses.

#### Acceptance Criteria

1. WHEN the WeeklySummary contains two or more categories, THE Excel_Generator SHALL include a pie chart showing spending distribution by category, using the byCategory data from the WeeklySummary
2. THE Excel_Generator SHALL position the chart below the category breakdown table in the summary section, leaving at least one empty row between the table and the chart
3. THE Excel_Generator SHALL label each chart segment with the category name and percentage rounded to the nearest whole number (e.g., "Ăn uống 45%")
4. IF the WeeklySummary contains fewer than two categories, THEN THE Excel_Generator SHALL omit the chart

### Requirement 8: Error Handling

**User Story:** As a developer, I want the export endpoint to handle errors gracefully, so that the web-app can display appropriate messages to the user.

#### Acceptance Criteria

1. IF the GenerateWeeklyReport use case returns an empty transaction list, THEN THE Excel_Generator SHALL still generate a valid Excel file with header and summary sections showing zero totals and an empty transactions table with only the header row and sum total row displaying 0 ₫
2. IF an unexpected error occurs during Excel generation or data retrieval, THEN THE Export_Controller SHALL return HTTP 500 with a JSON body containing a "message" field that indicates the nature of the failure
3. IF an unexpected error occurs during Excel generation or data retrieval, THEN THE Export_Controller SHALL log the error at "error" level using the standard NestJS logger before returning the HTTP 500 response

### Requirement 9: CORS Support

**User Story:** As the frontend developer, I want the export endpoint to support CORS, so that the expense-report-web app can download the file from a different origin.

#### Acceptance Criteria

1. THE Export_Controller SHALL allow cross-origin GET requests from the origin specified in the CORS_ORIGIN environment variable
2. THE Export_Controller SHALL expose the `Content-Disposition` header to cross-origin clients via the `Access-Control-Expose-Headers` response header, so that the browser can read the filename for the downloaded file
3. IF a cross-origin preflight (OPTIONS) request is received for the export endpoint, THEN THE Export_Controller SHALL respond with HTTP 204 and the appropriate CORS allow headers within 500 ms
