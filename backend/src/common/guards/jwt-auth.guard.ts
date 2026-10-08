import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { Role } from '../../prisma/client';
import { TokenService } from '../../token/token.service';
import { DeviceFingerprint } from '../../token/device-fingerprint';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException({ error: 'UNAUTHORIZED', message: 'Missing access token' });
    }
    const payload = await this.tokens.verifyAccess(token, DeviceFingerprint.fromRequest(request));
    (request as Request & { user: AuthUser }).user = {
      userId: payload.sub,
      phone: payload.phone,
      role: payload.role === Role.ADMIN ? Role.ADMIN : Role.USER,
    };
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice(7);
    }
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.accessToken || cookies?.access_token || null;
  }
}
