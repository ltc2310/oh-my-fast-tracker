import { Injectable, Inject, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Parser, ParsedExpense } from "../../domain/ports/Parser";
import { aiConfig } from "../config/app.config";

const CATEGORY_PROMPT = `Bạn là trợ lý phân loại chi tiêu. Cho một tin nhắn chi tiêu bằng tiếng Việt, hãy trích xuất TẤT CẢ các khoản chi trong tin nhắn.

Mỗi khoản chi cần:
1. amount: số tiền (số nguyên, đơn vị VND)
2. category: đúng một trong các tên tiếng Việt sau
3. note: mô tả ngắn gọn khoản chi đó

Danh mục (dùng ĐÚNG tên tiếng Việt bên dưới):
- Ăn uống (ăn, uống, chợ, siêu thị, nấu ăn, nguyên liệu, đồ ăn...)
- Di chuyển (xăng, grab, taxi, xe, gửi xe, rửa xe, đổ xăng...)
- Mua sắm (quần áo, giày dép, mỹ phẩm, online shopping...)
- Nhà ở (thuê nhà, tiền nhà, phòng trọ...)
- Tiện ích (điện, nước, gas...)
- Internet (wifi, 4g, sim, cước, data...)
- Sức khỏe (thuốc, khám, bệnh viện, bác sĩ...)
- Giáo dục (học, sách, khóa học, trường...)
- Giải trí (phim, game, netflix, du lịch, karaoke...)
- Con cái (sữa, bỉm, đồ chơi, học phí con...)
- Chi phí cố định (bảo hiểm, trả góp, phí dịch vụ...)
- Thu nhập (lương, thưởng, freelance...)
- Khác (không xác định được)

Quy tắc:
- Đơn vị: k = nghìn (x1000), tr = triệu (x1000000)
- Nếu không có số tiền nào → trả về []
- Chọn category dựa trên NGỮ CẢNH cho TỪNG khoản chi
- Một tin nhắn có thể chứa NHIỀU khoản chi (phân cách bởi dấu phẩy, xuống dòng, v.v.)

Ví dụ:
- "Ăn sáng 70k, rửa xe 30k, gửi xe 10k" → 3 khoản chi riêng biệt
- "đi chợ 100k" → 1 khoản chi

Trả về JSON array, không giải thích:
[{"amount": number, "category": "tên tiếng Việt", "note": "mô tả"}, ...]
hoặc [] nếu không parse được.`;

/**
 * AI-powered parser using Google Gemini Flash via the official SDK.
 * Supports multi-transaction messages.
 */
@Injectable()
export class AIParser implements Parser {
  private readonly logger = new Logger(AIParser.name);
  private readonly model;

  constructor(
    @Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>
  ) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.model = genAI.getGenerativeModel({
      model: config.geminiModel,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 500,
        responseMimeType: "application/json",
      },
    });
  }

  async parse(text: string): Promise<ParsedExpense[]> {
    try {
      const result = await this.model.generateContent([
        CATEGORY_PROMPT,
        `Tin nhắn: "${text}"`,
      ]);

      const response = result.response;
      const content = response.text();

      if (!content) {
        this.logger.warn("Empty response from Gemini");
        return [];
      }

      const parsed = JSON.parse(content);

      if (!Array.isArray(parsed)) {
        // Handle case where AI returns a single object instead of array
        if (parsed && parsed.amount && parsed.category) {
          return [{
            amount: Number(parsed.amount),
            category: parsed.category,
            note: parsed.note ?? text.trim(),
          }];
        }
        return [];
      }

      return parsed
        .filter((item: Record<string, unknown>) => item && item.amount && item.category)
        .map((item: Record<string, unknown>) => ({
          amount: Number(item.amount),
          category: item.category as string,
          note: (item.note as string) ?? text.trim(),
        }));
    } catch (error) {
      this.logger.error(`AI parsing failed: ${(error as Error).message}`);
      return [];
    }
  }
}
