import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../strategies/jwt.strategy';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = ctx.switchToHttp().getRequest<any>();
    return req.user as JwtPayload;
  },
);
