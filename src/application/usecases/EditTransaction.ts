import { Injectable, Inject } from "@nestjs/common";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { Transaction } from "../../domain/entities/Transaction";
import { isIncomeCategory } from "../../domain/constants/income-categories";

export interface EditTransactionFields {
  amount?: number;
  category?: string;
  note?: string;
  spentAt?: Date;
}

/**
 * Edits a transaction by ID after verifying user ownership.
 * Returns the updated transaction, or null if not found / not owned.
 *
 * If category changes to/from an income category, amount sign is adjusted automatically.
 */
@Injectable()
export class EditTransaction {
  constructor(
    @Inject("TransactionRepository") private readonly repository: TransactionRepository,
  ) {}

  async execute(
    userId: string,
    transactionId: string,
    fields: EditTransactionFields,
  ): Promise<Transaction | null> {
    const existing = await this.repository.findById(transactionId);
    if (!existing) return null;

    // Ownership check
    if (existing.userId !== userId) return null;

    // Determine the effective category after edit
    const effectiveCategory = fields.category ?? existing.category;

    // If amount is being changed, apply income sign convention
    let finalAmount = fields.amount;
    if (finalAmount !== undefined) {
      finalAmount = isIncomeCategory(effectiveCategory)
        ? -Math.abs(finalAmount)
        : Math.abs(finalAmount);
    } else if (fields.category !== undefined && fields.category !== existing.category) {
      // Category changed but amount didn't — re-sign existing amount
      finalAmount = isIncomeCategory(fields.category)
        ? -Math.abs(existing.amount)
        : Math.abs(existing.amount);
    }

    const updateFields: Partial<Pick<Transaction, 'amount' | 'category' | 'note' | 'spentAt'>> = {};
    if (finalAmount !== undefined) updateFields.amount = finalAmount;
    if (fields.category !== undefined) updateFields.category = fields.category;
    if (fields.note !== undefined) updateFields.note = fields.note;
    if (fields.spentAt !== undefined) updateFields.spentAt = fields.spentAt;

    // Nothing to update
    if (Object.keys(updateFields).length === 0) return existing;

    return this.repository.update(transactionId, updateFields);
  }
}
