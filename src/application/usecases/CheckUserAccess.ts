import { Injectable, Inject } from '@nestjs/common';
import { UserRepository } from '../../domain/ports/UserRepository';
import { User } from '../../domain/entities/User';

export interface CheckUserAccessResult {
  allowed: boolean;
  isFirstMessage: boolean;
  user: User;
}

@Injectable()
export class CheckUserAccess {
  constructor(
    @Inject('UserRepository') private readonly userRepository: UserRepository,
  ) {}

  async execute(
    channel: string,
    channelUserId: string,
    channelUsername?: string | null,
  ): Promise<CheckUserAccessResult> {
    const existingUser = await this.userRepository.findByChannelAndUserId(
      channel,
      channelUserId,
    );

    if (!existingUser) {
      const newUser = await this.userRepository.create({
        channel,
        channelUserId,
        channelUsername: channelUsername ?? null,
        accessStatus: 'pending',
        plan: 'free',
      });

      return { allowed: false, isFirstMessage: true, user: newUser };
    }

    if (existingUser.accessStatus === 'whitelisted') {
      return { allowed: true, isFirstMessage: false, user: existingUser };
    }

    // pending or blocked
    return { allowed: false, isFirstMessage: false, user: existingUser };
  }
}
