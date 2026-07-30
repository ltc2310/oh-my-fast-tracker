# Implementation Plan: Edit Transaction NLP (Sửa giao dịch bằng ngôn ngữ tự nhiên)

## Overview

Thay thế cơ chế sửa giao dịch cứng nhắc hiện tại (regex đơn giản + RAM cache) bằng hệ thống nhận diện ý định sửa theo cơ chế lai (hybrid): Regex trước → AI (Gemini) fallback. Triển khai theo Clean Architecture: domain port → infrastructure implementations → module wiring → BotService refactor → tests.

## Tasks

- [x] 1. Tạo EditIntentDetector domain port
  - [x] 1.1 Tạo interface EditIntentDetector và type EditIntentResult
    - Tạo file `src/domain/ports/EditIntentDetector.ts`
    - Định nghĩa `EditIntentResult` interface với fields: `isEditIntent: true`, `fields` (amount?, category?, note?, spentAt?), `isIncomplete: boolean`
    - Định nghĩa `EditIntentDetector` interface với method `detect(text: string): Promise<EditIntentResult | null>`
    - _Requirements: 1.1, 1.2, 1.3_
    - **Acceptance criteria**: File compile thành công, interface export được và có thể import từ các module khác

- [x] 2. Tạo RegexEditMatcher
  - [x] 2.1 Implement RegexEditMatcher với 5 patterns + 1 anti-pattern
    - Tạo file `src/infrastructure/parsers/RegexEditMatcher.ts`
    - Implement 5 regex patterns: EDIT_AMOUNT_PATTERN, EDIT_AMOUNT_BARE_PATTERN, EDIT_CATEGORY_PATTERN, EDIT_DATE_PATTERN, EDIT_INCOMPLETE_PATTERN
    - Implement 1 anti-pattern: EXPENSE_DISGUISED_PATTERN (loại bỏ "sửa xe 50k")
    - Implement method `match(text: string): EditIntentResult | null` với thứ tự check: anti-pattern → edit verb → incomplete → date → amount w/ keyword → amount bare → category → fallback
    - Implement private method `normalizeAmount(rawNumber, unit)` với quy tắc: k/nghìn/ngàn ×1000, tr/triệu ×1000000, bare ≥1000 giữ nguyên
    - Import `detectDate` từ RegexParser để xử lý ngày tương đối
    - _Requirements: 1.1, 1.4, 2.1, 2.2, 2.3, 3.1, 5.1, 5.2, 8.1, 9.3_
    - **Acceptance criteria**: `match("sửa thành 30k")` trả về `{ isEditIntent: true, fields: { amount: 30000 }, isIncomplete: false }`. `match("sửa xe 50k")` trả về `null`. `match("sửa lại")` trả về `{ isEditIntent: true, fields: {}, isIncomplete: true }`

  - [x]* 2.2 Write property tests cho RegexEditMatcher
    - Tạo file `test/properties/edit-intent-detection.prop.ts`
    - **Property 2: Disambiguation** — generate "sửa + noun + amount" messages without target keywords → always returns null
    - **Property 3: Amount normalization** — generate (number, unit) pairs → verify VND multiplication
    - **Validates: Requirements 1.4, 2.3, 9.3**

  - [x]* 2.3 Write unit tests cho RegexEditMatcher
    - Tạo file `test/parsers/regex-edit-matcher.spec.ts`
    - Cover 19 edge cases từ design document (bảng Edge Cases & Disambiguation)
    - Test các patterns: amount edit, category edit, date edit, incomplete, anti-pattern
    - Test normalizeAmount: "30k" → 30000, "1.5tr" → 1500000, "50" → 50000 (bare <1000 ×1000 implied by unit requirement)
    - _Requirements: 1.1, 1.4, 2.1, 2.3, 3.1, 5.1, 8.1, 9.3_

- [x] 3. Tạo AIEditDetector
  - [x] 3.1 Implement AIEditDetector với Gemini prompt
    - Tạo file `src/infrastructure/parsers/AIEditDetector.ts`
    - Inject `aiConfig` để lấy Gemini API key và model name
    - Implement Gemini prompt với JSON schema response (temperature=0, maxOutputTokens=300, responseMimeType="application/json")
    - Implement method `analyze(text: string): Promise<EditIntentResult | null>`
    - Parse JSON response: extract amount, category, dateRef → build EditIntentResult
    - Delegate date parsing to `detectDate` từ RegexParser
    - Error handling: log error và throw (để HybridEditDetector xử lý)
    - _Requirements: 1.3, 1.5_
    - **Acceptance criteria**: File compile thành công, có proper error handling với Logger, prompt chứa ví dụ disambiguation "sửa xe 50k"

- [x] 4. Tạo HybridEditDetector
  - [x] 4.1 Implement HybridEditDetector orchestrating regex → AI fallback
    - Tạo file `src/infrastructure/parsers/HybridEditDetector.ts`
    - Implement `EditIntentDetector` interface
    - Inject `RegexEditMatcher` và `AIEditDetector`
    - Logic: (1) Try regex, return nếu non-null. (2) Check edit verb + target keyword → gọi AI. (3) Return null nếu không match
    - Khi AI throw error → re-throw để BotService catch
    - _Requirements: 1.1, 1.2, 1.3, 1.6_
    - **Acceptance criteria**: Khi regex match → AI không được gọi. Khi regex null + có verb + keyword → AI được gọi. Khi regex null + không có verb/keyword → return null

  - [x]* 4.2 Write property tests cho HybridEditDetector
    - Thêm vào file `test/properties/edit-intent-detection.prop.ts`
    - **Property 1: Regex-first invariant** — AI never called when Regex succeeds
    - **Property 10: AI escalation condition** — AI called when regex null + verb + keyword present
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 5. Checkpoint — Compile check
  - Chạy `npm run build` đảm bảo tất cả files mới compile thành công. Fix TypeScript errors nếu có.

- [x] 6. Đăng ký module DI và refactor BotService
  - [x] 6.1 Đăng ký providers trong InfrastructureModule
    - Sửa file `src/infrastructure/infrastructure.module.ts`
    - Import và register: `RegexEditMatcher`, `AIEditDetector`, `HybridEditDetector`
    - Provide token: `{ provide: "EditIntentDetector", useClass: HybridEditDetector }`
    - Export token `"EditIntentDetector"`
    - _Requirements: 1.1_
    - **Acceptance criteria**: Module compile thành công, `EditIntentDetector` token có thể inject được

  - [x] 6.2 Refactor BotService — xoá code cũ và inject dependencies mới
    - Sửa file `src/infrastructure/channels/bot.service.ts`
    - **Xoá**: `EDIT_AMOUNT_REGEX`, `EDIT_CATEGORY_REGEX`, `lastTransactionIds` Map, `handleEditAmount()`, `handleEditCategory()`, và tất cả `lastTransactionIds.set()` calls
    - **Inject mới**: `@Inject("EditIntentDetector") editIntentDetector: EditIntentDetector`, `@Inject("TransactionRepository") transactionRepository: TransactionRepository` (nếu chưa có)
    - **Thêm routing**: Sau UNDO_REGEX check, trước TREND_REPORT_REGEX check → gọi `editIntentDetector.detect()`. Nếu result non-null → gọi `handleEditIntent()`. Nếu AI throw → catch, trả message lỗi, return (KHÔNG ghi khoản mới)
    - **Thêm method** `handleEditIntent(userId, result)`: xử lý incomplete, findLastByUser, category detection pipeline, validate date, execute edit, format response
    - _Requirements: 1.1, 1.4, 1.6, 1.7, 2.1, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 5.1, 5.3, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4_
    - **Acceptance criteria**:
      - "sửa thành 30k" → sửa amount Last_Transaction thành 30000, trả "Đã sửa thành 30.000đ - {category}"
      - "sửa xe 50k" → KHÔNG match edit, fallthrough ghi chi tiêu mới
      - "sửa lại" → trả message hướng dẫn với ví dụ
      - "sửa thành ăn uống" → detect category "Ăn uống", lưu note="ăn uống"
      - "sửa ngày hôm qua" → cập nhật spentAt = yesterday
      - Khi findLastByUser null → trả "Không tìm thấy khoản nào để sửa"
      - Khi AI error → trả message lỗi, KHÔNG ghi khoản mới

- [x] 7. Checkpoint — Full integration compile
  - Chạy `npm run build` đảm bảo toàn bộ project compile thành công sau refactor. Existing code paths không bị ảnh hưởng.

- [x] 8. Tests
  - [x] 8.1 Write integration tests cho BotService edit flow
    - Tạo file `test/channels/bot-edit-intent.spec.ts`
    - Mock EditIntentDetector, TransactionRepository, EditTransaction usecase, ChannelAdapter
    - Test full flow: message → detect → findLastByUser → edit → response format
    - Test incomplete edit → hướng dẫn message
    - Test findLastByUser null → error message
    - Test AI error → error message, RecordTransaction NOT called
    - Test "sửa xe 50k" → detect returns null, falls through to record
    - Test category not found → liệt kê 14 danh mục
    - Test date in future → reject message
    - Test income category edit → amount becomes negative
    - _Requirements: 1.6, 6.4, 7.1, 7.2, 8.1, 8.2, 8.3, 9.3_

  - [ ]* 8.2 Write property tests cho edit flow end-to-end
    - Thêm vào file `test/properties/edit-intent-detection.prop.ts`
    - **Property 8: Incomplete edit never records** — generate incomplete messages → RecordTransaction never called
    - **Property 9: Response format** — generate successful edits → response contains VND format + category
    - **Validates: Requirements 7.2, 7.3, 8.1, 8.2, 8.3**

  - [ ]* 8.3 Write unit tests cho HybridEditDetector
    - Tạo file `test/parsers/hybrid-edit-detector.spec.ts`
    - Mock RegexEditMatcher và AIEditDetector
    - Test: regex match → AI not called, return regex result
    - Test: regex null + verb + keyword → AI called
    - Test: regex null + no verb → return null
    - Test: AI throws → error propagated
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

- [x] 9. Cập nhật README và /help message
  - [x] 9.1 Cập nhật HELP_MSG và README
    - Sửa `HELP_MSG` trong `src/infrastructure/channels/bot.service.ts` để reflect cú pháp sửa mới: "sửa thành 30k", "sửa thành ăn uống", "sửa ngày hôm qua"
    - Sửa `README.md` — cập nhật bảng bot commands với cú pháp sửa mới
    - _Requirements: 8.4_
    - **Acceptance criteria**: HELP_MSG chứa ví dụ "sửa thành 30k", "sửa thành ăn uống", "sửa ngày hôm qua". README phản ánh cú pháp mới.

- [x] 10. Final checkpoint — Build + full test suite
  - Chạy `npm run build && npm test`. Toàn bộ tests phải pass (existing tests + new tests). Đảm bảo existing 265+ tests không bị fail. Confirm routing order đúng theo design.

## Notes

- Design sử dụng TypeScript — tất cả implementation bằng TypeScript
- Tasks marked với `*` là optional, có thể skip cho faster MVP
- Mỗi task reference requirements cụ thể để truy vết
- Checkpoints đảm bảo incremental validation
- Property tests dùng `fast-check` (đã có sẵn trong project)
- Tận dụng tối đa code existing: `detectCategory`, `expandAbbreviations`, `normalizeSpelling`, `detectDate` từ RegexParser
- `EditTransaction` usecase đã tồn tại và xử lý sign convention + ownership check — không cần sửa
- `TransactionRepository.findLastByUser` đã tồn tại — không cần thêm method mới

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "4.1"] },
    { "id": 3, "tasks": ["4.2"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 7, "tasks": ["9.1"] }
  ]
}
```
