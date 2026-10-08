import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../../prisma/client';

export interface AuthUser {
  userId: string;
  phone: string;
  role: Role;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthUser;
  },
);
