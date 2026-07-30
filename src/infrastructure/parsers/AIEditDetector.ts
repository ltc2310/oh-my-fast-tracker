import { Injectable, Inject, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { EditIntentResult } from "../../domain/ports/EditIntentDetector";
import { aiConfig } from "../config/app.config";
import { detectDate } from "./RegexParser";

const EDIT_INTENT_PROMPT = `Bạn là trợ lý phân tích ý định sửa giao dịch chi tiêu. Cho một tin nhắn tiếng Việt, hãy xác định xem người dùng có muốn SỬA khoản giao dịch gần nhất hay không.

Ý định sửa: người dùng muốn thay đổi số tiền, danh mục, nội dung, hoặc ngày của khoản GẦN NHẤT.
KHÔNG phải ý định sửa: người dùng muốn ghi khoản CHI TIÊU MỚI (ví dụ "sửa xe 50k" = chi phí sửa xe).

Quy tắc phân biệt:
- Có động từ sửa (sửa, đổi, chỉnh, edit) + từ khóa mục tiêu (thành, sang, lại, danh mục, ngày, về) → ý định SỬA
- Có động từ sửa + danh từ/mô tả + số tiền, KHÔNG có từ khóa mục tiêu → CHI TIÊU MỚI (return isEditIntent: false)

Nếu là ý định sửa, trích xuất:
- amount: số tiền mới (đơn vị VND, đã nhân k=1000, tr=1000000). null nếu không đề cập
- category: tên danh mục/mô tả mới. null nếu không đề cập
- dateRef: tham chiếu ngày ("hôm qua", "hôm kia", "3 ngày trước"). null nếu không đề cập

Trả về JSON, không giải thích:
{"isEditIntent": boolean, "amount": number|null, "category": string|null, "dateRef": string|null}

Ví dụ:
- "sửa lại thành cà phê 30k hôm qua" → {"isEditIntent": true, "amount": 30000, "category": "cà phê", "dateRef": "hôm qua"}
- "đổi sang ăn uống" → {"isEditIntent": true, "amount": null, "category": "ăn uống", "dateRef": null}
- "sửa xe 50k" → {"isEditIntent": false, "amount": null, "category": null, "dateRef": null}
- "chỉnh lại thành 100k" → {"isEditIntent": true, "amount": 100000, "category": null, "dateRef": null}`;

@Injectable()
export class AIEditDetector {
  private readonly logger = new Logger(AIEditDetector.name);
  private readonly model;

  constructor(
    @Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>,
  ) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.model = genAI.getGenerativeModel({
      model: config.geminiModel,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 300,
        responseMimeType: "application/json",
      },
    });
  }

  async analyze(text: string): Promise<EditIntentResult | null> {
    try {
      const result = await this.model.generateContent([
        EDIT_INTENT_PROMPT,
        `Tin nhắn: "${text}"`,
      ]);
      const content = result.response.text();
      if (!content) return null;

      const parsed = JSON.parse(content);
      if (!parsed.isEditIntent) return null;

      const fields: EditIntentResult["fields"] = {};
      if (parsed.amount) fields.amount = Number(parsed.amount);
      if (parsed.category) {
        fields.category = parsed.category;
        fields.note = parsed.category;
      }
      if (parsed.dateRef) {
        const date = detectDate(parsed.dateRef);
        if (date) fields.spentAt = date;
      }

      const hasFields = Object.keys(fields).length > 0;
      return {
        isEditIntent: true,
        fields,
        isIncomplete: !hasFields,
      };
    } catch (error) {
      this.logger.error(`AI edit detection failed: ${(error as Error).message}`);
      throw error;
    }
  }
}
