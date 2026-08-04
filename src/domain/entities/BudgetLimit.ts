export interface BudgetLimit {
  id?: string;
  userId: string;
  category: string;
  monthlyLimit: number;
  createdAt?: Date;
  updatedAt?: Date;
}
