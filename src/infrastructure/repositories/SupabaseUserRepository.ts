import { Injectable, Inject } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigType } from '@nestjs/config';
import { User, AccessStatus } from '../../domain/entities/User';
import { UserRepository } from '../../domain/ports/UserRepository';
import { supabaseConfig } from '../config/app.config';

@Injectable()
export class SupabaseUserRepository implements UserRepository {
  private readonly client: SupabaseClient;

  constructor(
    @Inject(supabaseConfig.KEY)
    private readonly config: ConfigType<typeof supabaseConfig>,
  ) {
    this.client = createClient(config.url, config.key);
  }

  async findByChannelAndUserId(
    channel: string,
    channelUserId: string,
  ): Promise<User | null> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('channel', channel)
      .eq('channel_user_id', channelUserId)
      .maybeSingle();

    if (error) throw new Error(`Failed to find user: ${error.message}`);
    if (!data) return null;

    return this.toEntity(data);
  }

  async create(
    user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<User> {
    const row: Record<string, unknown> = {
      channel: user.channel,
      channel_user_id: user.channelUserId,
      channel_username: user.channelUsername ?? null,
      access_status: user.accessStatus,
      plan: user.plan,
      whitelisted_at: user.whitelistedAt
        ? user.whitelistedAt.toISOString()
        : null,
      plan_updated_at: user.planUpdatedAt
        ? user.planUpdatedAt.toISOString()
        : null,
    };

    const { data, error } = await this.client
      .from('users')
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Failed to create user: ${error.message}`);

    return this.toEntity(data);
  }

  async updateAccessStatus(
    id: string,
    status: AccessStatus,
    whitelistedAt?: Date,
  ): Promise<User> {
    const updates: Record<string, unknown> = {
      access_status: status,
      updated_at: new Date().toISOString(),
    };

    if (whitelistedAt) {
      updates.whitelisted_at = whitelistedAt.toISOString();
    }

    const { data, error } = await this.client
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error)
      throw new Error(`Failed to update access status: ${error.message}`);

    return this.toEntity(data);
  }

  async findById(id: string): Promise<User | null> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to find user by id: ${error.message}`);
    if (!data) return null;

    return this.toEntity(data);
  }

  async findByStatus(status: AccessStatus): Promise<User[]> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('access_status', status)
      .order('created_at', { ascending: true });

    if (error)
      throw new Error(`Failed to find users by status: ${error.message}`);

    return (data ?? []).map((row) => this.toEntity(row));
  }

  private toEntity(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      channel: row.channel as string,
      channelUserId: row.channel_user_id as string,
      channelUsername: (row.channel_username as string) ?? null,
      accessStatus: row.access_status as AccessStatus,
      plan: row.plan as User['plan'],
      whitelistedAt: row.whitelisted_at
        ? new Date(row.whitelisted_at as string)
        : null,
      planUpdatedAt: row.plan_updated_at
        ? new Date(row.plan_updated_at as string)
        : null,
      createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
    };
  }
}
