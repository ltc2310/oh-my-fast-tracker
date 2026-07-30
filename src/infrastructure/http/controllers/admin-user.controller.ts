import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AdminSecretGuard } from '../guards/admin-secret.guard';
import { ListPendingUsers } from '../../../application/usecases/ListPendingUsers';
import { ApproveUser } from '../../../application/usecases/ApproveUser';
import { BlockUser } from '../../../application/usecases/BlockUser';
import { AccessStatus } from '../../../domain/entities/User';

const VALID_STATUSES: AccessStatus[] = ['pending', 'whitelisted', 'blocked'];

@Controller('internal/admin/users')
@UseGuards(AdminSecretGuard)
export class AdminUserController {
  constructor(
    private readonly listPendingUsers: ListPendingUsers,
    private readonly approveUser: ApproveUser,
    private readonly blockUser: BlockUser,
  ) {}

  @Get()
  async list(@Query('status') status?: string) {
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status as AccessStatus)) {
        throw new BadRequestException(
          `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
        );
      }
    }

    const users = await this.listPendingUsers.execute(
      status as AccessStatus | undefined,
    );

    return { users };
  }

  @Post(':userId/approve')
  async approve(@Param('userId') userId: string) {
    const user = await this.approveUser.execute(userId);
    return {
      id: user.id,
      accessStatus: user.accessStatus,
      whitelistedAt: user.whitelistedAt,
    };
  }

  @Post(':userId/block')
  async block(@Param('userId') userId: string) {
    const user = await this.blockUser.execute(userId);
    return {
      id: user.id,
      accessStatus: user.accessStatus,
    };
  }
}
