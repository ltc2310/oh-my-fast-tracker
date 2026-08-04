import { Injectable, Inject } from "@nestjs/common";
import { BudgetLimit } from "../../domain/entities/BudgetLimit";
import { BudgetLimitRepository } from "../../domain/ports/BudgetLimitRepository";

@Injectable()
export class SetBudgetLimit {
  constructor(
    @Inject("BudgetLimitRepository")
    private readonly repository: BudgetLimitRepository,
  ) {}

  async execute(userId: string, category: string, monthlyLimit: number): Promise<BudgetLimit> {
    return this.repository.upsert(userId, category, monthlyLimit);
  }
}
