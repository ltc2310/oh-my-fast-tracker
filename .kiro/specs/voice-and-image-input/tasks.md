# Implementation Plan: Voice and Image Input

## Overview

Mở rộng Oh My Fast Tracker với voice message và bank transfer screenshot input, sử dụng Gemini 2.0 Flash multimodal để phân tích, kết hợp confirmation flow (xác nhận/sửa/huỷ). Triển khai theo Clean Architecture: domain ports → application service (ConfirmationManager) → infrastructure (GeminiMultimodalParser, TelegramAdapter update) → BotService routing → configuration → documentation → tests.

## Tasks

- [x] 1. Domain layer — Ports và interfaces
  - [x] 1.1 Mở rộng IncomingMessage interface trong ChannelAdapter
    - Sửa file `src/domain/ports/ChannelAdapter.ts`
    - Thêm `PhotoAttachment` interface: `data: Buffer`, `fileId: string`, `mimeType: string`, `fileSize: number`
    - Thêm `VoiceAttachment` interface: `data: Buffer`, `fileId: string`, `mimeType: string`, `duration: number`
    - Thêm optional fields `photo?: PhotoAttachment` và `voice?: VoiceAttachment` vào `IncomingMessage`
    - _Requirements: 6.1, 6.2, 6.3, 6.6_

  - [x] 1.2 Tạo MultimodalParser port interface
    - Tạo file `src/domain/ports/MultimodalParser.ts`
    - Import `ParsedExpense` từ `./Parser`
    - Định nghĩa `MultimodalParser` interface với methods: `parseVoice(audio: Buffer, mimeType: string): Promise<ParsedExpense[]>` và `parseImage(image: Buffer, mimeType: string): Promise<ParsedExpense[]>`
    - _Requirements: 7.1, 7.4_

- [x] 2. Application layer — ConfirmationManager service
  - [x] 2.1 Implement ConfirmationManager service
    - Tạo file `src/application/services/ConfirmationManager.ts`
    - Định nghĩa `PendingConfirmation` interface: `userId`, `channelUserId`, `expenses: ParsedExpense[]`, `source: 'voice' | 'photo'`, `createdAt: Date`, `timeoutHandle: NodeJS.Timeout`
    - Implement `@Injectable()` class với in-memory `Map<string, PendingConfirmation>`
    - Methods: `set(userId, channelUserId, expenses, source)` — tạo PendingConfirmation, clear existing nếu có, set setTimeout 5 phút
    - Methods: `get(userId)` — trả PendingConfirmation hoặc undefined, lazy expiry check
    - Methods: `has(userId)` — boolean, lazy expiry check
    - Methods: `clear(userId)` — xoá entry + clearTimeout
    - `EXPIRY_MS = 5 * 60 * 1000`
    - _Requirements: 3.3, 3.4, 5.1, 5.2, 5.3, 5.4_

  - [x] 2.2 Đăng ký ConfirmationManager trong ApplicationModule
    - Sửa file `src/application/application.module.ts`
    - Import và thêm `ConfirmationManager` vào `providers` array
    - Export `ConfirmationManager` để BotService inject được
    - _Requirements: 3.3_

- [x] 3. Infrastructure layer — GeminiMultimodalParser
  - [x] 3.1 Implement GeminiMultimodalParser
    - Tạo file `src/infrastructure/parsers/GeminiMultimodalParser.ts`
    - Implement `MultimodalParser` interface
    - Inject `aiConfig` để lấy `geminiApiKey` và `geminiMultimodalModel`
    - Sử dụng `@google/generative-ai` SDK (đã có trong project từ AIParser)
    - Configure: `temperature: 0`, `responseMimeType: "application/json"`
    - `parseVoice(audio, mimeType)`: gửi audio dạng inline data part + text prompt yêu cầu transcribe Vietnamese speech và extract amount, category (từ 14 categories), note. Return `ParsedExpense[]` hoặc empty array nếu không detect expense
    - `parseImage(image, mimeType)`: gửi image inline data part + text prompt OCR Vietnamese bank transfer screenshot, extract amount, recipient name, bank name. Return `ParsedExpense[]` với category="Khác", note="[recipient] - [bank]", hoặc empty array nếu không phải bank transfer
    - Error handling: wrap Gemini API errors, log metadata (không log content), re-throw
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.4, 9.1, 9.2, 9.5_

  - [x] 3.2 Cập nhật aiConfig thêm geminiMultimodalModel
    - Sửa file `src/infrastructure/config/app.config.ts`
    - Thêm `geminiMultimodalModel: process.env.GEMINI_MULTIMODAL_MODEL ?? "gemini-2.0-flash"` vào `aiConfig`
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 3.3 Đăng ký GeminiMultimodalParser trong InfrastructureModule
    - Sửa file `src/infrastructure/infrastructure.module.ts`
    - Import `GeminiMultimodalParser`
    - Thêm provider: `GeminiMultimodalParser` và `{ provide: "MultimodalParser", useClass: GeminiMultimodalParser }`
    - Export token `"MultimodalParser"`
    - _Requirements: 7.1_

- [x] 4. Checkpoint — Compile check (domain + application + parser)
  - Chạy `npm run build` đảm bảo tất cả files mới compile thành công. Fix TypeScript errors nếu có.

- [x] 5. Infrastructure layer — TelegramAdapter update
  - [x] 5.1 Mở rộng TelegramAdapter xử lý photo và voice events
    - Sửa file `src/infrastructure/channels/TelegramAdapter.ts`
    - Đăng ký handler `bot.on('photo', ...)`: select highest-res photo (last element trong photo size array), gọi `bot.getFileLink(fileId)`, HTTP GET download image buffer, populate `IncomingMessage.photo`
    - Đăng ký handler `bot.on('voice', ...)`: gọi `bot.getFileLink(fileId)`, HTTP GET download audio buffer, populate `IncomingMessage.voice` với duration
    - Xử lý photo with caption: include cả `text` (caption) và `photo` fields
    - Error handling: nếu download fail → gọi `onMessage` với error flag hoặc null data để BotService handle
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 1.1, 2.1_

- [x] 6. BotService integration — Voice/Photo routing + Confirmation flow
  - [x] 6.1 Thêm voice/photo routing logic vào BotService
    - Sửa file `src/infrastructure/channels/bot.service.ts`
    - Inject `ConfirmationManager` và `@Inject("MultimodalParser") multimodalParser: MultimodalParser`
    - Thêm routing SAU access check + /start, /help, id commands:
      1. Check `msg.voice` → validate duration ≤ 60s → gọi `multimodalParser.parseVoice()` → nếu result non-empty → `confirmationManager.set()` + send confirmation message. Nếu empty → send "Em không nghe rõ..." message
      2. Check `msg.photo` → validate fileSize ≤ 10MB → gọi `multimodalParser.parseImage()` → nếu result non-empty → `confirmationManager.set()` + send confirmation message. Nếu empty → send "Em không nhận ra đây là ảnh chuyển khoản..." message
    - Error handling: Gemini API error → send "Hệ thống đang gặp sự cố tạm thời...". Invalid JSON → send "Em xử lý chưa được..."
    - File download fail → send "Hệ thống đang gặp sự cố tạm thời..."
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 6.2 Implement confirmation flow routing trong BotService
    - Sửa file `src/infrastructure/channels/bot.service.ts`
    - Check `confirmationManager.has(userId)` SAU voice/photo check, TRƯỚC normal text routing
    - Nhưng SAU /start, /help, id commands (bypass confirmation)
    - Thêm method `handleConfirmation(userId, channelUserId, text, channel)`:
      - Match "ok" hoặc "lưu" → save transaction via RecordTransaction (handle amount sign for income categories) → clear pending → reply standard confirmation
      - Match "đổi danh mục [X]" → validate category (expandAbbreviations → normalizeSpelling → detectCategory) → nếu valid: update expense, save, clear, reply. Nếu invalid: reply category list, keep pending
      - Match "đổi số tiền [X]" → parse amount (reuse extractAmount logic) → nếu valid: update expense, save, clear, reply. Nếu invalid: reply error message, keep pending
      - Match "bỏ" hoặc "hủy" → clear pending → reply "Đã huỷ, em không lưu khoản này."
      - No match → clear pending silently → fall through to normal routing
    - Existing commands (undo, edit, report, trend, compare, notification prefs) → clear pending + execute command (priority over confirmation)
    - Khi user gửi voice/photo mới trong lúc có pending → replace pending (handled by ConfirmationManager.set)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 10.1, 10.2, 10.3, 10.4_

  - [x] 6.3 Implement confirmation message formatting helper
    - Sửa file `src/infrastructure/channels/bot.service.ts`
    - Thêm private method `formatConfirmationMessage(expenses: ParsedExpense[], source: 'voice' | 'photo'): string`
    - Format: "[icon] Em nhận được:\n💰 Số tiền: [amount]đ\n📁 Danh mục: [category]\n📝 Ghi chú: [note]\n\n• \"ok\" — lưu\n• \"đổi danh mục [tên]\" — đổi danh mục\n• \"đổi số tiền [số]\" — đổi số tiền\n• \"bỏ\" — huỷ"
    - Icon: 🎤 cho voice, 📸 cho photo
    - Amount format: Vietnamese locale (50.000, 1.500.000) — dùng `toLocaleString('vi-VN')`
    - _Requirements: 3.1, 3.2, 3.5_

- [x] 7. Checkpoint — Full integration compile
  - Chạy `npm run build` đảm bảo toàn bộ project compile thành công. BotService routing logic correct. Existing code paths không bị ảnh hưởng.

- [x] 8. Configuration và environment
  - [x] 8.1 Cập nhật .env.example với GEMINI_MULTIMODAL_MODEL
    - Sửa file `.env.example`
    - Thêm `GEMINI_MULTIMODAL_MODEL=gemini-2.0-flash` với comment mô tả
    - _Requirements: 8.1, 8.2_

- [x] 9. Documentation updates
  - [x] 9.1 Cập nhật README.md
    - Sửa `README.md` — trong Roadmap section:
      - Xoá dòng `- [ ] **Forward bank notifications** — Forward SMS/app notification messages from banks/MoMo to auto-record transactions`
      - Thêm dòng `- [x] **Bank transfer screenshot** — Gửi ảnh chuyển khoản ngân hàng để bot tự nhận dạng số tiền, người nhận, ngân hàng via Gemini 2.0 Flash multimodal + confirmation flow *(completed)*`
      - Đánh dấu voice message là done: `- [x] **Voice message support** — Telegram voice → Gemini 2.0 Flash multimodal transcription + expense extraction → confirmation flow *(completed)*`
    - Thêm `GEMINI_MULTIMODAL_MODEL` vào bảng Environment variables
    - Thêm voice/photo commands vào bảng Bot commands: "🎤 Gửi voice message", "📸 Gửi ảnh chuyển khoản"
    - _Requirements: 1.1, 2.1_

  - [x] 9.2 Cập nhật HELP_MSG trong BotService
    - Sửa `HELP_MSG` constant trong `src/infrastructure/channels/bot.service.ts`
    - Thêm section mới giữa "💸 Ghi chi tiêu" và "📊 Xem báo cáo":
      ```
      🎤 Voice & Ảnh:
      • Gửi tin nhắn thoại mô tả chi tiêu
      • Gửi ảnh chuyển khoản ngân hàng
      • "ok" — xác nhận lưu
      • "đổi danh mục [tên]" — đổi danh mục
      • "đổi số tiền [số]" — đổi số tiền
      • "bỏ" — huỷ không lưu
      ```
    - _Requirements: 3.2, 4.1, 4.2, 4.3, 4.4_

- [x] 10. Tests
  - [ ]* 10.1 Write unit tests cho ConfirmationManager
    - Tạo file `test/confirmation/confirmation-manager.spec.ts`
    - Test set/get/clear/has operations
    - Test expiry: set → wait > 5min (mock timers) → get returns undefined
    - Test replacement: set twice → only latest exists, previous timeout cleared
    - Test lazy expiry check in has() and get()
    - _Requirements: 3.3, 3.4, 5.1, 5.2, 5.3, 5.4_

  - [ ]* 10.2 Write property test — Confirmation message formatting
    - Tạo file `test/confirmation/confirmation-flow.spec.ts`
    - **Property 1: Confirmation message formatting**
    - Generate valid ParsedExpense (amount 1000–10M, random category from 14 Vietnamese categories, random note), random source ('voice'|'photo')
    - Assert: message contains correct icon, amount formatted with dots, category name, note text
    - **Validates: Requirements 3.1, 3.2, 3.5**

  - [ ]* 10.3 Write property test — PendingConfirmation one-per-user with replacement
    - Thêm vào file `test/confirmation/confirmation-manager.spec.ts`
    - **Property 3: Confirmation storage — one per user with replacement**
    - Generate sequence of set() calls for same userId → Map.size always ≤ 1 for that user
    - **Validates: Requirements 3.3, 3.4**

  - [ ]* 10.4 Write property test — Confirm saves with correct amount sign
    - Thêm vào file `test/confirmation/confirmation-flow.spec.ts`
    - **Property 4: Confirm saves with correct amount sign**
    - Generate PendingConfirmation with random category → assert saved transaction amount is negative if isIncomeCategory, positive otherwise
    - **Validates: Requirements 4.1**

  - [ ]* 10.5 Write property test — Category/amount modification persists correctly
    - Thêm vào file `test/confirmation/confirmation-flow.spec.ts`
    - **Property 5: Category and amount modification persists correctly**
    - Generate valid category strings → "đổi danh mục [X]" saves with resolved category
    - Generate valid amount strings → "đổi số tiền [X]" saves with parsed amount
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 10.6 Write property test — Invalid modification keeps pending active
    - Thêm vào file `test/confirmation/confirmation-flow.spec.ts`
    - **Property 6: Invalid modification keeps pending state active**
    - Generate invalid category/amount strings → pending NOT cleared
    - **Validates: Requirements 4.6, 4.7**

  - [ ]* 10.7 Write property test — Input validation rejects oversized media
    - Tạo file `test/confirmation/input-validation.spec.ts`
    - **Property 10: Input validation rejects oversized media**
    - Generate voice duration > 60 → rejected without parser call. Generate photo size > 10MB → rejected without parser call
    - **Validates: Requirements 9.3, 9.4**

  - [x] 10.8 Write unit tests cho BotService voice/photo routing
    - Tạo file `test/channels/bot-multimodal-routing.spec.ts`
    - Mock MultimodalParser, ConfirmationManager, ChannelAdapter, RecordTransaction
    - Test voice message → parseVoice called → confirmation sent
    - Test photo message → parseImage called → confirmation sent
    - Test voice empty result → "Em không nghe rõ..." message
    - Test photo not bank transfer → "Em không nhận ra..." message
    - Test duration > 60s → rejection message, parser NOT called
    - Test fileSize > 10MB → rejection message, parser NOT called
    - Test Gemini API error → service unavailable message
    - Test confirmation "ok" → save + standard reply
    - Test confirmation "đổi danh mục" → update + save
    - Test confirmation "đổi số tiền" → update + save
    - Test confirmation "bỏ" → discard reply
    - Test unrelated text with pending → clear + normal routing
    - Test existing command with pending → clear + execute command
    - _Requirements: 1.1–1.6, 2.1–2.5, 3.1–3.5, 4.1–4.9, 9.1–9.5, 10.1–10.4_

- [x] 11. Final checkpoint — Build + full test suite
  - Chạy `npm run build && npm test`. Toàn bộ tests phải pass (existing 265+ tests + new tests). Đảm bảo existing tests không bị fail. Confirm non-interference với features hiện tại.

## Notes

- Design sử dụng TypeScript — tất cả implementation bằng TypeScript
- Tasks marked với `*` là optional, có thể skip cho faster MVP
- Mỗi task reference requirements cụ thể để truy vết
- Checkpoints đảm bảo incremental validation
- Property tests dùng `fast-check` (đã có sẵn v4.9.0 trong project)
- `@google/generative-ai` SDK đã có sẵn (dùng bởi AIParser) — không cần cài thêm package
- `RecordTransaction` đã xử lý amount sign convention — reuse logic cho confirmation flow
- `expandAbbreviations`, `normalizeSpelling`, `detectCategory` từ RegexParser — reuse cho "đổi danh mục" validation
- `extractAmount` logic từ RegexParser — reuse cho "đổi số tiền" parsing
- In-memory Map cho ConfirmationManager — acceptable vì timeout 5 phút, không cần persist qua restart

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.2"] },
    { "id": 2, "tasks": ["2.2", "3.3"] },
    { "id": 3, "tasks": ["5.1"] },
    { "id": 4, "tasks": ["6.1", "6.3"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["8.1", "9.1", "9.2"] },
    { "id": 7, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8"] }
  ]
}
```
