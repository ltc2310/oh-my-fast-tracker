import { Injectable, Inject } from "@nestjs/common";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { Transaction } from "../../domain/entities/Transaction";

/**
 * Deletes the most recently created transaction for a user.
 * Returns the deleted transaction so the bot can confirm what was removed,
 * or null if the user has no transactions.
 */
@Injectable()
export class UndoLastTransaction {
  constructor(
    @Inject("TransactionRepository") private readonly repository: TransactionRepository,
  ) {}

  async execute(userId: string): Promise<Transaction | null> {
    const last = await this.repository.findLastByUser(userId);
    if (!last || !last.id) return null;

    // Verify ownership
    if (last.userId !== userId) return null;

    const deleted = await this.repository.deleteById(last.id);
    return deleted ? last : null;
  }
}
