# Requirements Document

## Introduction

Tính năng gửi báo cáo chi tiêu qua email. Khi user gõ các trigger phrase như "gửi báo cáo", "gửi report cho tôi", "gửi email báo cáo", hệ thống sẽ tạo báo cáo Excel và gửi qua email đến địa chỉ đã lưu của user. Lần đầu tiên, bot sẽ hỏi email và lưu lại; từ lần sau sẽ gửi trực tiếp mà không cần hỏi lại.

## Glossary

- **Bot**: Telegram/Zalo chatbot xử lý tin nhắn từ user
- **Email_Report_Trigger**: Regex pattern nhận diện yêu cầu gửi báo cáo qua email (ví dụ: "gửi báo cáo", "gửi report", "gửi email báo cáo", "report tháng này")
- **Email_Service**: Service chịu trách nhiệm gửi email với file đính kèm
- **User_Repository**: Repository lưu trữ và truy vấn thông tin user bao gồm email
- **Report_Generator**: Use case tạo báo cáo chi tiêu theo khoảng thời gian, sử dụng lại ExcelGeneratorService hiện có để tạo file Excel (không cần logic tạo report mới)
- **Date_Range_Parser**: Logic parse khoảng thời gian từ tin nhắn (parseReportDateRange trong BotService)
- **Conversation_State**: Trạng thái hội thoại tạm thời để theo dõi flow hỏi-đáp email

## Requirements

### Requirement 1: Detect Email Report Trigger

**User Story:** As a user, I want to type natural Vietnamese phrases requesting an email report, so that the bot understands I want my report sent via email.

#### Acceptance Criteria

1. WHEN the user sends a message matching Email_Report_Trigger pattern, THE Bot SHALL route the message to the email report flow instead of the in-chat report flow, even if the message also matches the existing REPORT_REGEX
2. THE Email_Report_Trigger SHALL perform a case-insensitive substring match against the user message for any of the following phrases: "gửi báo cáo", "gửi report", "gửi email báo cáo", "report cho tôi", or "email report"
3. WHEN the user message matches Email_Report_Trigger AND contains a date range indicator recognized by the existing parseReportDateRange function (e.g., "tháng này", "tháng trước", "tuần trước", "N ngày trước", or "từ DD/MM đến DD/MM"), THE Date_Range_Parser SHALL extract the specified date range
4. WHEN the user message matches Email_Report_Trigger AND contains no date range indicator recognized by parseReportDateRange, THE Date_Range_Parser SHALL default to the last 7 days (from current date minus 7 days to current date)
5. IF a user message matches REPORT_REGEX but does NOT match Email_Report_Trigger, THEN THE Bot SHALL handle it as an in-chat report request using the existing report flow

### Requirement 2: Email Collection Flow

**User Story:** As a first-time user requesting an email report, I want the bot to ask for my email address and save it, so that future reports can be sent without asking again.

#### Acceptance Criteria

1. WHEN a user triggers an email report request AND the User_Repository has no email stored for that user, THE Bot SHALL ask the user for their email address
2. WHEN the user replies with a valid email address during the email collection flow, THE User_Repository SHALL persist the email address for that user
3. WHEN the user replies with a valid email address during the email collection flow, THE Bot SHALL confirm the email was saved and immediately invoke the Report_Generator for the originally requested date range
4. IF the user replies with a text that does not match a standard email format (local-part@domain with at least one dot in domain) during the email collection flow, THEN THE Bot SHALL inform the user the format is invalid, display the expected format, and ask again up to a maximum of 3 consecutive invalid attempts
5. WHILE the Bot is in email collection state for a user, THE Conversation_State SHALL track that the next message from that user is an email response and SHALL expire the state after 5 minutes of inactivity
6. IF the user sends a message that is not an email-format string while in email collection state, THEN THE Bot SHALL cancel the email collection flow and process the message as a normal incoming message
7. IF the user exceeds 3 consecutive invalid email attempts, THEN THE Bot SHALL cancel the email collection flow and inform the user they can try again by re-triggering the email report request

### Requirement 3: Send Report via Email

**User Story:** As a user with a saved email, I want the bot to generate and send my expense report to my email, so that I have a permanent copy in my inbox.

#### Acceptance Criteria

1. WHEN a user triggers an email report request AND the User_Repository has an email stored for that user AND the date range contains at least one transaction, THE Report_Generator SHALL reuse the existing ExcelGeneratorService to generate an Excel report for the specified date range
2. WHEN the Report_Generator produces an Excel file, THE Email_Service SHALL send an email to the user's stored email address with the Excel file attached using the filename format produced by the existing filename-formatter service
3. THE Email_Service SHALL use the subject line format "Báo cáo chi tiêu {from} - {to}" with dates in dd/MM/yyyy format
4. WHEN the Email_Service sends the email successfully, THE Bot SHALL notify the user that the report was sent, including the destination email address in the confirmation message
5. IF the Email_Service fails to send the email, THEN THE Bot SHALL notify the user of the failure with a message indicating the email could not be delivered and suggest trying again later
6. IF a user triggers an email report request AND the User_Repository has an email stored AND the date range contains zero transactions, THEN THE Bot SHALL notify the user that there are no expenses to report for the specified period without sending an email
7. THE Email_Service SHALL include a professional HTML email body containing: the report period (from and to dates in dd/MM/yyyy format), the total expense amount formatted in VND, a category breakdown summary listing each category with its total amount sorted descending by amount, and a note informing the user that the detailed Excel report is attached
8. THE Email_Service HTML template SHALL use inline CSS with professional styling including a branded header section, clear typography, and a responsive single-column layout suitable for email clients
9. IF the Email_Service does not complete sending within 30 seconds, THEN THE Email_Service SHALL treat the operation as failed

### Requirement 4: Email Persistence

**User Story:** As a user, I want my email address to be stored permanently so that I never have to provide it again.

#### Acceptance Criteria

1. THE User_Repository SHALL store the email address as a nullable column in the users table, identified by the user's channel and channel_user_id pair
2. WHEN a user's email is updated, THE User_Repository SHALL overwrite the previous email address with the new value in a single upsert operation
3. WHEN the User_Repository retrieves email for a user who has no email stored, THE User_Repository SHALL return null
4. THE User_Repository SHALL enforce a maximum email length of 254 characters and reject any value exceeding this limit
5. THE User_Repository SHALL retrieve the stored email by channel and channel_user_id with a single database query

### Requirement 5: Email Update

**User Story:** As a user, I want to be able to update my email address if I need to change it.

#### Acceptance Criteria

1. WHEN a user sends a message matching an Email_Update_Trigger pattern (including "đổi email", "cập nhật email", "thay đổi email", "sửa email"), THE Bot SHALL display the user's current email address in partially masked format (e.g., "t***@gmail.com") and enter the email collection flow to capture a new email address
2. IF a user sends a message matching Email_Update_Trigger AND the User_Repository has no email stored for that user, THEN THE Bot SHALL enter the email collection flow as a first-time email setup (same as Requirement 2)
3. WHEN the user provides a new valid email during the email update flow, THE User_Repository SHALL overwrite the previously stored email with the new email address for that user
4. IF the user replies with an invalid email format during the email update flow, THEN THE Bot SHALL inform the user the format is invalid and ask again
5. WHEN the email is updated successfully, THE Bot SHALL confirm the change by displaying the new email address in partially masked format to the user
