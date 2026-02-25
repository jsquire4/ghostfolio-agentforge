import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const adminIds = (process.env.ADMIN_USER_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const userId = context.switchToHttp().getRequest()?.user?.userId;

    if (!userId || !adminIds.includes(userId)) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
