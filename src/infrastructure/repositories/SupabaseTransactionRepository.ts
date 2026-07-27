import { Injectable, Inject } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Transaction } from "../../domain/entities/Transaction";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";
import { ConfigType } from "@nestjs/config";
import { supabaseConfig } from "../config/app.config";

@Injectable()
export class SupabaseTransactionRepository implements TransactionRepository {
  private readonly client: SupabaseClient;

  constructor(
    @Inject(supabaseConfig.KEY) private readonly config: ConfigType<typeof supabaseConfig>
  ) {
    this.client = createClient(config.url, config.key);
  }

  async save(transaction: Transaction): Promise<Transaction> {
    const row: Record<string, unknown> = {
      user_id: transaction.userId,
      amount: transaction.amount,
      category: transaction.category,
      note: transaction.note,
      spent_at: (transaction.spentAt ?? new Date()).toISOString(),
    };

    const { data, error } = await this.client
      .from("transactions")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Failed to save transaction: ${error.message}`);

    return {
      id: data.id,
      userId: data.user_id,
      amount: data.amount,
      category: data.category,
      note: data.note,
      spentAt: new Date(data.spent_at),
      createdAt: new Date(data.created_at),
    };
  }

  async findByUserAndDateRange(
    userId: string,
    from: Date,
    to: Date
  ): Promise<Transaction[]> {
    // Query by spent_at (actual spending date), not created_at
    const { data, error } = await this.client
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .gte("spent_at", from.toISOString())
      .lte("spent_at", to.toISOString())
      .order("spent_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch transactions: ${error.message}`);

    return (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      amount: row.amount,
      category: row.category,
      note: row.note,
      spentAt: new Date(row.spent_at),
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
