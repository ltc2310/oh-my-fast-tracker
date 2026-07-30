import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { UserRepository } from '../../domain/ports/UserRepository';
import { User } from '../../domain/entities/User';

@Injectable()
export class BlockUser {
  constructor(
    @Inject('UserRepository') private readonly userRepository: UserRepository,
  ) {}

  async execute(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const updatedUser = await this.userRepository.updateAccessStatus(userId, 'blocked');
    return updatedUser;
  }
}
