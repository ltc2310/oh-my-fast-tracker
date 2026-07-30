import { Injectable, Inject } from "@nestjs/common";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { Transaction } from "../../domain/entities/Transaction";

/**
 * Deletes a transaction by ID after verifying user ownership.
 * Returns the deleted transaction for confirmation, or null if not found / not owned.
 */
@Injectable()
export class DeleteTransaction {
  constructor(
    @Inject("TransactionRepository") private readonly repository: TransactionRepository,
  ) {}

  async execute(userId: string, transactionId: string): Promise<Transaction | null> {
    const transaction = await this.repository.findById(transactionId);
    if (!transaction) return null;

    // Ownership check
    if (transaction.userId !== userId) return null;

    const deleted = await this.repository.deleteById(transactionId);
    return deleted ? transaction : null;
  }
}
