import { Injectable, Inject, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ParsedExpense } from "../../domain/ports/Parser";
import { MultimodalParser } from "../../domain/ports/MultimodalParser";
import { aiConfig } from "../config/app.config";

const VOICE_PROMPT = `Bạn là trợ lý ghi chi tiêu. Hãy nghe đoạn audio tiếng Việt và trích xuất TẤT CẢ các khoản chi tiêu được nhắc đến.

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
- Tiết kiệm (gửi tiết kiệm, đầu tư...)
- Khác (không xác định được)

Quy tắc:
- Đơn vị: k = nghìn (x1000), tr = triệu (x1000000)
- Nếu không nghe rõ số tiền hoặc không phải mô tả chi tiêu → trả về []
- Chọn category dựa trên NGỮ CẢNH cho TỪNG khoản chi

Trả về JSON array:
[{"amount": number, "category": "tên tiếng Việt", "note": "mô tả"}, ...]
hoặc [] nếu không detect được khoản chi tiêu nào.`;

const IMAGE_PROMPT = `Bạn là trợ lý ghi chi tiêu. Hãy phân tích ảnh chụp màn hình giao dịch chuyển khoản ngân hàng Việt Nam.

Hỗ trợ các ngân hàng/ví: VCB (Vietcombank), MBBank, TPBank, Techcombank, BIDV, VietinBank, MoMo, ZaloPay và các ngân hàng Việt Nam khác.

Nếu đây là ảnh chuyển khoản, hãy trích xuất:
1. amount: số tiền chuyển (số nguyên, đơn vị VND)
2. recipient: tên người nhận
3. bank: tên ngân hàng/ví điện tử

Quy tắc:
- Nếu KHÔNG PHẢI ảnh chuyển khoản ngân hàng (ảnh random, meme, ảnh chụp khác...) → trả về []
- Chỉ trích xuất giao dịch chuyển tiền, không phải biên lai mua hàng thông thường
- amount phải là số nguyên (VND), bỏ dấu chấm/phẩy ngăn cách hàng nghìn

Trả về JSON array:
[{"amount": number, "recipient": "tên người nhận", "bank": "tên ngân hàng"}]
hoặc [] nếu không phải ảnh chuyển khoản.`;

/**
 * Multimodal parser using Google Gemini 2.0 Flash for voice and image inputs.
 * Handles Vietnamese voice messages and bank transfer screenshots.
 */
@Injectable()
export class GeminiMultimodalParser implements MultimodalParser {
  private readonly logger = new Logger(GeminiMultimodalParser.name);
  private readonly model;

  constructor(
    @Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>,
  ) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.model = genAI.getGenerativeModel({
      model: config.geminiMultimodalModel,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    });
  }

  async parseVoice(audio: Buffer, mimeType: string): Promise<ParsedExpense[]> {
    this.logger.debug(`parseVoice called, mimeType=${mimeType}, size=${audio.length}`);

    try {
      const result = await this.model.generateContent([
        VOICE_PROMPT,
        {
          inlineData: {
            mimeType,
            data: audio.toString("base64"),
          },
        },
      ]);

      const response = result.response;
      const content = response.text();

      if (!content) {
        this.logger.warn("Empty response from Gemini (voice)");
        return [];
      }

      const parsed = JSON.parse(content);

      if (!Array.isArray(parsed)) {
        if (parsed && parsed.amount && parsed.category) {
          return [
            {
              amount: Number(parsed.amount),
              category: parsed.category,
              note: parsed.note ?? "",
            },
          ];
        }
        return [];
      }

      return parsed
        .filter(
          (item: Record<string, unknown>) => item && item.amount && item.category,
        )
        .map((item: Record<string, unknown>) => ({
          amount: Number(item.amount),
          category: item.category as string,
          note: (item.note as string) ?? "",
        }));
    } catch (error) {
      this.logger.error(
        `Voice parsing failed: ${(error as Error).message}`,
        undefined,
        { mimeType, audioSize: audio.length },
      );
      throw error;
    }
  }

  async parseImage(image: Buffer, mimeType: string): Promise<ParsedExpense[]> {
    this.logger.debug(`parseImage called, mimeType=${mimeType}, size=${image.length}`);

    try {
      const result = await this.model.generateContent([
        IMAGE_PROMPT,
        {
          inlineData: {
            mimeType,
            data: image.toString("base64"),
          },
        },
      ]);

      const response = result.response;
      const content = response.text();

      if (!content) {
        this.logger.warn("Empty response from Gemini (image)");
        return [];
      }

      const parsed = JSON.parse(content);

      if (!Array.isArray(parsed)) {
        if (parsed && parsed.amount) {
          const recipient = (parsed.recipient as string) ?? "";
          const bank = (parsed.bank as string) ?? "";
          const note = [recipient, bank].filter(Boolean).join(" - ");
          return [
            {
              amount: Number(parsed.amount),
              category: "Khác",
              note: note || "Chuyển khoản",
            },
          ];
        }
        return [];
      }

      return parsed
        .filter((item: Record<string, unknown>) => item && item.amount)
        .map((item: Record<string, unknown>) => {
          const recipient = (item.recipient as string) ?? "";
          const bank = (item.bank as string) ?? "";
          const note = [recipient, bank].filter(Boolean).join(" - ");
          return {
            amount: Number(item.amount),
            category: "Khác",
            note: note || "Chuyển khoản",
          };
        });
    } catch (error) {
      this.logger.error(
        `Image parsing failed: ${(error as Error).message}`,
        undefined,
        { mimeType, imageSize: image.length },
      );
      throw error;
    }
  }
}
