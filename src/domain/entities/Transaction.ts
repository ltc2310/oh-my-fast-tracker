export interface Transaction {
  id?: string;
  userId: string;
  amount: number;
  category: string;
  note: string;
  createdAt?: Date;
}
