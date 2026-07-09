import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Transaction } from "../../domain/entities/Transaction";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";

export class SupabaseTransactionRepository implements TransactionRepository {
  private readonly client: SupabaseClient;

  constructor(url: string, apiKey: string) {
    this.client = createClient(url, apiKey);
  }

  async save(transaction: Transaction): Promise<Transaction> {
    const { data, error } = await this.client
      .from("transactions")
      .insert({
        user_id: transaction.userId,
        amount: transaction.amount,
        category: transaction.category,
        note: transaction.note,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to save transaction: ${error.message}`);

    return {
      id: data.id,
      userId: data.user_id,
      amount: data.amount,
      category: data.category,
      note: data.note,
      createdAt: new Date(data.created_at),
    };
  }

  async findByUserAndDateRange(
    userId: string,
    from: Date,
    to: Date
  ): Promise<Transaction[]> {
    const { data, error } = await this.client
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());

    if (error) throw new Error(`Failed to fetch transactions: ${error.message}`);

    return (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      amount: row.amount,
      category: row.category,
      note: row.note,
      createdAt: new Date(row.created_at),
    }));
  }

  async findDistinctUserIds(): Promise<string[]> {
    const { data, error } = await this.client.from("transactions").select("user_id");

    if (error) throw new Error(`Failed to fetch user ids: ${error.message}`);

    const uniqueIds = new Set((data ?? []).map((row) => row.user_id as string));
    return Array.from(uniqueIds);
  }
}
