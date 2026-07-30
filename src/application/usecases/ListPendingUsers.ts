import { Injectable, Inject } from '@nestjs/common';
import { UserRepository } from '../../domain/ports/UserRepository';
import { AccessStatus, User } from '../../domain/entities/User';

@Injectable()
export class ListPendingUsers {
  constructor(
    @Inject('UserRepository') private readonly userRepository: UserRepository,
  ) {}

  async execute(status?: AccessStatus): Promise<User[]> {
    const effectiveStatus: AccessStatus = status ?? 'pending';
    return this.userRepository.findByStatus(effectiveStatus);
  }
}
