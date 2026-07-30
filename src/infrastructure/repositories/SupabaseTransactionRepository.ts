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
      channel: transaction.channel ?? 'telegram',
      spent_at: (transaction.spentAt ?? new Date()).toISOString(),
    };

    const { data, error } = await this.client
      .from("transactions")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Failed to save transaction: ${error.message}`);

    return this.mapRow(data);
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

    return (data ?? []).map((row) => this.mapRow(row));
  }

  async findDistinctUserIds(): Promise<string[]> {
    const { data, error } = await this.client.from("transactions").select("user_id");

    if (error) throw new Error(`Failed to fetch user ids: ${error.message}`);

    const uniqueIds = new Set((data ?? []).map((row) => row.user_id as string));
    return Array.from(uniqueIds);
  }

  async findById(id: string): Promise<Transaction | null> {
    const { data, error } = await this.client
      .from("transactions")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Row not found
      throw new Error(`Failed to find transaction: ${error.message}`);
    }

    return this.mapRow(data);
  }

  async findLastByUser(userId: string): Promise<Transaction | null> {
    const { data, error } = await this.client
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // No rows
      throw new Error(`Failed to find last transaction: ${error.message}`);
    }

    return this.mapRow(data);
  }

  async update(
    id: string,
    fields: Partial<Pick<Transaction, 'amount' | 'category' | 'note' | 'spentAt'>>,
  ): Promise<Transaction> {
    const row: Record<string, unknown> = {};
    if (fields.amount !== undefined) row.amount = fields.amount;
    if (fields.category !== undefined) row.category = fields.category;
    if (fields.note !== undefined) row.note = fields.note;
    if (fields.spentAt !== undefined) row.spent_at = fields.spentAt.toISOString();

    const { data, error } = await this.client
      .from("transactions")
      .update(row)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update transaction: ${error.message}`);

    return this.mapRow(data);
  }

  async deleteById(id: string): Promise<boolean> {
    const { error, count } = await this.client
      .from("transactions")
      .delete({ count: "exact" })
      .eq("id", id);

    if (error) throw new Error(`Failed to delete transaction: ${error.message}`);

    return (count ?? 0) > 0;
  }

  private mapRow(row: Record<string, unknown>): Transaction {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      amount: row.amount as number,
      category: row.category as string,
      note: row.note as string,
      channel: row.channel as string,
      spentAt: new Date(row.spent_at as string),
      createdAt: new Date(row.created_at as string),
    };
  }
}
