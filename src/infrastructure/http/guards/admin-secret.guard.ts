import * as crypto from 'crypto';
import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { adminConfig } from '../../config/app.config';

@Injectable()
export class AdminSecretGuard implements CanActivate {
  constructor(
    @Inject(adminConfig.KEY)
    private readonly config: ConfigType<typeof adminConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-admin-secret'] ?? '';
    const expected = this.config.secret;

    if (!provided || !expected) throw new UnauthorizedException();

    const providedBuf = Buffer.from(provided, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');

    if (providedBuf.length !== expectedBuf.length) throw new UnauthorizedException();

    if (!crypto.timingSafeEqual(providedBuf, expectedBuf))
      throw new UnauthorizedException();

    return true;
  }
}
