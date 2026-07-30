import { NotFoundException } from '@nestjs/common';
import { ApproveUser } from '../../src/application/usecases/ApproveUser';
import { UserRepository } from '../../src/domain/ports/UserRepository';
import { NotificationSender } from '../../src/domain/ports/NotificationSender';
import { User } from '../../src/domain/entities/User';

describe('ApproveUser', () => {
  let useCase: ApproveUser;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockNotificationSender: jest.Mocked<NotificationSender>;

  const baseUser: User = {
    id: 'user-123',
    channel: 'telegram',
    channelUserId: '7046661244',
    channelUsername: 'testuser',
    accessStatus: 'pending',
    plan: 'free',
    whitelistedAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(() => {
    mockUserRepo = {
      findByChannelAndUserId: jest.fn(),
      create: jest.fn(),
      updateAccessStatus: jest.fn(),
      findById: jest.fn(),
      findByStatus: jest.fn(),
    };
    mockNotificationSender = {
      sendMessage: jest.fn(),
    };
    useCase = new ApproveUser(mockUserRepo, mockNotificationSender);
  });

  it('should approve a pending user and return the updated user', async () => {
    const approvedUser: User = {
      ...baseUser,
      accessStatus: 'whitelisted',
      whitelistedAt: new Date(),
    };
    mockUserRepo.findById.mockResolvedValue(baseUser);
    mockUserRepo.updateAccessStatus.mockResolvedValue(approvedUser);
    mockNotificationSender.sendMessage.mockResolvedValue(undefined);

    const result = await useCase.execute('user-123');

    expect(mockUserRepo.findById).toHaveBeenCalledWith('user-123');
    expect(mockUserRepo.updateAccessStatus).toHaveBeenCalledWith(
      'user-123',
      'whitelisted',
      expect.any(Date),
    );
    expect(result.accessStatus).toBe('whitelisted');
    expect(result.whitelistedAt).toBeDefined();
  });

  it('should throw NotFoundException when user does not exist', async () => {
    mockUserRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('nonexistent-id')).rejects.toThrow(NotFoundException);
    expect(mockUserRepo.updateAccessStatus).not.toHaveBeenCalled();
    expect(mockNotificationSender.sendMessage).not.toHaveBeenCalled();
  });

  it('should send approval notification to the user', async () => {
    const approvedUser: User = {
      ...baseUser,
      accessStatus: 'whitelisted',
      whitelistedAt: new Date(),
    };
    mockUserRepo.findById.mockResolvedValue(baseUser);
    mockUserRepo.updateAccessStatus.mockResolvedValue(approvedUser);
    mockNotificationSender.sendMessage.mockResolvedValue(undefined);

    await useCase.execute('user-123');

    expect(mockNotificationSender.sendMessage).toHaveBeenCalledWith(
      '7046661244',
      expect.stringContaining('Tài khoản của bạn đã được kích hoạt'),
    );
  });

  it('should not throw when notification fails (fire-and-forget)', async () => {
    const approvedUser: User = {
      ...baseUser,
      accessStatus: 'whitelisted',
      whitelistedAt: new Date(),
    };
    mockUserRepo.findById.mockResolvedValue(baseUser);
    mockUserRepo.updateAccessStatus.mockResolvedValue(approvedUser);
    mockNotificationSender.sendMessage.mockRejectedValue(new Error('Telegram API timeout'));

    const result = await useCase.execute('user-123');

    // Should still return the approved user despite notification failure
    expect(result.accessStatus).toBe('whitelisted');
  });

  it('should handle approving an already whitelisted user (idempotent)', async () => {
    const alreadyApproved: User = {
      ...baseUser,
      accessStatus: 'whitelisted',
      whitelistedAt: new Date('2025-01-01'),
    };
    mockUserRepo.findById.mockResolvedValue(alreadyApproved);
    mockUserRepo.updateAccessStatus.mockResolvedValue({
      ...alreadyApproved,
      whitelistedAt: new Date(),
    });
    mockNotificationSender.sendMessage.mockResolvedValue(undefined);

    const result = await useCase.execute('user-123');

    expect(result.accessStatus).toBe('whitelisted');
    expect(mockUserRepo.updateAccessStatus).toHaveBeenCalledWith(
      'user-123',
      'whitelisted',
      expect.any(Date),
    );
  });
});
