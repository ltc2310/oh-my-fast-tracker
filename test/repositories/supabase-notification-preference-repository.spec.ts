import { SupabaseNotificationPreferenceRepository } from '../../src/infrastructure/repositories/SupabaseNotificationPreferenceRepository';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockClient),
}));

const mockMaybeSingle = jest.fn();
const mockSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq, single: mockSingle }));
const mockUpsert = jest.fn(() => ({ select: mockSelect }));
const mockFrom = jest.fn(() => ({
  select: mockSelect,
  upsert: mockUpsert,
}));
const mockRpc = jest.fn();

const mockClient = {
  from: mockFrom,
  rpc: mockRpc,
};

describe('SupabaseNotificationPreferenceRepository', () => {
  let repo: SupabaseNotificationPreferenceRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new SupabaseNotificationPreferenceRepository({
      url: 'http://localhost:54321',
      key: 'test-key',
    } as any);
  });

  describe('findByUserId', () => {
    it('returns entity when data found', async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          id: 'pref-1',
          user_id: 'user-1',
          daily_reminder: true,
          weekly_digest: false,
          monthly_summary: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
        error: null,
      });

      const result = await repo.findByUserId('user-1');

      expect(mockFrom).toHaveBeenCalledWith('notification_preferences');
      expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(result).toEqual({
        id: 'pref-1',
        userId: 'user-1',
        dailyReminder: true,
        weeklyDigest: false,
        monthlySummary: true,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z'),
      });
    });

    it('returns null when no data found', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await repo.findByUserId('user-2');

      expect(result).toBeNull();
    });

    it('throws on error', async () => {
      mockMaybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'connection failed' },
      });

      await expect(repo.findByUserId('user-1')).rejects.toThrow(
        'Failed to find preference: connection failed',
      );
    });
  });

  describe('upsert', () => {
    it('maps camelCase fields to snake_case columns and returns entity', async () => {
      mockSingle.mockResolvedValue({
        data: {
          id: 'pref-1',
          user_id: 'user-1',
          daily_reminder: false,
          weekly_digest: true,
          monthly_summary: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-03T00:00:00Z',
        },
        error: null,
      });

      const result = await repo.upsert('user-1', {
        dailyReminder: false,
        weeklyDigest: true,
        monthlySummary: true,
      });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          daily_reminder: false,
          weekly_digest: true,
          monthly_summary: true,
          updated_at: expect.any(String),
        }),
        { onConflict: 'user_id' },
      );
      expect(result).toEqual({
        id: 'pref-1',
        userId: 'user-1',
        dailyReminder: false,
        weeklyDigest: true,
        monthlySummary: true,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-03T00:00:00Z'),
      });
    });

    it('only includes defined fields in upsert row', async () => {
      mockSingle.mockResolvedValue({
        data: {
          id: 'pref-1',
          user_id: 'user-1',
          daily_reminder: true,
          weekly_digest: true,
          monthly_summary: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-03T00:00:00Z',
        },
        error: null,
      });

      await repo.upsert('user-1', { dailyReminder: true });

      const upsertArg = (mockUpsert.mock.calls as any[][])[0][0];
      expect(upsertArg).toHaveProperty('daily_reminder', true);
      expect(upsertArg).not.toHaveProperty('weekly_digest');
      expect(upsertArg).not.toHaveProperty('monthly_summary');
    });

    it('throws on error', async () => {
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'upsert failed' },
      });

      await expect(
        repo.upsert('user-1', { dailyReminder: true }),
      ).rejects.toThrow('Failed to upsert preference: upsert failed');
    });
  });

  describe('findEligibleUserIds', () => {
    it('maps dailyReminder to daily_reminder column and returns user IDs', async () => {
      mockRpc.mockResolvedValue({
        data: [{ id: 'user-1' }, { id: 'user-2' }],
        error: null,
      });

      const result = await repo.findEligibleUserIds('dailyReminder');

      expect(mockRpc).toHaveBeenCalledWith('get_eligible_notification_users', {
        notification_column: 'daily_reminder',
      });
      expect(result).toEqual(['user-1', 'user-2']);
    });

    it('maps weeklyDigest to weekly_digest column', async () => {
      mockRpc.mockResolvedValue({ data: [{ id: 'user-3' }], error: null });

      const result = await repo.findEligibleUserIds('weeklyDigest');

      expect(mockRpc).toHaveBeenCalledWith('get_eligible_notification_users', {
        notification_column: 'weekly_digest',
      });
      expect(result).toEqual(['user-3']);
    });

    it('maps monthlySummary to monthly_summary column', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      const result = await repo.findEligibleUserIds('monthlySummary');

      expect(mockRpc).toHaveBeenCalledWith('get_eligible_notification_users', {
        notification_column: 'monthly_summary',
      });
      expect(result).toEqual([]);
    });

    it('returns empty array when data is null', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      const result = await repo.findEligibleUserIds('dailyReminder');

      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'rpc failed' },
      });

      await expect(
        repo.findEligibleUserIds('dailyReminder'),
      ).rejects.toThrow('Failed to find eligible users: rpc failed');
    });
  });

  describe('createDefault', () => {
    it('calls upsert with all preferences set to true', async () => {
      mockSingle.mockResolvedValue({
        data: {
          id: 'pref-new',
          user_id: 'user-new',
          daily_reminder: true,
          weekly_digest: true,
          monthly_summary: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const result = await repo.createDefault('user-new');

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-new',
          daily_reminder: true,
          weekly_digest: true,
          monthly_summary: true,
        }),
        { onConflict: 'user_id' },
      );
      expect(result).toEqual({
        id: 'pref-new',
        userId: 'user-new',
        dailyReminder: true,
        weeklyDigest: true,
        monthlySummary: true,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      });
    });
  });
});
