import { Parser, ParsedExpense } from "../../domain/ports/Parser";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { Transaction } from "../../domain/entities/Transaction";

/**
 * This use case only depends on two interfaces (Parser, TransactionRepository)
 * and knows nothing about Regex, Supabase, or Telegram. Testing is simple:
 * inject a fake Parser + fake Repository, no need to mock HTTP or a real DB.
 */
export class RecordTransaction {
  constructor(
    private readonly parser: Parser,
    private readonly repository: TransactionRepository
  ) {}

  async execute(userId: string, rawText: string): Promise<Transaction | null> {
    const parsed: ParsedExpense | null = this.parser.parse(rawText);
    if (!parsed) return null;

    const transaction: Transaction = {
      userId,
      amount: parsed.amount,
      category: parsed.category,
      note: parsed.note,
    };

    return this.repository.save(transaction);
  }
}
