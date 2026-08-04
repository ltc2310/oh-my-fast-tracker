import { BudgetLimit } from "../entities/BudgetLimit";

export interface BudgetLimitRepository {
  /** Find all budget limits for a user. */
  findByUser(userId: string): Promise<BudgetLimit[]>;
  /** Find a budget limit for a specific user + category. */
  findByUserAndCategory(userId: string, category: string): Promise<BudgetLimit | null>;
  /** Create or update a budget limit (upsert by user_id + category). */
  upsert(userId: string, category: string, monthlyLimit: number): Promise<BudgetLimit>;
  /** Delete a budget limit for a user + category. Returns true if deleted. */
  delete(userId: string, category: string): Promise<boolean>;
}
