import { Injectable, Inject } from "@nestjs/common";
import { BudgetLimitRepository } from "../../domain/ports/BudgetLimitRepository";

@Injectable()
export class DeleteBudgetLimit {
  constructor(
    @Inject("BudgetLimitRepository")
    private readonly repository: BudgetLimitRepository,
  ) {}

  async execute(userId: string, category: string): Promise<boolean> {
    return this.repository.delete(userId, category);
  }
}
