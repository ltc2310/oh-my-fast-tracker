# Requirements Document

## Introduction

Tính năng cho phép người dùng thiết lập định mức chi tiêu hàng tháng cho từng danh mục (ví dụ: 5 triệu cho ăn uống, 10 triệu cho di chuyển). Khi chi tiêu đạt 80% định mức, chatbot sẽ gửi cảnh báo. Khi chi tiêu vượt quá định mức, chatbot sẽ gửi thông báo vượt mức. Người dùng có thể thiết lập và thay đổi định mức trực tiếp qua tin nhắn chat.

## Glossary

- **Bot**: Telegram chatbot xử lý tin nhắn từ user
- **Budget_Limit**: Định mức chi tiêu tối đa mà user thiết lập cho một danh mục trong một tháng, lưu trữ dưới dạng số tiền (VND)
- **Budget_Repository**: Repository lưu trữ và truy vấn định mức chi tiêu của user theo danh mục và tháng
- **Transaction_Repository**: Repository lưu trữ giao dịch chi tiêu (đã tồn tại trong hệ thống)
- **Budget_Checker**: Service kiểm tra tổng chi tiêu hiện tại so với định mức đã thiết lập cho danh mục tương ứng
- **Warning_Threshold**: Ngưỡng cảnh báo mặc định là 80% của Budget_Limit
- **Budget_Command_Parser**: Logic nhận diện và parse tin nhắn thiết lập/thay đổi định mức từ user
- **Category**: Danh mục chi tiêu (ví dụ: ăn uống, di chuyển, giải trí) — sử dụng cùng hệ thống category với Transaction hiện tại

## Requirements

### Requirement 1: Thiết lập định mức chi tiêu

**User Story:** As a user, I want to set monthly budget limits for each expense category via chat, so that I can control my spending per category.

#### Acceptance Criteria

1. WHEN the user sends a message matching Budget_Command_Parser set pattern (ví dụ: "đặt định mức ăn uống 5tr", "set budget ăn uống 5000000", "định mức di chuyển 10tr", "giới hạn ăn uống 5 triệu"), THE Bot SHALL parse the category name and amount, then save the Budget_Limit for the current month
2. WHEN the Budget_Repository saves a new Budget_Limit, THE Budget_Repository SHALL store user_id, category, amount, and the month-year that the limit applies to
3. WHEN the Bot successfully saves a Budget_Limit, THE Bot SHALL confirm to the user with a message including the category name, the limit amount formatted in VND (using dot as thousand separator and "đ" suffix, e.g. "5.000.000đ"), and the applicable month (format "tháng M/YYYY")
4. IF the user sets a Budget_Limit for a category that already has a limit in the current month, THEN THE Budget_Repository SHALL overwrite the existing limit with the new value
5. IF the Budget_Command_Parser cannot extract a valid amount (amount must be between 1,000 VND and 10,000,000,000 VND inclusive) from the user's message, THEN THE Bot SHALL inform the user of the invalid format and provide an example of the correct format
6. THE Budget_Command_Parser SHALL recognize Vietnamese currency shorthand including "k" (nghìn = ×1,000), "tr" (triệu = ×1,000,000), "trieu", "triệu", and full numeric values greater than or equal to 1,000
7. IF the Budget_Command_Parser extracts an amount but the category name does not match any known Category in the system's category list, THEN THE Bot SHALL inform the user that the category was not recognized and list the available categories
8. IF the Budget_Repository fails to save the Budget_Limit (e.g. database unavailable), THEN THE Bot SHALL inform the user that the operation failed and suggest retrying

### Requirement 2: Cảnh báo khi đạt 80% định mức

**User Story:** As a user, I want to receive a warning when my spending reaches 80% of my budget limit, so that I can adjust my spending before exceeding the limit.

#### Acceptance Criteria

1. WHEN a transaction is recorded AND the total spending for that category in the current calendar month reaches or exceeds 80% of the Budget_Limit AND the total has not yet exceeded 100% of the Budget_Limit, THE Bot SHALL include a warning message immediately following the transaction confirmation in the same response flow
2. THE warning message SHALL include: the category name, the current total spent amount formatted using the VND format (e.g., "1.234.567 ₫"), the Budget_Limit amount formatted using the VND format, and the percentage of the limit used displayed as a whole number (rounded down)
3. THE Budget_Checker SHALL calculate total spending by summing all transaction amounts for the user in the specified category where spent_at falls within the current calendar month (from day 1 at 00:00:00 to the current date at 23:59:59, using the UTC+7 timezone)
4. IF no Budget_Limit is set for the category of the recorded transaction, THEN THE Budget_Checker SHALL skip the threshold check entirely and no warning SHALL be sent
5. THE Budget_Checker SHALL send the 80% warning at most once per category per calendar month — after the first warning is sent for a category, subsequent transactions in the same category that remain between 80% and 100% SHALL NOT trigger additional warnings. The warning state SHALL reset automatically at the start of each new calendar month (day 1 at 00:00:00 UTC+7)

### Requirement 3: Thông báo khi vượt định mức

**User Story:** As a user, I want to receive an alert when my spending exceeds my budget limit, so that I am immediately aware of overspending and can choose to update my limit.

#### Acceptance Criteria

1. WHEN a transaction is recorded AND the sum of all transaction amounts for the same user, same category, within the current calendar month (1st 00:00:00 to last day 23:59:59, UTC+7 timezone) crosses from below 100% to at or above 100% of the Budget_Limit for that category, THE Bot SHALL include an over-budget alert message immediately following the transaction confirmation in the same response flow
2. THE over-budget alert message SHALL include: the category name, the current total spent amount formatted in VND, the Budget_Limit amount formatted in VND, the amount exceeding the limit (current total minus Budget_Limit) formatted in VND, and a prompt asking the user whether they want to update the budget limit (e.g., "Bạn đã vượt quá hạn mức [category]. Bạn có muốn cập nhật lại hạn mức không?")
3. WHEN the user replies affirmatively to the over-budget prompt (e.g., "có", "ok", "ừ", "yes"), THE Bot SHALL ask the user for the new limit amount for that category and process the update following Requirement 4 logic
4. WHEN the user replies negatively to the over-budget prompt (e.g., "không", "no", "thôi", "bỏ qua"), THE Bot SHALL acknowledge the response and take no further action regarding the budget limit update
5. IF no Budget_Limit is configured for a category, THEN THE Bot SHALL NOT send any over-budget alert for transactions in that category
6. THE Budget_Checker SHALL send the over-budget alert only once per category per calendar month — the first transaction that causes total spending to cross from below 100% to at or above 100% triggers the alert; subsequent transactions in the same category within the same calendar month SHALL NOT trigger additional over-budget alerts
7. WHEN a user changes the Budget_Limit for a category (Requirement 4) AND the new limit is higher than the current monthly spending for that category, THE Budget_Checker SHALL reset the alert state for that category in the current month, allowing a future alert to trigger again if spending subsequently crosses the new limit
8. IF a user changes the Budget_Limit for a category AND the new limit is equal to or lower than the current monthly spending for that category, THEN THE Budget_Checker SHALL immediately send one over-budget alert for that category and mark the alert as triggered for the current month

### Requirement 4: Thay đổi định mức chi tiêu

**User Story:** As a user, I want to update my budget limit for a category via chat, so that I can adjust my budget as my needs change.

#### Acceptance Criteria

1. WHEN the user sends a message matching Budget_Command_Parser update pattern (ví dụ: "sửa định mức ăn uống 7tr", "đổi budget di chuyển 12tr", "cập nhật định mức giải trí 3 triệu"), THE Bot SHALL parse the category name and the new amount, then update the Budget_Limit for the specified category in the current month
2. WHEN the Bot successfully updates a Budget_Limit, THE Bot SHALL confirm the change with a message showing the category name, the old limit amount, and the new limit amount formatted in VND
3. IF the user attempts to update a Budget_Limit for a category that has no existing limit in the current month, THEN THE Bot SHALL create a new Budget_Limit for that category (same behavior as Requirement 1)
4. IF the Budget_Command_Parser cannot extract a valid amount (amount must be greater than zero) from the update message, THEN THE Bot SHALL inform the user of the invalid format and provide an example of the correct update format
5. IF the Budget_Command_Parser cannot match the category name in the update message to any known Category in the system, THEN THE Bot SHALL inform the user that the category was not recognized and list the available categories

### Requirement 5: Xem định mức hiện tại

**User Story:** As a user, I want to view my current budget limits and spending status, so that I can track how much I have left in each category.

#### Acceptance Criteria

1. WHEN the user sends a message matching a view-budget pattern (ví dụ: "xem định mức", "xem budget", "định mức tháng này", "ngân sách"), THE Bot SHALL display all Budget_Limits for the current calendar month (ngày 1 đến ngày cuối tháng) along with a per-category spending summary
2. THE budget summary message SHALL include for each category with a Budget_Limit: the category name, the Budget_Limit amount formatted in VND (thousands-separated with "đ" suffix), the current total spent amount formatted in VND, the remaining amount formatted in VND, and the usage percentage displayed as an integer (rounded down) followed by "%"
3. IF the user has no Budget_Limits set for the current month, THEN THE Bot SHALL inform the user that no limits are set and provide an example of how to set one
4. THE budget summary SHALL sort categories by usage percentage in descending order (highest usage first)
5. IF the current total spent in a category exceeds its Budget_Limit, THEN THE Bot SHALL display the remaining amount as a negative value and the usage percentage as greater than 100%, with a visual indicator distinguishing overspent categories from within-budget categories
6. WHEN calculating current total spent for a category, THE Bot SHALL sum all Transaction amounts in that category where the spentAt date falls within the current calendar month (from day 1 00:00:00 to current moment)

### Requirement 6: Lưu trữ định mức

**User Story:** As a user, I want my budget limits to persist across sessions, so that I don't have to re-enter them.

#### Acceptance Criteria

1. THE Budget_Repository SHALL store Budget_Limits in a database table with columns: id (UUID primary key), user_id (text), category (text, maximum 50 characters), amount (numeric, range 1 to 999,999,999.99), month_year (text in format "YYYY-MM"), created_at (timestamptz), and updated_at (timestamptz)
2. THE Budget_Repository SHALL enforce a unique constraint on (user_id, category, month_year) to prevent duplicate limits
3. WHEN the user sets a Budget_Limit for a (user_id, category, month_year) combination that already exists, THE Budget_Repository SHALL update the existing record's amount and updated_at fields rather than inserting a duplicate
4. WHEN a new month begins AND the user has Budget_Limits from the previous month AND the user has no Budget_Limits for the new month, THE Budget_Repository SHALL NOT automatically carry over limits — the user must set new limits each month
5. WHEN Budget_Limits are queried for a specific user and month_year combination, THE Budget_Repository SHALL return all matching records in a single database query, returning an empty collection if no limits exist for that period
6. IF the database is unreachable or a write operation fails, THEN THE Budget_Repository SHALL propagate an error indicating the storage failure without silently discarding the data

### Requirement 7: Theo dõi trạng thái cảnh báo

**User Story:** As a system operator, I want the alert state to be tracked reliably, so that users receive exactly one warning and one over-budget alert per category per month.

#### Acceptance Criteria

1. THE Budget_Repository SHALL store alert state with fields: user_id, category, month_year (string in "YYYY-MM" format), warning_sent (boolean default false), over_budget_sent (boolean default false), with a unique constraint on the combination of user_id, category, and month_year
2. IF the Budget_Checker determines a warning threshold is reached AND the Budget_Repository returns warning_sent as false for that user, category, and month_year, THEN THE Budget_Checker SHALL send the warning message and THE Budget_Repository SHALL set warning_sent to true in a single atomic operation (upsert)
3. IF the Budget_Checker determines the over-budget threshold is reached AND the Budget_Repository returns over_budget_sent as false for that user, category, and month_year, THEN THE Budget_Checker SHALL send the over-budget alert and THE Budget_Repository SHALL set over_budget_sent to true in a single atomic operation (upsert)
4. IF warning_sent is already true for a given user, category, and month_year, THEN THE Budget_Checker SHALL NOT send a duplicate warning message
5. IF over_budget_sent is already true for a given user, category, and month_year, THEN THE Budget_Checker SHALL NOT send a duplicate over-budget alert
6. WHEN the Budget_Checker evaluates a transaction for a user, category, and month_year combination that has no existing alert state record, THE Budget_Repository SHALL create a new record with default false values before evaluating the alert condition (lazy initialization)
7. WHEN a new month begins, THE alert state records for previous months SHALL remain unchanged and SHALL NOT be deleted or modified
