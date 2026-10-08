import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { StringValue } from 'ms';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { Role, User } from '../../generated/prisma/client';
import { JwtPayload } from '../types/jwt-payload.type';
import { randomToken, sha256 } from '../utils/hasn.util';


type RefreshPayload = JwtPayload & { jti: string };

@Injectable()
export class TokenService {
  private accessExpiresIn: StringValue;
  private refreshExpiresIn: StringValue;
  private refreshTtlSeconds: number;
  private accessSecret: string;
  private refreshSecret: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessExpiresIn = config.getOrThrow<StringValue>(
      'JWT_ACCESS_EXPIRES_IN',
    );
    this.refreshExpiresIn = config.getOrThrow<StringValue>(
      'JWT_REFRESH_EXPIRES_IN',
    );
    this.refreshTtlSeconds = parseDurationToSeconds(this.refreshExpiresIn);
  }

  private sessionKey(userId: string, deviceId: string) {
    return `auth:session:${userId}:${deviceId}`;
  }

  async issueTokens(params: {
    user: User & { roles: Role[] };
    deviceId: string;
  }) {
    const accessPayload: JwtPayload = {
      sub: params.user.id,
      phoneNumber: params.user.phoneNumber,
      roles: params.user.roles,
      deviceId: params.deviceId,
    };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn,
    });

    const jti = randomToken(16);
    const refreshPayload: RefreshPayload = { ...accessPayload, jti };
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn,
    });

    const tokenHash = sha256(refreshToken);
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    const created = await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: params.user.id,
        deviceId: params.deviceId,
        expiresAt,
      },
    });

    await this.redisService
      .getClient()
      .set(
        this.sessionKey(params.user.id, params.deviceId),
        created.id,
        'EX',
        this.refreshTtlSeconds,
      );

    return { accessToken, refreshToken, refreshTokenId: created.id };
  }

  async rotateRefreshToken(params: {
    refreshToken: string;
    deviceId: string;
    expectedFingerprint: string;
    presentedFingerprint: string;
  }) {
    if (params.expectedFingerprint !== params.presentedFingerprint) {
      throw new HttpException(
        { message: 'Device fingerprint mismatch' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    let decoded: RefreshPayload;
    try {
      const verified = (await this.jwt.verifyAsync(params.refreshToken, {
        secret: this.refreshSecret,
      })) as unknown;
      if (!isRefreshPayload(verified)) {
        throw new Error('invalid payload');
      }
      decoded = verified;
    } catch {
      throw new HttpException(
        { message: 'Invalid refresh token' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (decoded.deviceId !== params.deviceId) {
      throw new HttpException(
        { message: 'Invalid device' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const tokenHash = sha256(params.refreshToken);
    const tokenRow = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        userId: decoded.sub,
        deviceId: params.deviceId,
      },
    });

    if (!tokenRow) {
      throw new HttpException(
        { message: 'Invalid refresh token' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (tokenRow.revoked) {
      await this.revokeAllForUser(decoded.sub);
      throw new HttpException(
        { message: 'Refresh token reuse detected' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (tokenRow.expiresAt <= new Date()) {
      throw new HttpException(
        { message: 'Refresh token expired' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const existing = tokenRow;

    const user = await this.prisma.user.findUnique({
      where: { id: decoded.sub },
    });
    if (!user) {
      throw new HttpException(
        { message: 'User not found' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const device = await this.prisma.device.findFirst({
      where: { id: params.deviceId, userId: user.id },
    });
    if (!device) {
      throw new HttpException(
        { message: 'Device not found' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const newJti = randomToken(16);
    const newRefreshPayload: RefreshPayload = {
      sub: user.id,
      phoneNumber: user.phoneNumber,
      roles: user.roles,
      deviceId: params.deviceId,
      jti: newJti,
    };
    const newRefreshToken = await this.jwt.signAsync(newRefreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn,
    });

    const newHash = sha256(newRefreshToken);
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    const [, created] = await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revoked: true },
      }),
      this.prisma.refreshToken.create({
        data: {
          tokenHash: newHash,
          userId: user.id,
          deviceId: params.deviceId,
          expiresAt,
        },
      }),
    ] as const);

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        phoneNumber: user.phoneNumber,
        roles: user.roles,
        deviceId: params.deviceId,
      } satisfies JwtPayload,
      {
        secret: this.accessSecret,
        expiresIn: this.accessExpiresIn,
      },
    );

    await this.redisService
      .getClient()
      .set(
        this.sessionKey(user.id, params.deviceId),
        created.id,
        'EX',
        this.refreshTtlSeconds,
      );

    return { accessToken, refreshToken: newRefreshToken };
  }

  async revokeRefreshToken(refreshToken: string) {
    const tokenHash = sha256(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true },
    });
  }
}

function parseDurationToSeconds(duration?: string) {
  if (!duration) return 30 * 24 * 60 * 60;
  const m = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!m) return 30 * 24 * 60 * 60;
  const n = Number(m[1]);
  const unit = m[2];
  switch (unit) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 60 * 60;
    case 'd':
      return n * 24 * 60 * 60;
    default:
      return 30 * 24 * 60 * 60;
  }
}

function isRefreshPayload(value: unknown): value is RefreshPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sub === 'string' &&
    typeof v.phoneNumber === 'string' &&
    Array.isArray(v.roles) &&
    typeof v.deviceId === 'string' &&
    typeof v.jti === 'string'
  );
}
