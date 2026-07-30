import { NotFoundException } from '@nestjs/common';
import { BlockUser } from '../../src/application/usecases/BlockUser';
import { UserRepository } from '../../src/domain/ports/UserRepository';
import { User } from '../../src/domain/entities/User';

describe('BlockUser', () => {
  let useCase: BlockUser;
  let mockUserRepo: jest.Mocked<UserRepository>;

  const baseUser: User = {
    id: 'user-123',
    channel: 'telegram',
    channelUserId: '7046661244',
    channelUsername: 'testuser',
    accessStatus: 'whitelisted',
    plan: 'free',
    whitelistedAt: new Date('2025-01-01'),
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
    useCase = new BlockUser(mockUserRepo);
  });

  it('should block an existing user and return updated user', async () => {
    const blockedUser: User = { ...baseUser, accessStatus: 'blocked' };
    mockUserRepo.findById.mockResolvedValue(baseUser);
    mockUserRepo.updateAccessStatus.mockResolvedValue(blockedUser);

    const result = await useCase.execute('user-123');

    expect(mockUserRepo.findById).toHaveBeenCalledWith('user-123');
    expect(mockUserRepo.updateAccessStatus).toHaveBeenCalledWith('user-123', 'blocked');
    expect(result.accessStatus).toBe('blocked');
  });

  it('should throw NotFoundException when user does not exist', async () => {
    mockUserRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('nonexistent-id')).rejects.toThrow(NotFoundException);
    await expect(useCase.execute('nonexistent-id')).rejects.toThrow('User nonexistent-id not found');
    expect(mockUserRepo.updateAccessStatus).not.toHaveBeenCalled();
  });

  it('should handle blocking an already blocked user (idempotent)', async () => {
    const alreadyBlocked: User = { ...baseUser, accessStatus: 'blocked' };
    mockUserRepo.findById.mockResolvedValue(alreadyBlocked);
    mockUserRepo.updateAccessStatus.mockResolvedValue(alreadyBlocked);

    const result = await useCase.execute('user-123');

    expect(result.accessStatus).toBe('blocked');
    expect(mockUserRepo.updateAccessStatus).toHaveBeenCalledWith('user-123', 'blocked');
  });

  it('should not pass whitelistedAt parameter to updateAccessStatus', async () => {
    const blockedUser: User = { ...baseUser, accessStatus: 'blocked' };
    mockUserRepo.findById.mockResolvedValue(baseUser);
    mockUserRepo.updateAccessStatus.mockResolvedValue(blockedUser);

    await useCase.execute('user-123');

    // Verify only 2 arguments are passed (no whitelistedAt)
    expect(mockUserRepo.updateAccessStatus).toHaveBeenCalledWith('user-123', 'blocked');
    expect(mockUserRepo.updateAccessStatus.mock.calls[0]).toHaveLength(2);
  });
});
