import { Injectable, Inject, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Parser, ParsedExpense } from "../../domain/ports/Parser";
import { normalizeCategory, isValidCategory } from "../../domain/constants/categories";
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
- Tiết kiệm & Đầu tư (gửi tiết kiệm, đầu tư, chứng khoán, vàng, crypto...)
- Thu nhập (lương, thưởng, freelance...)
- Khác (không xác định được)

Quy tắc:
- Đơn vị: k = nghìn (x1000), tr = triệu (x1000000)
- Nếu không có số tiền nào → trả về []
- Chọn category dựa trên NGỮ CẢNH cho TỪNG khoản chi
- Một tin nhắn có thể chứa NHIỀU khoản chi (phân cách bởi dấu phẩy, xuống dòng, v.v.)
- category PHẢI là một trong 14 tên ở trên, copy chính xác từng ký tự. Không tự tạo tên mới.
- Tên thương hiệu là tín hiệu mạnh để chọn danh mục:
  · Ăn uống: KFC, Lotteria, Jollibee, Pizza Hut, Highlands, Phúc Long, Starbucks,
    The Coffee House, Katinat, Haidilao, Kichi Kichi, Gogi, Manwah, Circle K, GS25,
    WinMart, Bách Hoá Xanh, Big C, Lotte Mart, GrabFood, ShopeeFood, Baemin, Mixue
  · Di chuyển: Xanh SM, Be, Vinasun, Mai Linh, Vietjet, Vietnam Airlines, Phương Trang
  · Mua sắm: Shopee, Lazada, Tiki, Uniqlo, Zara, H&M, Nike, Watsons, Hasaki,
    Điện Máy Xanh, FPT Shop, Thế Giới Di Động
  · Giải trí: CGV, Lotte Cinema, Galaxy Cinema, Netflix, Spotify, Steam, Garena
  · Sức khỏe: Pharmacity, Long Châu, Vinmec, California Fitness
  · Internet: Viettel, Vinaphone, Mobifone, FPT Telecom, VNPT
  · Tiết kiệm & Đầu tư: SSI, VNDirect, VPS, Finhay, Binance

Ví dụ:
- "Ăn sáng 70k, rửa xe 30k, gửi xe 10k" → 3 khoản chi riêng biệt
- "đi chợ 100k" → 1 khoản chi
- "kfc 120k" → [{"amount":120000,"category":"Ăn uống","note":"KFC"}]
- "gửi tiết kiệm 5tr" → [{"amount":5000000,"category":"Tiết kiệm & Đầu tư","note":"gửi tiết kiệm"}]

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

      const parsed: unknown = JSON.parse(content);

      // The model occasionally returns a bare object instead of an array
      const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];

      return items
        .map((item) => this.toParsedExpense(item, text))
        .filter((item): item is ParsedExpense => item !== null);
    } catch (error) {
      this.logger.error(`AI parsing failed: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Validate and coerce one raw model item into a ParsedExpense.
   *
   * The model is a free-text generator, so nothing it returns can be trusted:
   *  - amount may be a string, null, NaN or negative
   *  - category may be hallucinated or a near-miss of a real category name
   *
   * Returns null when the item can't be salvaged.
   */
  private toParsedExpense(item: unknown, originalText: string): ParsedExpense | null {
    if (!item || typeof item !== "object") return null;

    const record = item as Record<string, unknown>;

    const amount = Number(record.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.logger.warn(`Discarding AI item with invalid amount: ${JSON.stringify(record.amount)}`);
      return null;
    }

    const rawCategory = typeof record.category === "string" ? record.category : "";
    const category = normalizeCategory(rawCategory);
    if (rawCategory && !isValidCategory(rawCategory)) {
      this.logger.warn(`AI returned unknown category "${rawCategory}" → mapped to "${category}"`);
    }

    const note = typeof record.note === "string" && record.note.trim()
      ? record.note.trim()
      : originalText.trim();

    return { amount, category, note };
  }
}
