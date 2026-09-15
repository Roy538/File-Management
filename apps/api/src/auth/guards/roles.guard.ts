import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../strategies/jwt.strategy';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = ctx.switchToHttp().getRequest<any>();
    const user: JwtPayload | undefined = req.user;

    if (!user) throw new ForbiddenException('Insufficient permissions');
    // SUPER_ADMIN bypasses every role restriction
    if (user.role === Role.SUPER_ADMIN) return true;
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
