import { AIParser } from "../../src/infrastructure/parsers/AIParser";
import { GeminiMultimodalParser } from "../../src/infrastructure/parsers/GeminiMultimodalParser";
import { isValidCategory } from "../../src/domain/constants/categories";
import { isIncomeCategory } from "../../src/domain/constants/income-categories";

/**
 * AI models are free-text generators — nothing they return can be trusted.
 * These tests pin the sanitisation layer that sits between the model and the DB.
 */

/** Build an AIParser whose underlying model returns a canned JSON string. */
function makeAIParser(modelJson: string): AIParser {
  const parser = new AIParser({ geminiApiKey: "k", geminiModel: "m", geminiMultimodalModel: "m" });
  // Replace the private model with a stub returning our canned payload
  Object.defineProperty(parser, "model", {
    value: {
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => modelJson },
      }),
    },
    writable: true,
  });
  return parser;
}

function makeMultimodalParser(modelJson: string): GeminiMultimodalParser {
  const parser = new GeminiMultimodalParser({ geminiApiKey: "k", geminiModel: "m", geminiMultimodalModel: "m" });
  Object.defineProperty(parser, "model", {
    value: {
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => modelJson },
      }),
    },
    writable: true,
  });
  return parser;
}

describe("AIParser — output sanitisation", () => {
  describe("category validation", () => {
    it("keeps a valid category as-is", async () => {
      const parser = makeAIParser('[{"amount":50000,"category":"Ăn uống","note":"ăn trưa"}]');
      const result = await parser.parse("ăn trưa 50k");

      expect(result).toEqual([{ amount: 50000, category: "Ăn uống", note: "ăn trưa" }]);
    });

    it('maps "Tiết kiệm" → "Tiết kiệm & Đầu tư" so income detection works', async () => {
      const parser = makeAIParser('[{"amount":5000000,"category":"Tiết kiệm","note":"gửi tiết kiệm"}]');
      const result = await parser.parse("gửi tiết kiệm 5tr");

      expect(result[0].category).toBe("Tiết kiệm & Đầu tư");
      expect(isIncomeCategory(result[0].category)).toBe(true);
    });

    it("maps a hallucinated category to Khác", async () => {
      const parser = makeAIParser('[{"amount":50000,"category":"Chi phí bí ẩn","note":"x"}]');
      const result = await parser.parse("x 50k");

      expect(result[0].category).toBe("Khác");
    });

    it("never emits a non-canonical category", async () => {
      const payloads = [
        '[{"amount":1000,"category":"Tiết kiệm","note":"a"}]',
        '[{"amount":1000,"category":"food","note":"b"}]',
        '[{"amount":1000,"category":"","note":"c"}]',
        '[{"amount":1000,"category":"MadeUpCategory","note":"d"}]',
        '[{"amount":1000,"note":"no category at all"}]',
      ];

      for (const payload of payloads) {
        const result = await makeAIParser(payload).parse("test 1k");
        for (const item of result) {
          expect(isValidCategory(item.category)).toBe(true);
        }
      }
    });
  });

  describe("amount validation", () => {
    it("discards non-numeric amounts instead of storing NaN", async () => {
      const parser = makeAIParser('[{"amount":"năm mươi nghìn","category":"Ăn uống","note":"x"}]');
      const result = await parser.parse("x");

      expect(result).toHaveLength(0);
    });

    it("discards null amounts", async () => {
      const parser = makeAIParser('[{"amount":null,"category":"Ăn uống","note":"x"}]');
      expect(await parser.parse("x")).toHaveLength(0);
    });

    it("discards zero and negative amounts", async () => {
      expect(await makeAIParser('[{"amount":0,"category":"Ăn uống","note":"x"}]').parse("x")).toHaveLength(0);
      expect(await makeAIParser('[{"amount":-500,"category":"Ăn uống","note":"x"}]').parse("x")).toHaveLength(0);
    });

    it("accepts numeric strings", async () => {
      const parser = makeAIParser('[{"amount":"50000","category":"Ăn uống","note":"x"}]');
      const result = await parser.parse("x");

      expect(result[0].amount).toBe(50000);
    });

    it("keeps valid items and drops invalid ones in the same batch", async () => {
      const parser = makeAIParser(
        '[{"amount":50000,"category":"Ăn uống","note":"ok"},{"amount":"bad","category":"Ăn uống","note":"nope"},{"amount":30000,"category":"Di chuyển","note":"ok2"}]',
      );
      const result = await parser.parse("...");

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.amount)).toEqual([50000, 30000]);
    });

    it("every returned amount is a finite positive number", async () => {
      const parser = makeAIParser(
        '[{"amount":1,"category":"Khác","note":"a"},{"amount":"NaN","category":"Khác","note":"b"},{"amount":Infinity,"category":"Khác","note":"c"}]'.replace("Infinity", '"Infinity"'),
      );
      const result = await parser.parse("...");

      for (const item of result) {
        expect(Number.isFinite(item.amount)).toBe(true);
        expect(item.amount).toBeGreaterThan(0);
      }
    });
  });

  describe("malformed payloads", () => {
    it("handles a bare object instead of an array", async () => {
      const parser = makeAIParser('{"amount":50000,"category":"Ăn uống","note":"x"}');
      const result = await parser.parse("x 50k");

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(50000);
    });

    it("returns [] on invalid JSON", async () => {
      const parser = makeAIParser("this is not json");
      expect(await parser.parse("x")).toEqual([]);
    });

    it("returns [] on an empty array", async () => {
      expect(await makeAIParser("[]").parse("x")).toEqual([]);
    });

    it("skips null / non-object entries", async () => {
      const parser = makeAIParser('[null, "string", 42, {"amount":50000,"category":"Ăn uống","note":"ok"}]');
      const result = await parser.parse("x");

      expect(result).toHaveLength(1);
    });
  });

  describe("note fallback", () => {
    it("falls back to the original text when note is missing", async () => {
      const parser = makeAIParser('[{"amount":50000,"category":"Ăn uống"}]');
      const result = await parser.parse("ăn trưa 50k");

      expect(result[0].note).toBe("ăn trưa 50k");
    });

    it("falls back when note is blank", async () => {
      const parser = makeAIParser('[{"amount":50000,"category":"Ăn uống","note":"   "}]');
      const result = await parser.parse("ăn trưa 50k");

      expect(result[0].note).toBe("ăn trưa 50k");
    });
  });
});

describe("GeminiMultimodalParser — output sanitisation", () => {
  const audio = Buffer.from("fake-audio");
  const image = Buffer.from("fake-image");

  describe("parseVoice", () => {
    it('maps "Tiết kiệm" → "Tiết kiệm & Đầu tư"', async () => {
      const parser = makeMultimodalParser('[{"amount":5000000,"category":"Tiết kiệm","note":"gửi tiết kiệm"}]');
      const result = await parser.parseVoice(audio, "audio/ogg");

      expect(result[0].category).toBe("Tiết kiệm & Đầu tư");
      expect(isIncomeCategory(result[0].category)).toBe(true);
    });

    it("maps hallucinated categories to Khác", async () => {
      const parser = makeMultimodalParser('[{"amount":50000,"category":"Không rõ ràng gì cả","note":"x"}]');
      const result = await parser.parseVoice(audio, "audio/ogg");

      expect(result[0].category).toBe("Khác");
    });

    it("discards invalid amounts", async () => {
      const parser = makeMultimodalParser('[{"amount":"không rõ","category":"Ăn uống","note":"x"}]');
      expect(await parser.parseVoice(audio, "audio/ogg")).toHaveLength(0);
    });

    it("returns [] for an empty result", async () => {
      const parser = makeMultimodalParser("[]");
      expect(await parser.parseVoice(audio, "audio/ogg")).toEqual([]);
    });

    it("always returns canonical categories", async () => {
      const parser = makeMultimodalParser(
        '[{"amount":1000,"category":"Tiết kiệm","note":"a"},{"amount":2000,"category":"nonsense","note":"b"}]',
      );
      const result = await parser.parseVoice(audio, "audio/ogg");

      for (const item of result) {
        expect(isValidCategory(item.category)).toBe(true);
      }
    });
  });

  describe("parseImage", () => {
    it("builds a note from recipient and bank", async () => {
      const parser = makeMultimodalParser('[{"amount":500000,"recipient":"NGUYEN VAN A","bank":"Vietcombank"}]');
      const result = await parser.parseImage(image, "image/jpeg");

      expect(result[0]).toMatchObject({
        amount: 500000,
        category: "Khác",
        note: "NGUYEN VAN A - Vietcombank",
      });
    });

    it('defaults the note to "Chuyển khoản" when both fields are missing', async () => {
      const parser = makeMultimodalParser('[{"amount":500000}]');
      const result = await parser.parseImage(image, "image/jpeg");

      expect(result[0].note).toBe("Chuyển khoản");
    });

    it("discards invalid amounts", async () => {
      const parser = makeMultimodalParser('[{"amount":"nhiều","recipient":"A","bank":"B"}]');
      expect(await parser.parseImage(image, "image/jpeg")).toHaveLength(0);
    });

    it("returns [] when the image is not a bank transfer", async () => {
      const parser = makeMultimodalParser("[]");
      expect(await parser.parseImage(image, "image/jpeg")).toEqual([]);
    });
  });
});
