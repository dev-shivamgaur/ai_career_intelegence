import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { v4 as uuid } from 'uuid';
import { Role } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceFingerprint } from './device-fingerprint';

export type TokenTyp = 'access' | 'refresh';

export interface TokenClaims {
  sub: string;
  phone: string;
  role: Role;
  typ: TokenTyp;
  fp: string;
  sig: string;
  jti: string;
  fam: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issue(userId: string, phone: string, fingerprint: DeviceFingerprint, familyId = uuid()) {
    const accessJti = uuid();
    const refreshJti = uuid();
    const accessExpires = this.config.get<string>('JWT_ACCESS_EXPIRES') ?? '15m';
    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES') ?? '7d';
    const accessSecret = this.accessSecret();
    const refreshSecret = this.refreshSecret();
    const role = await this.loadRole(userId);

    const accessToken = await this.jwt.signAsync(
      this.claims(userId, phone, role, 'access', fingerprint, accessJti, familyId, accessSecret),
      { secret: accessSecret, expiresIn: accessExpires },
    );
    const refreshToken = await this.jwt.signAsync(
      this.claims(userId, phone, role, 'refresh', fingerprint, refreshJti, familyId, refreshSecret),
      { secret: refreshSecret, expiresIn: refreshExpires },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        jti: refreshJti,
        familyId,
        fingerprintHash: fingerprint.hash,
        userAgent: fingerprint.userAgent || null,
        expiresAt: new Date(Date.now() + this.parseDurationMs(refreshExpires)),
      },
    });

    return {
      accessToken,
      refreshToken,
      accessExpires,
      expiresInSeconds: Math.floor(this.parseDurationMs(accessExpires) / 1000),
      familyId,
      userId,
    };
  }

  async rotate(refreshToken: string | undefined, fingerprint: DeviceFingerprint) {
    const stored = await this.assertRefresh(refreshToken, fingerprint);
    const claims = this.verifyJwt(refreshToken as string, this.refreshSecret(), 'refresh');
    const next = await this.issue(stored.userId, claims.phone, fingerprint, stored.familyId);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true, replacedByHash: this.hashToken(next.refreshToken) },
    });
    return next;
  }

  /** Issue a new access token from a still-valid refresh token. Does not rotate refresh. */
  async refreshAccess(refreshToken: string | undefined, fingerprint: DeviceFingerprint) {
    const stored = await this.assertRefresh(refreshToken, fingerprint);
    const claims = this.verifyJwt(refreshToken as string, this.refreshSecret(), 'refresh');
    const role = await this.loadRole(stored.userId);
    const accessExpires = this.config.get<string>('JWT_ACCESS_EXPIRES') ?? '15m';
    const accessSecret = this.accessSecret();
    const accessJti = uuid();
    const accessToken = await this.jwt.signAsync(
      this.claims(
        stored.userId,
        claims.phone,
        role,
        'access',
        fingerprint,
        accessJti,
        stored.familyId,
        accessSecret,
      ),
      { secret: accessSecret, expiresIn: accessExpires },
    );
    return {
      accessToken,
      refreshToken: refreshToken as string,
      accessExpires,
      expiresInSeconds: Math.floor(this.parseDurationMs(accessExpires) / 1000),
      familyId: stored.familyId,
      userId: stored.userId,
    };
  }

  async verifyAccess(accessToken: string, fingerprint: DeviceFingerprint): Promise<TokenClaims> {
    const claims = this.verifyJwt(accessToken, this.accessSecret(), 'access');
    this.assertSignature(claims, fingerprint, this.accessSecret());
    if (!fingerprint.matches(claims.fp)) {
      throw new UnauthorizedException({ error: 'FINGERPRINT_MISMATCH', message: 'Device signature does not match' });
    }
    return claims;
  }

  async revoke(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
      if (stored) {
        await this.revokeFamily(stored.familyId);
        return;
      }
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  cookieOptions() {
    return this.refreshCookieOptions();
  }

  accessCookieOptions() {
    return this.baseCookieOptions(this.parseDurationMs(this.config.get('JWT_ACCESS_EXPIRES') ?? '15m'));
  }

  refreshCookieOptions() {
    return this.baseCookieOptions(this.parseDurationMs(this.config.get('JWT_REFRESH_EXPIRES') ?? '7d'));
  }

  clearCookieOptions() {
    return {
      path: '/',
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', 'false') === 'true',
      sameSite: 'lax' as const,
    };
  }

  private baseCookieOptions(maxAge: number) {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', 'false') === 'true',
      sameSite: 'lax' as const,
      maxAge,
      path: '/',
    };
  }

  private claims(
    userId: string,
    phone: string,
    role: Role,
    typ: TokenTyp,
    fingerprint: DeviceFingerprint,
    jti: string,
    familyId: string,
    secret: string,
  ): TokenClaims {
    return {
      sub: userId,
      phone,
      role,
      typ,
      fp: fingerprint.hash,
      sig: fingerprint.signature(secret, typ, jti, familyId),
      jti,
      fam: familyId,
    };
  }

  /** Role is read from the user row only when a token is minted, not on every request. */
  private async loadRole(userId: string): Promise<Role> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return user?.role ?? Role.USER;
  }

  private verifyJwt(token: string, secret: string, typ: TokenTyp): TokenClaims {
    let payload: TokenClaims;
    try {
      payload = this.jwt.verify(token, { secret }) as TokenClaims;
    } catch {
      throw new UnauthorizedException({ error: 'UNAUTHORIZED', message: `Invalid ${typ} token` });
    }
    if (payload.typ !== typ) {
      throw new UnauthorizedException({ error: 'UNAUTHORIZED', message: 'Invalid token type' });
    }
    return payload;
  }

  private assertSignature(claims: TokenClaims, fingerprint: DeviceFingerprint, secret: string) {
    const expected = fingerprint.signature(secret, claims.typ, claims.jti, claims.fam);
    if (claims.sig !== expected || claims.fp !== fingerprint.hash) {
      throw new UnauthorizedException({ error: 'SIGNATURE_INVALID', message: 'Token signature does not match this device' });
    }
  }

  private async revokeFamily(familyId: string, reason?: 'reuse') {
    await this.prisma.refreshToken.updateMany({
      where: { familyId },
      data: {
        revoked: true,
        reusedAt: reason === 'reuse' ? new Date() : undefined,
      },
    });
  }

  private async assertRefresh(refreshToken: string | undefined, fingerprint: DeviceFingerprint) {
    if (!refreshToken) {
      throw new UnauthorizedException({ error: 'SESSION_EXPIRED', message: 'Missing refresh token' });
    }

    const claims = this.verifyJwt(refreshToken, this.refreshSecret(), 'refresh');
    this.assertSignature(claims, fingerprint, this.refreshSecret());

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) {
      const byJti = await this.prisma.refreshToken.findUnique({ where: { jti: claims.jti } });
      if (byJti) {
        await this.revokeFamily(byJti.familyId, 'reuse');
      }
      throw new UnauthorizedException({ error: 'SESSION_EXPIRED', message: 'Refresh token reuse detected' });
    }

    if (stored.revoked) {
      await this.revokeFamily(stored.familyId, 'reuse');
      throw new UnauthorizedException({ error: 'SESSION_EXPIRED', message: 'Refresh token reuse detected' });
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException({ error: 'SESSION_EXPIRED', message: 'Refresh token expired' });
    }

    if (!fingerprint.matches(stored.fingerprintHash) || stored.fingerprintHash !== claims.fp) {
      throw new UnauthorizedException({ error: 'FINGERPRINT_MISMATCH', message: 'Device signature does not match' });
    }

    return stored;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private accessSecret() {
    return this.config.get<string>('JWT_ACCESS_SECRET', 'change-me-access-secret-min-32-chars');
  }

  private refreshSecret() {
    return this.config.get<string>('JWT_REFRESH_SECRET', 'change-me-refresh-secret-min-32-chars');
  }

  private parseDurationMs(value: string): number {
    const m = /^(\d+)([smhd])$/.exec(value);
    if (!m) return 7 * 24 * 60 * 60 * 1000;
    const n = Number(m[1]);
    const unit = m[2];
    const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return n * mult;
  }
}
