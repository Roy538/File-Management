import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma.service';

interface RequestLike {
  method: string;
  url: string;
  ip: string;
  user?: { sub: string };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = context.switchToHttp().getRequest<RequestLike>();
    const { method, url } = req;

    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const parts = url.split('/');
    const resource = parts[2] ?? url;
    const resourceId = parts[3] ?? null;

    return next.handle().pipe(
      tap({
        next: () => {
          this.prisma.auditLog
            .create({
              data: {
                userId: req.user?.sub ?? null,
                action: method,
                resource,
                resourceId,
                ipAddress: req.ip,
              },
            })
            .catch(() => undefined);
        },
      }),
    );
  }
}
