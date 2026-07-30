import { Injectable, Logger } from "@nestjs/common";
import { EditIntentDetector, EditIntentResult } from "../../domain/ports/EditIntentDetector";
import { RegexEditMatcher } from "./RegexEditMatcher";
import { AIEditDetector } from "./AIEditDetector";

/** Động từ sửa — dùng để quyết định có escalate lên AI không */
const EDIT_VERB_REGEX = /(?:sửa|sua|đổi|doi|chỉnh|chinh|edit)/i;

/** Từ khóa mục tiêu — phải có ít nhất 1 cái thì mới gọi AI */
const TARGET_KEYWORD_REGEX = /(?:thành|thanh|sang|lại|lai|danh\s*mục|ngày|ngay|về|ve)/i;

@Injectable()
export class HybridEditDetector implements EditIntentDetector {
  private readonly logger = new Logger(HybridEditDetector.name);

  constructor(
    private readonly regexMatcher: RegexEditMatcher,
    private readonly aiDetector: AIEditDetector,
  ) {}

  async detect(text: string): Promise<EditIntentResult | null> {
    // Step 1: Try regex (fast, free)
    const regexResult = this.regexMatcher.match(text);
    if (regexResult !== null) {
      return regexResult;
    }

    // Step 2: Check if message has edit verb + target keyword → escalate to AI
    if (EDIT_VERB_REGEX.test(text) && TARGET_KEYWORD_REGEX.test(text)) {
      this.logger.debug(`Escalating to AI for edit detection: "${text}"`);
      try {
        return await this.aiDetector.analyze(text);
      } catch (error) {
        this.logger.error(`AI edit detection failed, returning error signal`);
        throw error; // BotService sẽ catch và thông báo lỗi
      }
    }

    // Step 3: No edit intent detected
    return null;
  }
}
