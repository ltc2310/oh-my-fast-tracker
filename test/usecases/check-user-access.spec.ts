import { CheckUserAccess } from '../../src/application/usecases/CheckUserAccess';
import { UserRepository } from '../../src/domain/ports/UserRepository';
import { User } from '../../src/domain/entities/User';

describe('CheckUserAccess', () => {
  let useCase: CheckUserAccess;
  let mockUserRepository: jest.Mocked<UserRepository>;

  const makeUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-123',
    channel: 'telegram',
    channelUserId: '12345',
    channelUsername: 'testuser',
    accessStatus: 'pending',
    plan: 'free',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    mockUserRepository = {
      findByChannelAndUserId: jest.fn(),
      create: jest.fn(),
      updateAccessStatus: jest.fn(),
      findById: jest.fn(),
      findByStatus: jest.fn(),
    };

    useCase = new CheckUserAccess(mockUserRepository);
  });

  it('creates a pending user and returns isFirstMessage=true when user not found', async () => {
    const newUser = makeUser({ accessStatus: 'pending' });
    mockUserRepository.findByChannelAndUserId.mockResolvedValue(null);
    mockUserRepository.create.mockResolvedValue(newUser);

    const result = await useCase.execute('telegram', '12345', 'testuser');

    expect(result).toEqual({
      allowed: false,
      isFirstMessage: true,
      user: newUser,
    });
    expect(mockUserRepository.create).toHaveBeenCalledWith({
      channel: 'telegram',
      channelUserId: '12345',
      channelUsername: 'testuser',
      accessStatus: 'pending',
      plan: 'free',
    });
  });

  it('returns allowed=true for whitelisted users', async () => {
    const whitelistedUser = makeUser({ accessStatus: 'whitelisted' });
    mockUserRepository.findByChannelAndUserId.mockResolvedValue(whitelistedUser);

    const result = await useCase.execute('telegram', '12345');

    expect(result).toEqual({
      allowed: true,
      isFirstMessage: false,
      user: whitelistedUser,
    });
    expect(mockUserRepository.create).not.toHaveBeenCalled();
  });

  it('returns allowed=false for pending users', async () => {
    const pendingUser = makeUser({ accessStatus: 'pending' });
    mockUserRepository.findByChannelAndUserId.mockResolvedValue(pendingUser);

    const result = await useCase.execute('telegram', '12345');

    expect(result).toEqual({
      allowed: false,
      isFirstMessage: false,
      user: pendingUser,
    });
  });

  it('returns allowed=false for blocked users', async () => {
    const blockedUser = makeUser({ accessStatus: 'blocked' });
    mockUserRepository.findByChannelAndUserId.mockResolvedValue(blockedUser);

    const result = await useCase.execute('telegram', '12345');

    expect(result).toEqual({
      allowed: false,
      isFirstMessage: false,
      user: blockedUser,
    });
  });

  it('passes null for channelUsername when not provided', async () => {
    const newUser = makeUser({ channelUsername: null });
    mockUserRepository.findByChannelAndUserId.mockResolvedValue(null);
    mockUserRepository.create.mockResolvedValue(newUser);

    await useCase.execute('telegram', '12345');

    expect(mockUserRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ channelUsername: null }),
    );
  });
});
