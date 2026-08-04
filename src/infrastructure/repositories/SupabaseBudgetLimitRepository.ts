import { Injectable, Inject } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ConfigType } from "@nestjs/config";
import { BudgetLimit } from "../../domain/entities/BudgetLimit";
import { BudgetLimitRepository } from "../../domain/ports/BudgetLimitRepository";
import { supabaseConfig } from "../config/app.config";

@Injectable()
export class SupabaseBudgetLimitRepository implements BudgetLimitRepository {
  private readonly client: SupabaseClient;

  constructor(
    @Inject(supabaseConfig.KEY)
    private readonly config: ConfigType<typeof supabaseConfig>,
  ) {
    this.client = createClient(config.url, config.key);
  }

  async findByUser(userId: string): Promise<BudgetLimit[]> {
    const { data, error } = await this.client
      .from("budget_limits")
      .select("*")
      .eq("user_id", userId)
      .order("category", { ascending: true });

    if (error) throw new Error(`Failed to find budget limits: ${error.message}`);
    return (data ?? []).map((row) => this.toEntity(row));
  }

  async findByUserAndCategory(userId: string, category: string): Promise<BudgetLimit | null> {
    const { data, error } = await this.client
      .from("budget_limits")
      .select("*")
      .eq("user_id", userId)
      .eq("category", category)
      .maybeSingle();

    if (error) throw new Error(`Failed to find budget limit: ${error.message}`);
    return data ? this.toEntity(data) : null;
  }

  async upsert(userId: string, category: string, monthlyLimit: number): Promise<BudgetLimit> {
    const row = {
      user_id: userId,
      category,
      monthly_limit: monthlyLimit,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.client
      .from("budget_limits")
      .upsert(row, { onConflict: "user_id,category" })
      .select()
      .single();

    if (error) throw new Error(`Failed to upsert budget limit: ${error.message}`);
    return this.toEntity(data);
  }

  async delete(userId: string, category: string): Promise<boolean> {
    const { error, count } = await this.client
      .from("budget_limits")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("category", category);

    if (error) throw new Error(`Failed to delete budget limit: ${error.message}`);
    return (count ?? 0) > 0;
  }

  private toEntity(row: Record<string, unknown>): BudgetLimit {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      category: row.category as string,
      monthlyLimit: Number(row.monthly_limit),
      createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
    };
  }
}
