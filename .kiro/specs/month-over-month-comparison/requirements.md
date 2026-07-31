# Requirements Document

## Introduction

Tính năng so sánh tháng cho phép user so sánh chi tiêu giữa hai tháng bất kỳ hoặc hai tháng gần nhất, hiển thị sự khác biệt theo từng danh mục. User có thể gõ "so sánh tháng 7 với tháng 8" để chỉ định cụ thể, hoặc "so sánh tháng" để tự động so sánh hai tháng gần nhất. Kết quả trả về dưới dạng text message trên Telegram với breakdown theo category, chênh lệch số tiền và phần trăm thay đổi.

Ngoài bot interface, tính năng còn expose REST API cho web app: JSON report endpoint và Excel export endpoint (theo pattern giống TrendReportController). Bot cũng gửi kèm link webview khi trả kết quả so sánh. Excel export có 3 tabs: tổng quan so sánh, chi tiết tháng A, chi tiết tháng B.

## Glossary

- **Bot_Service**: NestJS service (BotService) nhận tin nhắn từ Telegram và routing đến use case phù hợp
- **Compare_Months_Handler**: Logic handler trong Bot_Service xử lý yêu cầu so sánh tháng
- **Compare_Use_Case**: Application use case thực hiện logic so sánh chi tiêu giữa hai tháng
- **Compare_Report_Controller**: NestJS HTTP controller xử lý API requests cho so sánh tháng (JSON report + Excel export)
- **Excel_Compare_Generator_Service**: Application service tạo file Excel so sánh tháng với 3 tabs
- **Token_Service**: Service tạo và xác thực JWT token cho các report links
- **Transaction_Repository**: Port/interface để query transactions theo user và date range
- **Month_Comparison_Result**: Entity chứa kết quả so sánh bao gồm tổng chi, breakdown theo category, và phần trăm thay đổi
- **Category_Diff**: Một entry trong kết quả so sánh, chứa tên category, số tiền tháng A, số tiền tháng B, và phần trăm thay đổi
- **COMPARE_MONTHS_REGEX**: Regex pattern trong Bot_Service dùng để nhận diện các lệnh so sánh tháng

## Requirements

### Requirement 1: Nhận diện lệnh so sánh tháng

**User Story:** As a user, I want to type natural Vietnamese phrases to compare months, so that I can quickly see spending differences without memorizing exact commands.

#### Acceptance Criteria

1. WHEN a message matches the pattern "so sánh tháng X với/và/vs tháng Y" (where X and Y are month numbers 1–12), THE Bot_Service SHALL route the message to Compare_Months_Handler with month X as the first month and month Y as the second month
2. WHEN a message matches the pattern "so sánh tháng" without specifying month numbers, THE Bot_Service SHALL route the message to Compare_Months_Handler with the two most recent months (current month and previous month) as parameters
3. WHEN a message matches the pattern "so sánh tháng X với tháng Y" and X equals Y, THE Bot_Service SHALL reply with an error message indicating that two different months are required
4. THE COMPARE_MONTHS_REGEX SHALL recognize the following separators between month numbers: "với", "và", "vs"
5. WHEN a message matches the compare pattern, THE Bot_Service SHALL parse the month numbers and infer the year based on the current date — if the specified month is in the future relative to the current month of the current year, the system SHALL assign the previous year to that month

### Requirement 2: Xử lý so sánh hai tháng gần nhất

**User Story:** As a user, I want a shortcut to compare recent months without typing specific numbers, so that I can quickly check my spending trend.

#### Acceptance Criteria

1. WHEN Compare_Use_Case receives a request without specific months, THE Compare_Use_Case SHALL determine the two most recent months as: the current month and the immediately preceding month
2. WHEN the current month is January AND no specific months are provided (shortcut mode), THE Compare_Use_Case SHALL compare January of the current year with December of the previous year — this year-crossing logic SHALL NOT apply when months are explicitly specified by the user
3. THE Compare_Use_Case SHALL fetch transactions for both months from Transaction_Repository using the full date range of each month (first day 00:00:00 to last day 23:59:59)

### Requirement 3: Truy vấn và tổng hợp dữ liệu chi tiêu

**User Story:** As a user, I want the comparison to include all my expenses categorized correctly, so that I can see exactly where my spending changed.

#### Acceptance Criteria

1. WHEN Compare_Use_Case executes, THE Compare_Use_Case SHALL query Transaction_Repository for all transactions belonging to the user within each of the two specified months
2. THE Compare_Use_Case SHALL aggregate transactions by category for each month, summing only positive amounts (expenses) and excluding negative amounts (income)
3. THE Compare_Use_Case SHALL include all categories that appear in either month, showing zero for categories with no transactions in one of the months
4. THE Compare_Use_Case SHALL compute the total spending for each month as the sum of all positive transaction amounts in that month

### Requirement 4: Tính toán chênh lệch và phần trăm thay đổi

**User Story:** As a user, I want to see both absolute and percentage differences, so that I can understand the magnitude of changes in my spending.

#### Acceptance Criteria

1. FOR EACH category present in either month, THE Compare_Use_Case SHALL calculate the absolute difference (month B amount minus month A amount) and the percentage change relative to month A
2. WHEN month A amount for a category is zero and month B amount is greater than zero, THE Compare_Use_Case SHALL represent the percentage change as "mới" (new category) instead of a numeric percentage
3. WHEN month B amount for a category is zero and month A amount is greater than zero, THE Compare_Use_Case SHALL represent the percentage change as -100%
4. THE Month_Comparison_Result SHALL contain: month A label, month B label, total spent month A, total spent month B, total difference, total percentage change, and an array of Category_Diff entries sorted by absolute difference descending

### Requirement 5: Định dạng và gửi kết quả so sánh

**User Story:** As a user, I want the comparison result displayed clearly in Vietnamese with easy-to-read formatting, so that I can quickly understand the data.

#### Acceptance Criteria

1. WHEN Compare_Months_Handler receives a Month_Comparison_Result, THE Bot_Service SHALL format a reply message containing: a header line with the two month labels, total spending for each month with the difference and percentage, and a category-by-category breakdown
2. THE Bot_Service SHALL format each Category_Diff line as: "• {category}: {monthA amount}đ → {monthB amount}đ ({sign}{difference}đ, {sign}{percentage}%)" with amounts formatted using Vietnamese locale (dot thousands separator)
3. WHEN a category's spending increased, THE Bot_Service SHALL prefix the difference with "+" and use the "↑" indicator
4. WHEN a category's spending decreased, THE Bot_Service SHALL prefix the difference with "-" and use the "↓" indicator
5. WHEN a category's spending is unchanged, THE Bot_Service SHALL show "→" indicator with "0đ" difference
6. THE Bot_Service SHALL display categories sorted by absolute difference descending, showing the categories with the largest changes first
7. WHEN either month has no transaction data, THE Bot_Service SHALL reply with a message indicating no spending data is available for that month

### Requirement 6: Xử lý lỗi

**User Story:** As a user, I want clear error messages when something goes wrong, so that I know what happened and what to do next.

#### Acceptance Criteria

1. IF Transaction_Repository fails to retrieve transactions due to a connection error, THEN THE Bot_Service SHALL reply with "Hệ thống đang gặp sự cố tạm thời, sếp thử lại sau nhé 🙏"
2. IF the specified month numbers are outside the valid range (less than 1 or greater than 12), THEN THE Bot_Service SHALL reply with an error message indicating valid month range is 1 to 12
3. IF both months resolve to future months (no historical data possible), THEN THE Bot_Service SHALL reply with a message indicating that comparison requires at least one month with past data
4. WHEN a connection error occurs, THE Bot_Service SHALL return the connection error message immediately without performing input validation first


### Requirement 7: REST API cho comparison report (JSON)

**User Story:** As a web app developer, I want a REST API endpoint that returns month comparison data as JSON, so that the web frontend can render a rich comparison view.

#### Acceptance Criteria

1. THE Compare_Report_Controller SHALL expose a GET endpoint at path "/api/report/compare" accepting query parameters: token, monthA, yearA, monthB, yearB
2. WHEN a request is received at "/api/report/compare", THE Compare_Report_Controller SHALL verify the token using Token_Service verifyReportToken method
3. IF the token is missing or invalid, THEN THE Compare_Report_Controller SHALL respond with HTTP 401 and body containing error "INVALID_TOKEN"
4. IF monthA or monthB is outside valid range 1 to 12, THEN THE Compare_Report_Controller SHALL respond with HTTP 400 and body containing error "INVALID_MONTH"
5. IF yearA or yearB is missing, THEN THE Compare_Report_Controller SHALL respond with HTTP 400 and body containing error "MISSING_YEAR"
6. WHEN token is valid and parameters are correct, THE Compare_Report_Controller SHALL invoke Compare_Use_Case with the authenticated userId, monthA/yearA, and monthB/yearB, and return the Month_Comparison_Result as JSON response
7. IF Compare_Use_Case throws an unexpected error, THEN THE Compare_Report_Controller SHALL respond with HTTP 500 and body containing error "INTERNAL_ERROR"
8. THE Compare_Report_Controller SHALL validate in the following order: token verification first, then parameter validation (monthA/yearA/monthB/yearB) — the first validation failure encountered SHALL be returned without checking subsequent validations

### Requirement 8: REST API cho Excel export so sánh tháng

**User Story:** As a web app developer, I want a REST API endpoint that exports the month comparison as an Excel file, so that users can download a formatted spreadsheet.

#### Acceptance Criteria

1. THE Compare_Report_Controller SHALL expose a GET endpoint at path "/api/report/compare/export" accepting query parameters: token, monthA, yearA, monthB, yearB
2. WHEN a request is received at "/api/report/compare/export", THE Compare_Report_Controller SHALL verify the token using Token_Service verifyReportToken method
3. IF the token is missing or invalid, THEN THE Compare_Report_Controller SHALL respond with HTTP 401 and body containing error "INVALID_TOKEN"
4. IF monthA or monthB is outside valid range 1 to 12, THEN THE Compare_Report_Controller SHALL respond with HTTP 400 and body containing error "INVALID_MONTH"
5. WHEN token is valid and parameters are correct, THE Compare_Report_Controller SHALL invoke Compare_Use_Case, pass the result to Excel_Compare_Generator_Service, and respond with Content-Type "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" and Content-Disposition as attachment with filename pattern "so-sanh-thang-{monthA}-{yearA}-vs-{monthB}-{yearB}.xlsx"
6. THE Compare_Report_Controller SHALL set the "Access-Control-Expose-Headers" response header to include "Content-Disposition"

### Requirement 9: Excel export với 3 tabs

**User Story:** As a user, I want the comparison Excel file to have separate tabs for the overview and each month's details, so that I can review both the comparison and individual month data.

#### Acceptance Criteria

1. THE Excel_Compare_Generator_Service SHALL generate an Excel workbook containing exactly 3 worksheets
2. THE Excel_Compare_Generator_Service SHALL name the first worksheet "So sánh" and populate it with the overall comparison data: header row with both month labels, each category showing month A amount, month B amount, absolute difference, and percentage change — sorted by absolute difference descending
3. THE Excel_Compare_Generator_Service SHALL name the second worksheet "Tháng {A}" (where A is the month number) and populate it with detailed transactions and category breakdown for month A, following the same layout as the monthly tabs in ExcelTrendGeneratorService (category breakdown table and transaction detail table with STT, date, category, note, amount)
4. THE Excel_Compare_Generator_Service SHALL name the third worksheet "Tháng {B}" (where B is the month number) and populate it with detailed transactions and category breakdown for month B, following the same layout as the monthly tabs in ExcelTrendGeneratorService
5. THE Excel_Compare_Generator_Service SHALL apply consistent styling matching existing Excel services: header fills, borders, alternating row fills, and auto-sized columns
6. THE Excel_Compare_Generator_Service SHALL include a "Tổng cộng" summary row at the bottom of each category breakdown table and each transaction detail table

### Requirement 10: Bot gửi kèm link webview so sánh

**User Story:** As a user, I want the bot to include a clickable link to a visual comparison page when showing comparison results, so that I can view the data in a richer format on the web.

#### Acceptance Criteria

1. WHEN Compare_Months_Handler sends the comparison reply message, THE Bot_Service SHALL generate a report token using Token_Service with the userId, monthA, yearA, monthB, and yearB as payload
2. WHEN Compare_Months_Handler sends the comparison reply message, THE Bot_Service SHALL append a webview link with pattern "{webviewBaseUrl}/compare?token={token}&monthA={X}&yearA={YYYY}&monthB={Y}&yearB={YYYY}" at the end of the reply message
3. THE Bot_Service SHALL format the webview link line as: "🔗 Xem chi tiết: {url}"

### Requirement 11: Cập nhật README với API specification

**User Story:** As a web developer on the team, I want the README to document the compare API endpoints with sample request and response, so that I can implement the frontend without needing to read backend code.

#### Acceptance Criteria

1. WHEN the feature is implemented, THE README.md SHALL include documentation for the GET "/api/report/compare" endpoint with: description, query parameters (token, monthA, yearA, monthB, yearB), sample request URL, and sample JSON response structure
2. WHEN the feature is implemented, THE README.md SHALL include documentation for the GET "/api/report/compare/export" endpoint with: description, query parameters, and response format (Excel file attachment)
3. THE README.md API documentation SHALL be placed in the same section as existing API documentation for report and trend endpoints

### Requirement 12: Cập nhật /help message

**User Story:** As a user, I want to see the month comparison commands listed in the help message, so that I know this feature exists and how to use it.

#### Acceptance Criteria

1. THE Bot_Service SHALL include "so sánh tháng" and "so sánh tháng X với tháng Y" commands in the report section ("📊 Xem báo cáo") of the HELP_MSG constant
2. THE Bot_Service SHALL describe the compare commands as: "• so sánh tháng (2 tháng gần nhất)" and "• so sánh tháng X với tháng Y"

### Requirement 13: Bảo toàn unit tests hiện tại

**User Story:** As a developer, I want assurance that the new feature does not break existing functionality, so that the system remains stable.

#### Acceptance Criteria

1. WHEN the feature is implemented, all existing unit tests SHALL continue to pass without modification
2. THE Compare_Use_Case SHALL have unit tests covering: comparison with two specified months, comparison with default recent months, months with no data, months spanning different years, and percentage calculation edge cases (zero to non-zero, non-zero to zero)
3. THE Compare_Report_Controller SHALL have unit tests covering: valid token with correct parameters, missing token, invalid token, invalid month values, and successful JSON and Excel responses
