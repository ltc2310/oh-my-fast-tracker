# Requirements Document

## Introduction

Tính năng cho phép sếp sửa lại giao dịch **gần nhất** bằng **ngôn ngữ tự nhiên** tiếng Việt, thay vì phải gõ đúng cú pháp cứng. Ví dụ: "sửa thành 30k", "sửa lại thành ăn uống", "đổi danh mục qua di chuyển", "đổi ngày hôm qua". Lệnh sửa chỉ được kích hoạt khi động từ sửa đi kèm một từ khóa chỉ mục tiêu sửa ("thành", "sang", "lại", "danh mục", "ngày", "về"); còn câu như "sửa xe 50k" (động từ sửa theo sau bởi danh từ kèm số tiền, ví dụ chi phí sửa chữa xe) được coi là khoản chi tiêu mới. Bot nhận diện ý định sửa theo cơ chế **lai (hybrid)**: thử Regex trước (nhanh, miễn phí, cho mẫu phổ biến), nếu Regex không nhận ra thì mới nhờ AI (Gemini) phân tích câu tự nhiên phức tạp/mơ hồ — giống pattern HybridParser (RegexParser + AIParser) đã có sẵn.

Khi sửa, bot phải: (1) xác định khoản gần nhất qua truy vấn database (`findLastByUser`) chứ không dùng cache RAM — bền vững qua restart; (2) lưu đúng danh mục chuẩn của hệ thống bằng cách detect từ nội dung qua pipeline của RegexParser; (3) giữ nguyên `note` phản ánh đúng text sếp nhập; (4) lưu xuống database và hiển thị kết quả ngay (save-and-show), không hỏi xác nhận Có/Không.

Tính năng này thay thế cơ chế sửa hiện tại (`EDIT_AMOUNT_REGEX`, `EDIT_CATEGORY_REGEX`, `lastTransactionIds` trong RAM) và khắc phục các lỗi hiện có: "sửa lại"/"sửa danh mục" trả về sai thông báo "Em chưa nhận diện được số tiền", và yêu cầu bắt buộc gõ cả số cũ lẫn số mới. Bot xưng "em" và gọi người dùng là "sếp".

## Glossary

- **Bot**: Telegram chatbot xử lý tin nhắn từ sếp, định tuyến message tới đúng luồng xử lý
- **Edit_Intent_Detector**: Thành phần lai (hybrid) nhận diện ý định sửa và trích xuất các trường cần sửa từ một message, gồm Regex_Edit_Matcher và AI_Edit_Detector
- **Regex_Edit_Matcher**: Bộ nhận diện ý định sửa bằng biểu thức chính quy, chạy trước, không tốn chi phí, xử lý các mẫu câu phổ biến
- **AI_Edit_Detector**: Bộ nhận diện ý định sửa bằng Gemini AI, chỉ được gọi khi Regex_Edit_Matcher không nhận ra ý định hoặc câu quá mơ hồ
- **Edit_Target_Keyword**: Từ khóa chỉ mục tiêu sửa, đi kèm động từ sửa để xác nhận ý định sửa giao dịch. Gồm đúng các từ: "thành", "sang", "lại", "danh mục", "ngày", "về"
- **Edit_Fields**: Tập các trường được trích xuất để sửa, gồm số tiền (amount), danh mục (category), nội dung (note), và ngày (spentAt); mỗi trường là tùy chọn
- **Last_Transaction**: Giao dịch được tạo gần nhất của một sếp, xác định qua `Transaction_Repository.findLastByUser`
- **Transaction_Repository**: Repository lưu trữ giao dịch, cung cấp `findById`, `findLastByUser`, `update`, `deleteById` (đã tồn tại)
- **Edit_Transaction_UseCase**: Usecase `EditTransaction` thực hiện sửa giao dịch theo ID sau khi kiểm tra quyền sở hữu, gọi `Transaction_Repository.update` (đã tồn tại)
- **Category_Detector**: Pipeline detect danh mục chuẩn từ nội dung tự do, gồm `expandAbbreviations` → `normalizeSpelling` → `detectCategory` của RegexParser (đã tồn tại)
- **Date_Detector**: Hàm `detectDate` của RegexParser, nhận diện ngày tương đối tiếng Việt (đã tồn tại)
- **Category**: Danh mục chi tiêu chuẩn của hệ thống. Có đúng 14 danh mục: Ăn uống, Di chuyển, Mua sắm, Nhà ở, Tiện ích, Internet, Sức khỏe, Giáo dục, Giải trí, Con cái, Chi phí cố định, Tiết kiệm & Đầu tư, Thu nhập, Khác
- **Income_Category**: Danh mục biểu diễn tiền vào (Thu nhập, Tiết kiệm & Đầu tư), xác định qua `isIncomeCategory`; giao dịch thuộc danh mục này lưu amount ở dạng số ÂM
- **VND_Amount**: Số tiền quy đổi ra đồng Việt Nam từ shorthand: "k"/"nghìn"/"ngàn" ×1.000, "tr"/"triệu" ×1.000.000, số trần (bare number) ≥ 1.000 giữ nguyên

## Requirements

### Requirement 1: Nhận diện ý định sửa theo cơ chế lai (hybrid)

**User Story:** As a sếp, I want the bot to understand my natural-language edit requests, so that I don't have to memorize a rigid syntax.

#### Acceptance Criteria

1. WHEN sếp gửi một message, THE Edit_Intent_Detector SHALL chạy Regex_Edit_Matcher trước để xác định message có phải ý định sửa giao dịch gần nhất hay không
2. WHEN Regex_Edit_Matcher nhận diện được ý định sửa, THE Edit_Intent_Detector SHALL sử dụng kết quả của Regex_Edit_Matcher và SHALL NOT gọi AI_Edit_Detector
3. WHEN Regex_Edit_Matcher không nhận diện được ý định sửa AND message chứa động từ sửa (ví dụ "sửa", "sua", "đổi", "doi", "chỉnh", "edit") đi kèm một Edit_Target_Keyword ("thành", "sang", "lại", "danh mục", "ngày", "về"), THE Edit_Intent_Detector SHALL gọi AI_Edit_Detector để phân tích câu tự nhiên và trích xuất Edit_Fields
4. IF một message bắt đầu bằng động từ sửa nhưng theo sau là danh từ/mô tả kèm số tiền mà KHÔNG chứa Edit_Target_Keyword (ví dụ "sửa xe 50k", "sửa điện thoại 200k"), THEN THE Edit_Intent_Detector SHALL NOT coi đây là ý định sửa AND THE Bot SHALL chuyển message sang luồng ghi giao dịch mới
5. WHEN AI_Edit_Detector phân tích message, THE AI_Edit_Detector SHALL trả về tập Edit_Fields được nhận diện cùng cờ cho biết có phải ý định sửa hay không
6. IF AI_Edit_Detector không khả dụng hoặc trả về lỗi, THEN THE Bot SHALL thông báo cho sếp rằng hệ thống đang bận và đề nghị thử lại theo cú pháp ví dụ, AND SHALL NOT ghi message thành khoản chi tiêu mới
7. WHEN Edit_Intent_Detector xác định message KHÔNG phải ý định sửa, THE Bot SHALL chuyển message sang các luồng xử lý khác theo thứ tự định tuyến hiện có

### Requirement 2: Sửa số tiền của khoản gần nhất

**User Story:** As a sếp, I want to change only the amount of my last transaction without repeating the old value, so that correcting a typo is quick.

#### Acceptance Criteria

1. WHEN Edit_Intent_Detector trích xuất được số tiền mới từ message (ví dụ "sửa thành 30k", "sửa 30k", "đổi thành 500k") AND không có trường nào khác, THE Bot SHALL sửa amount của Last_Transaction thành VND_Amount mới
2. THE Edit_Intent_Detector SHALL nhận diện được số tiền mới mà KHÔNG bắt buộc sếp gõ số tiền cũ
3. WHEN chuyển đổi số tiền mới ra VND_Amount, THE Bot SHALL áp dụng quy tắc: "k"/"nghìn"/"ngàn" nhân 1.000, "tr"/"triệu" nhân 1.000.000, và số trần lớn hơn hoặc bằng 1.000 giữ nguyên giá trị
4. WHEN sửa amount AND Last_Transaction thuộc Income_Category, THE Edit_Transaction_UseCase SHALL lưu amount ở dạng số âm với giá trị tuyệt đối bằng VND_Amount mới
5. WHEN sửa amount AND Last_Transaction không thuộc Income_Category, THE Edit_Transaction_UseCase SHALL lưu amount ở dạng số dương bằng VND_Amount mới
6. IF Edit_Intent_Detector nhận ra động từ sửa amount nhưng không trích xuất được số tiền hợp lệ, THEN THE Bot SHALL hỏi lại sếp muốn sửa thành bao nhiêu kèm một ví dụ cụ thể, AND SHALL NOT ghi khoản mới từ chính message đó

### Requirement 3: Sửa danh mục và nội dung của khoản gần nhất

**User Story:** As a sếp, I want to change the category of my last transaction using natural words, so that it is filed under the correct standard category with a meaningful note.

#### Acceptance Criteria

1. WHEN Edit_Intent_Detector trích xuất được nội dung mô tả danh mục từ message (ví dụ "sửa thành ăn uống", "đổi danh mục grab", "sửa lại thành cà phê"), THE Bot SHALL chạy Category_Detector trên nội dung đó để xác định Category chuẩn
2. WHEN Category_Detector trả về một Category chuẩn, THE Edit_Transaction_UseCase SHALL lưu trường category bằng đúng tên Category chuẩn đó
3. WHEN sửa danh mục, THE Edit_Transaction_UseCase SHALL lưu trường note bằng đúng text mô tả mà sếp nhập
4. IF Category_Detector không xác định được Category chuẩn từ nội dung, THEN THE Bot SHALL thông báo chưa nhận ra danh mục AND SHALL liệt kê 14 Category chuẩn để sếp chọn, AND SHALL NOT thay đổi Last_Transaction
5. WHEN danh mục mới thuộc Income_Category AND danh mục cũ của Last_Transaction không thuộc Income_Category, THE Edit_Transaction_UseCase SHALL chuyển amount sang số âm với giá trị tuyệt đối giữ nguyên
6. WHEN danh mục mới không thuộc Income_Category AND danh mục cũ của Last_Transaction thuộc Income_Category, THE Edit_Transaction_UseCase SHALL chuyển amount sang số dương với giá trị tuyệt đối giữ nguyên

### Requirement 4: Sửa nhiều trường cùng lúc

**User Story:** As a sếp, I want to edit amount, category, and date together in one message, so that I can correct multiple details at once.

#### Acceptance Criteria

1. WHEN Edit_Intent_Detector trích xuất được nhiều trường trong cùng một message (ví dụ "sửa thành ăn uống 30k hôm qua"), THE Bot SHALL cập nhật tất cả các trường được nhận diện của Last_Transaction trong một lần gọi Edit_Transaction_UseCase
2. WHEN một message vừa chứa số tiền mới vừa chứa nội dung danh mục mới, THE Edit_Transaction_UseCase SHALL áp dụng cả VND_Amount mới và Category chuẩn được detect
3. WHEN cập nhật nhiều trường mà trong đó có thay đổi giữa Income_Category và danh mục chi tiêu, THE Edit_Transaction_UseCase SHALL xác định dấu của amount dựa trên danh mục hiệu lực sau khi sửa và giữ nguyên giá trị tuyệt đối do sếp cung cấp
4. WHILE xử lý một message sửa nhiều trường, THE Bot SHALL chỉ giữ nguyên các trường mà sếp không đề cập và chỉ thay đổi các trường được nhận diện

### Requirement 5: Sửa ngày của khoản gần nhất

**User Story:** As a sếp, I want to correct the date of my last transaction using relative Vietnamese phrases, so that the expense is recorded on the right day.

#### Acceptance Criteria

1. WHEN Edit_Intent_Detector trích xuất được tham chiếu ngày tương đối từ message (ví dụ "sửa ngày hôm qua", "đổi thành hôm kia", "sửa lại 3 ngày trước"), THE Bot SHALL dùng Date_Detector để tính ra ngày cụ thể AND cập nhật spentAt của Last_Transaction
2. THE Date_Detector SHALL nhận diện các tham chiếu "hôm qua", "hôm kia", và "X ngày trước"
3. IF ngày tính ra rơi vào tương lai so với thời điểm hiện tại, THEN THE Bot SHALL từ chối cập nhật ngày AND thông báo cho sếp rằng không thể đặt ngày trong tương lai, AND SHALL NOT thay đổi Last_Transaction
4. IF Edit_Intent_Detector nhận ra ý định sửa ngày nhưng không trích xuất được ngày hợp lệ, THEN THE Bot SHALL hỏi lại sếp muốn đổi sang ngày nào kèm ví dụ cụ thể

### Requirement 6: Xác định khoản gần nhất qua database và kiểm tra quyền sở hữu

**User Story:** As a sếp, I want the bot to always know my most recent transaction even after a restart, so that editing works reliably.

#### Acceptance Criteria

1. WHEN Bot cần xác định khoản để sửa, THE Bot SHALL gọi `Transaction_Repository.findLastByUser` với userId của sếp để lấy Last_Transaction
2. THE Bot SHALL NOT dựa vào cache trong bộ nhớ RAM để xác định Last_Transaction
3. WHEN xác định Last_Transaction qua `findLastByUser`, THE Bot SHALL trả đúng khoản gần nhất kể cả sau khi tiến trình khởi động lại
4. IF `findLastByUser` trả về null (sếp chưa có giao dịch nào), THEN THE Bot SHALL thông báo không tìm thấy khoản nào để sửa AND đề nghị sếp ghi khoản mới trước
5. WHEN Edit_Transaction_UseCase thực hiện sửa, THE Edit_Transaction_UseCase SHALL kiểm tra `userId` của giao dịch trùng với userId của sếp trước khi cập nhật
6. IF giao dịch cần sửa không thuộc quyền sở hữu của sếp, THEN THE Edit_Transaction_UseCase SHALL trả về null AND THE Bot SHALL thông báo không sửa được khoản đó

### Requirement 7: Lưu xuống database và hiển thị kết quả ngay (save-and-show)

**User Story:** As a sếp, I want the edit to be saved and the result shown immediately, so that I don't have to confirm with an extra step.

#### Acceptance Criteria

1. WHEN Edit_Fields hợp lệ được xác định, THE Bot SHALL lưu thay đổi xuống database qua Edit_Transaction_UseCase mà SHALL NOT hỏi xác nhận Có/Không
2. WHEN Edit_Transaction_UseCase lưu thành công, THE Bot SHALL phản hồi bằng một message hiển thị số tiền theo định dạng VND (dấu chấm phân cách hàng nghìn, hậu tố "đ") và tên Category của khoản sau khi sửa
3. WHERE khoản sau khi sửa thuộc Income_Category, THE Bot SHALL hiển thị số tiền theo giá trị tuyệt đối và diễn đạt là khoản thu
4. IF Edit_Transaction_UseCase trả về null vì khoản đã bị xoá, THEN THE Bot SHALL thông báo không sửa được vì khoản có thể đã bị xoá
5. IF thao tác ghi database thất bại, THEN THE Bot SHALL thông báo cho sếp rằng hệ thống đang gặp sự cố và đề nghị thử lại

### Requirement 8: Xử lý câu mơ hồ và hướng dẫn sếp

**User Story:** As a sếp, I want helpful guidance when my edit request is incomplete, so that I know exactly what to type next.

#### Acceptance Criteria

1. WHEN Edit_Intent_Detector nhận ra động từ sửa nhưng KHÔNG trích xuất được trường nào để sửa (ví dụ "sửa lại", "sửa", "sửa danh mục" không kèm nội dung), THE Bot SHALL hỏi lại sếp muốn sửa gì (số tiền, danh mục, nội dung, hay ngày) kèm ví dụ cụ thể cho từng trường
2. WHEN xử lý câu sửa mơ hồ, THE Bot SHALL NOT trả về thông báo "Em chưa nhận diện được số tiền"
3. WHEN xử lý câu sửa mơ hồ, THE Bot SHALL NOT ghi message đó thành khoản chi tiêu hoặc thu nhập mới
4. THE Bot SHALL dùng giọng văn xưng "em" và gọi sếp là "sếp" trong mọi message phản hồi của tính năng sửa

### Requirement 9: Không phá vỡ các luồng xử lý hiện có

**User Story:** As a sếp, I want existing features to keep working exactly as before, so that adding natural-language editing doesn't break recording, reports, or commands.

#### Acceptance Criteria

1. WHEN Bot định tuyến một message, THE Bot SHALL kiểm tra các luồng theo đúng thứ tự ưu tiên: lệnh `id`, lệnh `/start`, kiểm tra quyền truy cập, lệnh `/help`, so sánh tháng, hoàn tác/xoá, sửa giao dịch, báo cáo xu hướng, báo cáo tuần/tháng, và cuối cùng là ghi giao dịch mới
2. WHEN một message là ghi chi tiêu hợp lệ không chứa động từ sửa (ví dụ "ăn trưa 50k", "grab 30k, cf 25k"), THE Bot SHALL ghi giao dịch mới như hành vi hiện tại
3. WHEN một message "sửa xe 50k" được nhận (động từ sửa theo sau bởi danh từ/mô tả kèm số tiền, KHÔNG có Edit_Target_Keyword), THE Edit_Intent_Detector SHALL NOT coi đây là ý định sửa AND THE Bot SHALL ghi thành khoản chi tiêu mới thuộc Category "Di chuyển"
4. THE Bot SHALL giữ nguyên hành vi của các luồng hoàn tác/xoá, báo cáo, báo cáo xu hướng, `/start`, `/help`, và lệnh `id`
5. THE tính năng sửa SHALL không làm thất bại bất kỳ test nào trong bộ test hiện có
