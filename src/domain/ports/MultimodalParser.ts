import { ParsedExpense } from './Parser';

/**
 * Contract for parsing multimodal inputs (voice and image) into expenses.
 * Supports voice messages and bank transfer screenshots via AI-powered analysis.
 */
export interface MultimodalParser {
  parseVoice(audio: Buffer, mimeType: string): Promise<ParsedExpense[]>;
  parseImage(image: Buffer, mimeType: string): Promise<ParsedExpense[]>;
}
