import { Injectable, Logger } from "@nestjs/common";
import { Parser, ParsedExpense } from "../../domain/ports/Parser";
import { RegexParser } from "./RegexParser";
import { AIParser } from "./AIParser";

/**
 * HybridParser: tries RegexParser first (fast, free), falls back to
 * AIParser (Gemini Flash) only when Regex can't confidently categorize.
 *
 * Strategy for multi-transaction support:
 * 1. Split & parse each segment with Regex
 * 2. If ALL segments are confidently categorized → use Regex results
 * 3. If ANY segment is uncertain → send FULL text to AI for all items
 * 4. If AI fails → return Regex results as-is (with "Khác" for uncertain ones)
 */
@Injectable()
export class HybridParser implements Parser {
  private readonly logger = new Logger(HybridParser.name);

  constructor(
    private readonly regexParser: RegexParser,
    private readonly aiParser: AIParser
  ) {}

  async parse(text: string): Promise<ParsedExpense[]> {
    // Step 1: Try regex with confidence check
    const regexResults = this.regexParser.parseWithConfidence(text);

    // No amounts found at all → not an expense message
    if (regexResults.length === 0) return [];

    // All segments confidently categorized → use directly (free, fast)
    const allConfident = regexResults.every((r) => r.confident);
    if (allConfident) {
      return regexResults.map((r) => ({
        amount: r.amount,
        category: r.category,
        note: r.note,
        date: r.date,
      }));
    }

    // Step 2: At least one segment is uncertain → ask AI for the full message
    this.logger.debug(`Escalating to AI for: "${text}"`);

    const aiResults = await this.aiParser.parse(text);

    if (aiResults.length > 0) {
      // AI doesn't return date, so merge date from regex detection
      const sharedDate = regexResults[0]?.date;
      return aiResults.map((r) => ({
        ...r,
        date: r.date ?? sharedDate,
      }));
    }

    // Step 3: AI failed → return regex results as-is
    return regexResults.map((r) => ({
      amount: r.amount,
      category: r.category,
      note: r.note,
      date: r.date,
    }));
  }
}
