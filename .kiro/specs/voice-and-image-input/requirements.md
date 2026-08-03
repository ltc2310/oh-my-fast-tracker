# Requirements Document

## Introduction

Feature này mở rộng Oh My Fast Tracker bot với hai phương thức nhập liệu mới: **voice message** (tin nhắn thoại) và **bank transfer screenshot** (ảnh chụp giao dịch chuyển khoản). Cả hai phương thức đều sử dụng Gemini 2.0 Flash multimodal để phân tích đầu vào và chia sẻ chung một **confirmation flow** — bot gửi kết quả phân tích để user xác nhận trước khi lưu giao dịch vào database. Mục tiêu là giúp user ghi chi tiêu nhanh hơn mà không cần gõ text thủ công.

## Glossary

- **Bot_Service**: NestJS service (BotService) nhận tin nhắn từ chat channel và route đến use case tương ứng
- **Channel_Adapter**: Interface chung cho các kênh chat (Telegram, Zalo...), hiện tại xử lý text message, cần mở rộng cho photo và voice
- **Telegram_Adapter**: Implementation cụ thể của Channel_Adapter sử dụng `node-telegram-bot-api`
- **Multimodal_Parser**: Port/service mới chịu trách nhiệm gửi image hoặc audio đến Gemini 2.0 Flash và trả về kết quả phân tích chi tiêu
- **Confirmation_Manager**: Component quản lý trạng thái chờ xác nhận (pending confirmation) cho mỗi user, lưu trong bộ nhớ (in-memory Map)
- **Pending_Confirmation**: Trạng thái tạm thời chứa thông tin giao dịch đã phân tích, chờ user xác nhận/sửa/huỷ trước khi lưu
- **Voice_Message**: Tin nhắn thoại Telegram (file `.ogg`/`.oga`), user ghi âm mô tả khoản chi tiêu
- **Bank_Transfer_Screenshot**: Ảnh chụp màn hình giao dịch chuyển khoản từ ứng dụng ngân hàng (VCB, MBBank, TPBank, MoMo, v.v.)
- **Gemini_2.0_Flash**: Model AI multimodal của Google hỗ trợ text + image + audio input
- **Confirmation_Response**: Phản hồi của user đối với tin nhắn xác nhận: "ok"/"lưu" (lưu), "đổi danh mục [tên]" (sửa category), "đổi số tiền [số]" (sửa amount), "bỏ"/"hủy" (huỷ)
- **Expiry_Timeout**: Thời gian tối đa (5 phút) mà Pending_Confirmation tồn tại trước khi tự huỷ

## Requirements

### Requirement 1: Nhận và xử lý Voice Message

**User Story:** As a user, I want to send a voice message describing my expense, so that I can record spending without typing.

#### Acceptance Criteria

1. WHEN a voice message is received from a whitelisted user, THE Telegram_Adapter SHALL download the audio file via Telegram Bot API (`getFileLink`) and forward the audio data to Bot_Service for processing
2. WHEN Bot_Service receives a voice message, THE Multimodal_Parser SHALL send the audio data to Gemini 2.0 Flash with a prompt instructing extraction of amount, category, and note from the Vietnamese speech
3. WHEN Gemini 2.0 Flash returns a valid parsed result containing at least an amount, THE Bot_Service SHALL create a Pending_Confirmation with the parsed data and send a confirmation message to the user
4. IF Gemini 2.0 Flash cannot extract any expense information from the voice message, THEN THE Bot_Service SHALL reply: "Em không nghe rõ khoản chi tiêu trong tin nhắn thoại. Sếp thử ghi âm lại rõ hơn nhé 🎤"
5. IF the voice message audio file download fails, THEN THE Bot_Service SHALL reply with a generic service unavailable message
6. THE Multimodal_Parser SHALL use the same category list (14 Vietnamese categories) as the existing AIParser for consistent categorization

### Requirement 2: Nhận và xử lý Bank Transfer Screenshot

**User Story:** As a user, I want to send a screenshot of my bank transfer, so that the bot can automatically extract the transaction details without manual entry.

#### Acceptance Criteria

1. WHEN a photo message is received from a whitelisted user, THE Telegram_Adapter SHALL download the highest-resolution version of the photo via Telegram Bot API and forward the image data to Bot_Service for processing
2. WHEN Bot_Service receives a photo message, THE Multimodal_Parser SHALL send the image data to Gemini 2.0 Flash with a prompt instructing OCR extraction of: amount, recipient name, bank name, and transaction time from Vietnamese bank transfer screenshots
3. WHEN Gemini 2.0 Flash returns a valid parsed result containing at least an amount, THE Bot_Service SHALL create a Pending_Confirmation with the parsed data, using default category "Khác" and note constructed from recipient name and bank name
4. IF Gemini 2.0 Flash determines the image is not a bank transfer screenshot (random photo, meme, etc.), THEN THE Bot_Service SHALL reply: "Em không nhận ra đây là ảnh chuyển khoản. Sếp gửi ảnh màn hình giao dịch từ app ngân hàng nhé 📸"
5. IF the photo file download fails, THEN THE Bot_Service SHALL reply with a generic service unavailable message
6. THE Multimodal_Parser SHALL support screenshots from common Vietnamese banks and e-wallets: VCB (Vietcombank), MBBank, TPBank, Techcombank, BIDV, VietinBank, MoMo, ZaloPay

### Requirement 3: Confirmation Flow — Gửi tin nhắn xác nhận

**User Story:** As a user, I want to review the parsed transaction before it's saved, so that I can correct any errors from AI parsing.

#### Acceptance Criteria

1. WHEN a Pending_Confirmation is created from voice or photo input, THE Bot_Service SHALL send a structured confirmation message containing: formatted amount (VND), detected category, note/description, and source indicator (🎤 for voice, 📸 for screenshot)
2. THE confirmation message SHALL follow the format: "[source_icon] Em nhận được:\n💰 Số tiền: [amount]đ\n📁 Danh mục: [category]\n📝 Ghi chú: [note]\n\n• \"ok\" — lưu\n• \"đổi danh mục [tên]\" — đổi danh mục\n• \"đổi số tiền [số]\" — đổi số tiền\n• \"bỏ\" — huỷ"
3. THE Confirmation_Manager SHALL store the Pending_Confirmation in an in-memory Map keyed by userId (one pending confirmation per user at a time)
4. IF a user already has a Pending_Confirmation and sends a new voice/photo message, THEN THE Confirmation_Manager SHALL replace the existing Pending_Confirmation with the new one and inform the user that the previous pending item was discarded
5. THE amount in the confirmation message SHALL be formatted with Vietnamese locale (e.g., "50.000", "1.500.000")

### Requirement 4: Confirmation Flow — Xử lý phản hồi user

**User Story:** As a user, I want to confirm, modify, or cancel the pending transaction, so that I have full control over what gets saved.

#### Acceptance Criteria

1. WHEN a user with an active Pending_Confirmation sends "ok" or "lưu", THE Bot_Service SHALL save the transaction to the database using RecordTransaction logic (with correct amount sign for income categories) and reply with the standard transaction confirmation message (e.g., "Em đã ghi nhận 50.000đ - Ăn uống")
2. WHEN a user with an active Pending_Confirmation sends "đổi danh mục [category_name]" (e.g., "đổi danh mục ăn uống", "đổi danh mục di chuyển"), THE Bot_Service SHALL update the Pending_Confirmation's category to the specified category, save the transaction, and reply with the standard transaction confirmation message showing the overridden category
3. WHEN a user with an active Pending_Confirmation sends "đổi số tiền [amount]" (e.g., "đổi số tiền 50k", "đổi số tiền 1tr5"), THE Bot_Service SHALL update the Pending_Confirmation's amount to the specified amount, save the transaction, and reply with the standard transaction confirmation message showing the overridden amount
4. WHEN a user with an active Pending_Confirmation sends "bỏ" or "hủy", THE Bot_Service SHALL discard the Pending_Confirmation and reply: "Đã huỷ, em không lưu khoản này."
5. WHEN a user with an active Pending_Confirmation sends a message that is not a confirmation command (not "ok", "lưu", "đổi danh mục...", "đổi số tiền...", "bỏ", "hủy") and is not another voice/photo message, THE Confirmation_Manager SHALL clear the Pending_Confirmation silently and process the message using normal routing logic (report, edit, record text expense, etc.)
6. IF the category specified in "đổi danh mục [category_name]" is not recognized after applying abbreviation expansion and spelling normalization, THEN THE Bot_Service SHALL reply with available categories list and keep the Pending_Confirmation active so the user can retry with a valid category
7. IF the amount specified in "đổi số tiền [amount]" cannot be parsed as a valid number, THEN THE Bot_Service SHALL reply: "Em chưa nhận ra số tiền. Sếp thử gõ dạng: đổi số tiền 50k" and keep the Pending_Confirmation active
8. THE Bot_Service SHALL check for an active Pending_Confirmation BEFORE processing any other command routing (except /start, /help, id commands)
9. THE "đổi danh mục" and "đổi số tiền" commands SHALL only be active when there is a Pending_Confirmation — when there is no pending state, these messages SHALL fall through to normal text routing

### Requirement 5: Confirmation Flow — Expiry và cleanup

**User Story:** As a system operator, I want pending confirmations to expire automatically, so that stale state does not accumulate in memory.

#### Acceptance Criteria

1. THE Confirmation_Manager SHALL automatically discard any Pending_Confirmation that has not been confirmed or cancelled within 5 minutes of creation
2. WHEN a Pending_Confirmation expires, THE Bot_Service SHALL NOT send any notification to the user (silent expiry)
3. WHEN a user sends a confirmation response ("ok", "bỏ") after the Pending_Confirmation has expired, THE Bot_Service SHALL process the message using normal text routing logic (not as a confirmation)
4. THE Confirmation_Manager SHALL use a lightweight cleanup mechanism (e.g., check timestamp on access, or setTimeout per entry) that does not block the event loop

### Requirement 6: Mở rộng Channel Adapter

**User Story:** As a developer, I want the ChannelAdapter interface extended to support photo and voice messages, so that the domain layer remains decoupled from Telegram-specific APIs.

#### Acceptance Criteria

1. THE IncomingMessage interface SHALL be extended with optional fields: `photo` (containing image buffer and metadata) and `voice` (containing audio buffer and metadata)
2. WHEN a Telegram photo message is received, THE Telegram_Adapter SHALL populate the `photo` field of IncomingMessage with the downloaded image data (Buffer) and file metadata (fileId, mimeType)
3. WHEN a Telegram voice message is received, THE Telegram_Adapter SHALL populate the `voice` field of IncomingMessage with the downloaded audio data (Buffer) and file metadata (fileId, mimeType, duration in seconds)
4. THE Telegram_Adapter SHALL register handlers for `bot.on('photo', ...)` and `bot.on('voice', ...)` events in addition to the existing text message handler
5. THE Telegram_Adapter SHALL select the highest-resolution photo from Telegram's photo size array (last element) for download
6. IF a message contains both text and photo (photo with caption), THEN THE Telegram_Adapter SHALL include both `text` (caption) and `photo` fields in IncomingMessage

### Requirement 7: Multimodal Parser Port

**User Story:** As a developer, I want a dedicated Multimodal Parser port, so that the AI multimodal parsing logic is encapsulated behind an interface following clean architecture.

#### Acceptance Criteria

1. THE system SHALL define a `MultimodalParser` port interface with methods: `parseVoice(audio: Buffer, mimeType: string): Promise<ParsedExpense[]>` and `parseImage(image: Buffer, mimeType: string): Promise<ParsedExpense[]>`
2. THE `GeminiMultimodalParser` implementation SHALL use `@google/generative-ai` SDK with model `gemini-2.0-flash` configured via the existing `GEMINI_MODEL` environment variable
3. THE `GeminiMultimodalParser` SHALL send audio/image as inline data parts alongside a text prompt to the Gemini API
4. THE existing AIParser (text-only) SHALL remain unchanged and continue to function for text-based fallback parsing
5. THE `parseImage` prompt SHALL instruct Gemini to detect Vietnamese bank transfer screenshots and extract: amount (number), recipient name, bank name, transaction time, returning empty array if the image is not a bank transfer
6. THE `parseVoice` prompt SHALL instruct Gemini to transcribe the Vietnamese audio and extract expense information: amount (number), category, and note, returning empty array if no expense is detected

### Requirement 8: AI Model Configuration

**User Story:** As a developer, I want to configure the multimodal model separately, so that the text-only parser can continue using a lighter model while multimodal tasks use the full model.

#### Acceptance Criteria

1. THE system SHALL add an optional environment variable `GEMINI_MULTIMODAL_MODEL` (default: `gemini-2.0-flash`) for the multimodal parser
2. WHILE `GEMINI_MULTIMODAL_MODEL` is not set, THE GeminiMultimodalParser SHALL default to `gemini-2.0-flash`
3. THE existing `GEMINI_MODEL` environment variable SHALL continue to control the text-only AIParser model without changes
4. THE GeminiMultimodalParser SHALL use `temperature: 0` and `responseMimeType: "application/json"` for consistent structured output

### Requirement 9: Error Handling

**User Story:** As a user, I want clear error messages when something goes wrong with voice/image processing, so that I know what happened and how to retry.

#### Acceptance Criteria

1. IF the Gemini API call fails due to network error, rate limiting, or server error, THEN THE Bot_Service SHALL reply: "Hệ thống đang gặp sự cố tạm thời, sếp thử lại sau nhé 🙏"
2. IF the Gemini API returns an unparseable response (invalid JSON, missing required fields), THEN THE Bot_Service SHALL reply: "Em xử lý chưa được, sếp thử gửi lại hoặc gõ text như bình thường nhé 🙏"
3. IF the voice message duration exceeds 60 seconds, THEN THE Bot_Service SHALL reply: "Tin nhắn thoại hơi dài, sếp ghi âm ngắn gọn hơn (dưới 1 phút) nhé 🎤"
4. IF the photo file size exceeds 10MB, THEN THE Bot_Service SHALL reply: "Ảnh quá lớn, sếp gửi ảnh chụp màn hình bình thường (dưới 10MB) nhé 📸"
5. THE Bot_Service SHALL log all AI parsing errors with sufficient context (userId, message type, error details) for debugging without logging the actual audio/image content

### Requirement 10: Non-interference với các tính năng hiện tại

**User Story:** As a user, I want the existing text-based features to continue working unchanged, so that the new input methods are purely additive.

#### Acceptance Criteria

1. THE Bot_Service SHALL continue to process text messages through the existing routing logic (undo, edit, report, trend, compare, notification preferences, record transaction) without modification
2. WHILE a user has an active Pending_Confirmation, THE Bot_Service SHALL still allow /start, /help, and id commands to execute immediately without clearing the pending state
3. THE confirmation flow SHALL NOT interfere with notification preference commands (bật/tắt nhắc nhở, báo cáo tuần, báo cáo tháng)
4. WHEN a text message matches existing command patterns (undo, edit, report, compare, notification), THE Bot_Service SHALL prioritize the command over confirmation flow processing, clearing the pending state if necessary
5. THE existing test suite (265 tests across 18 suites) SHALL continue to pass without modification after implementing this feature

