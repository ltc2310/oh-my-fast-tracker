import { Injectable, Inject } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigType } from '@nestjs/config';
import { NotificationPreference } from '../../domain/entities/NotificationPreference';
import { NotificationPreferenceRepository } from '../../domain/ports/NotificationPreferenceRepository';
import { supabaseConfig } from '../config/app.config';

@Injectable()
export class SupabaseNotificationPreferenceRepository
  implements NotificationPreferenceRepository
{
  private readonly client: SupabaseClient;

  constructor(
    @Inject(supabaseConfig.KEY)
    private readonly config: ConfigType<typeof supabaseConfig>,
  ) {
    this.client = createClient(config.url, config.key);
  }

  async findByUserId(userId: string): Promise<NotificationPreference | null> {
    const { data, error } = await this.client
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error)
      throw new Error(`Failed to find preference: ${error.message}`);
    return data ? this.toEntity(data) : null;
  }

  async upsert(
    userId: string,
    fields: Partial<
      Pick<
        NotificationPreference,
        'dailyReminder' | 'weeklyDigest' | 'monthlySummary'
      >
    >,
  ): Promise<NotificationPreference> {
    const row: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };
    if (fields.dailyReminder !== undefined)
      row.daily_reminder = fields.dailyReminder;
    if (fields.weeklyDigest !== undefined)
      row.weekly_digest = fields.weeklyDigest;
    if (fields.monthlySummary !== undefined)
      row.monthly_summary = fields.monthlySummary;

    const { data, error } = await this.client
      .from('notification_preferences')
      .upsert(row, { onConflict: 'user_id' })
      .select()
      .single();

    if (error)
      throw new Error(`Failed to upsert preference: ${error.message}`);
    return this.toEntity(data);
  }

  async findEligibleUserIds(
    notificationType: 'dailyReminder' | 'weeklyDigest' | 'monthlySummary',
  ): Promise<string[]> {
    const columnMap: Record<string, string> = {
      dailyReminder: 'daily_reminder',
      weeklyDigest: 'weekly_digest',
      monthlySummary: 'monthly_summary',
    };
    const column = columnMap[notificationType];

    const { data, error } = await this.client.rpc(
      'get_eligible_notification_users',
      { notification_column: column },
    );

    if (error)
      throw new Error(`Failed to find eligible users: ${error.message}`);
    return (data ?? []).map((row: { id: string }) => row.id);
  }

  async createDefault(userId: string): Promise<NotificationPreference> {
    return this.upsert(userId, {
      dailyReminder: true,
      weeklyDigest: true,
      monthlySummary: true,
    });
  }

  private toEntity(row: Record<string, unknown>): NotificationPreference {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      dailyReminder: row.daily_reminder as boolean,
      weeklyDigest: row.weekly_digest as boolean,
      monthlySummary: row.monthly_summary as boolean,
      createdAt: row.created_at
        ? new Date(row.created_at as string)
        : undefined,
      updatedAt: row.updated_at
        ? new Date(row.updated_at as string)
        : undefined,
    };
  }
}
