import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { UserRepository } from '../../domain/ports/UserRepository';
import { NotificationSender } from '../../domain/ports/NotificationSender';
import { User } from '../../domain/entities/User';

const APPROVAL_MESSAGE =
  '🎉 Tài khoản của bạn đã được kích hoạt! Giờ bạn có thể bắt đầu ghi chi tiêu rồi đó.\nGõ thử: \'ăn trưa 50k\' để bắt đầu nhé!';

@Injectable()
export class ApproveUser {
  private readonly logger = new Logger(ApproveUser.name);

  constructor(
    @Inject('UserRepository') private readonly userRepository: UserRepository,
    @Inject('NotificationSender') private readonly notificationSender: NotificationSender,
  ) {}

  async execute(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }

    const updatedUser = await this.userRepository.updateAccessStatus(
      userId,
      'whitelisted',
      new Date(),
    );

    // Fire-and-forget notification — never throw from here
    try {
      await this.notificationSender.sendMessage(
        updatedUser.channelUserId,
        APPROVAL_MESSAGE,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to send approval notification to user ${userId}: ${message}`,
      );
    }

    return updatedUser;
  }
}
