import { Injectable, Inject } from "@nestjs/common";
import { Parser } from "../../domain/ports/Parser";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { Transaction } from "../../domain/entities/Transaction";

/**
 * This use case only depends on two interfaces (Parser, TransactionRepository)
 * and knows nothing about Regex, Supabase, or Telegram.
 *
 * Supports multi-transaction messages: "ăn sáng 50k, grab 30k" → 2 transactions.
 */
@Injectable()
export class RecordTransaction {
  constructor(
    @Inject("Parser") private readonly parser: Parser,
    @Inject("TransactionRepository") private readonly repository: TransactionRepository
  ) {}

  async execute(userId: string, rawText: string, channel: string = 'telegram'): Promise<Transaction[]> {
    const parsed = await this.parser.parse(rawText);
    if (!parsed || parsed.length === 0) return [];

    const saved: Transaction[] = [];

    for (const item of parsed) {
      const transaction: Transaction = {
        userId,
        amount: item.amount,
        category: item.category,
        note: item.note,
        channel,
        spentAt: item.date ?? new Date(),
      };

      const result = await this.repository.save(transaction);
      saved.push(result);
    }

    return saved;
  }
}
