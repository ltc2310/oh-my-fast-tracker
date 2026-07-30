import { User, AccessStatus } from '../entities/User';

export interface UserRepository {
  findByChannelAndUserId(
    channel: string,
    channelUserId: string,
  ): Promise<User | null>;
  create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  updateAccessStatus(
    id: string,
    status: AccessStatus,
    whitelistedAt?: Date,
  ): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByStatus(status: AccessStatus): Promise<User[]>;
}
