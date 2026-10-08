import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { TokenService } from '../token/token.service';
import { DeviceFingerprint } from '../token/device-fingerprint';
import { OTP_DEFAULTS } from './otp.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  private isDev() {
    return this.config.get<string>('NODE_ENV', 'development') === 'development';
  }

  private otpPolicy() {
    return {
      ttl: Number(this.config.get('OTP_TTL_SECONDS', OTP_DEFAULTS.ttlSeconds)),
      cooldown: Number(this.config.get('OTP_RESEND_COOLDOWN_SECONDS', OTP_DEFAULTS.resendCooldownSeconds)),
      window: Number(this.config.get('OTP_RATE_LIMIT_WINDOW_SECONDS', OTP_DEFAULTS.rateLimitWindowSeconds)),
      maxSend: Number(this.config.get('OTP_RATE_LIMIT_MAX', OTP_DEFAULTS.rateLimitMax)),
      maxAttempts: Number(this.config.get('OTP_VERIFY_MAX_ATTEMPTS', OTP_DEFAULTS.verifyMaxAttempts)),
    };
  }

  private otpKeys(phone: string) {
    return {
      cooldown: `otp:cooldown:${phone}`,
      window: `otp:send_window:${phone}`,
      hash: `otp:hash:${phone}`,
      attempts: `otp:verify_attempts:${phone}`,
    };
  }

  private retryAfter(ttl: number, fallback: number) {
    if (ttl > 0) return ttl;
    return Math.max(fallback, 1);
  }

  async sendOtp(phone: string) {
    const { ttl, cooldown, window, maxSend, maxAttempts } = this.otpPolicy();
    const keys = this.otpKeys(phone);

    const sentSoFar = Number((await this.redis.get(keys.window)) ?? '0');
    if (sentSoFar >= maxSend) {
      const wait = this.retryAfter(await this.redis.ttl(keys.window), window);
      throw new HttpException(
        {
          error: 'OTP_RATE_LIMIT',
          message: `You have already requested ${maxSend} OTPs. Try again after ${wait} seconds.`,
          retryAfterSeconds: wait,
          sendsRemaining: 0,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const acquired = await this.redis.setNx(keys.cooldown, '1', cooldown);
    if (!acquired) {
      const wait = this.retryAfter(await this.redis.ttl(keys.cooldown), cooldown);
      throw new HttpException(
        {
          error: 'OTP_COOLDOWN',
          message: `Please wait ${wait} seconds before requesting another OTP.`,
          retryAfterSeconds: wait,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const sendCount = await this.redis.incr(keys.window);
    const windowTtlNow = await this.redis.ttl(keys.window);
    if (sendCount === 1 || windowTtlNow < 0) {
      await this.redis.expire(keys.window, window);
    }
    if (sendCount > maxSend) {
      const wait = this.retryAfter(await this.redis.ttl(keys.window), window);
      throw new HttpException(
        {
          error: 'OTP_RATE_LIMIT',
          message: `You have already requested ${maxSend} OTPs. Try again after ${wait} seconds.`,
          retryAfterSeconds: wait,
          sendsRemaining: 0,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(100000, 999999));
    if (this.config.get('NODE_ENV') !== 'production') {
      this.logger.debug(`OTP for ${phone}: ${code}`);
    }
    const codeHash = await bcrypt.hash(code, 10);
    await this.redis.set(keys.hash, codeHash, ttl);
    await this.redis.set(keys.attempts, '0', ttl);

    const windowTtl = this.retryAfter(await this.redis.ttl(keys.window), window);
    const sendsRemaining = Math.max(maxSend - sendCount, 0);

    return {
      phone,
      message: 'OTP sent',
      expiresInSeconds: ttl,
      resendAfterSeconds: cooldown,
      sendsUsed: sendCount,
      sendsRemaining,
      sendWindowSeconds: window,
      sendWindowRemainingSeconds: windowTtl,
      verifyAttemptsMax: maxAttempts,
    };
  }

  async verifyOtp(phone: string, code: string, fingerprint: DeviceFingerprint, name?: string) {
    const { maxAttempts } = this.otpPolicy();
    const keys = this.otpKeys(phone);

    const storedHash = await this.redis.get(keys.hash);
    const devBypass = this.isDev() && code === '123456';

    if (!storedHash && !devBypass) {
      throw new BadRequestException({
        error: 'OTP_EXPIRED',
        message: 'No valid OTP found or it has expired. Request a new OTP.',
        remainingAttempts: 0,
      });
    }

    const attempts = Number((await this.redis.get(keys.attempts)) ?? '0');
    if (attempts >= maxAttempts) {
      await this.redis.del(keys.hash);
      await this.redis.del(keys.attempts);
      throw new HttpException(
        {
          error: 'OTP_LOCKED',
          message: 'This OTP is no longer valid after 3 failed attempts. Request a new OTP.',
          remainingAttempts: 0,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ok = devBypass || (storedHash ? await bcrypt.compare(code, storedHash) : false);
    if (!ok) {
      const next = await this.redis.incr(keys.attempts);
      const hashTtl = await this.redis.ttl(keys.hash);
      if (hashTtl > 0) {
        await this.redis.expire(keys.attempts, hashTtl);
      }
      if (next >= maxAttempts) {
        await this.redis.del(keys.hash);
        await this.redis.del(keys.attempts);
        throw new HttpException(
          {
            error: 'OTP_LOCKED',
            message: 'This OTP expired after 3 failed attempts. Request a new OTP.',
            remainingAttempts: 0,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException({
        error: 'OTP_INVALID',
        message: `Invalid OTP. ${maxAttempts - next} attempt${maxAttempts - next === 1 ? '' : 's'} left.`,
        remainingAttempts: maxAttempts - next,
      });
    }

    await this.redis.del(keys.hash);
    await this.redis.del(keys.attempts);

    let user = await this.users.findByPhone(phone);
    if (!user) {
      user = await this.users.createFromPhone(phone, name);
    } else {
      if (name && !user.name) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { name },
        });
      }
      user = await this.users.syncRole(user);
    }

    const tokens = await this.tokens.issue(user.id, user.phone, fingerprint);
    return {
      user: this.users.toPublic(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresInSeconds,
    };
  }

  async refresh(refreshToken: string | undefined, fingerprint: DeviceFingerprint) {
    const refreshed = await this.tokens.refreshAccess(refreshToken, fingerprint);
    const user = await this.users.findById(refreshed.userId);
    if (!user) {
      throw new UnauthorizedException({ error: 'SESSION_EXPIRED', message: 'User not found' });
    }
    return {
      user: this.users.toPublic(user),
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresIn: refreshed.expiresInSeconds,
    };
  }

  async logout(userId: string | undefined, refreshToken?: string) {
    if (userId) {
      await this.tokens.revoke(userId, refreshToken);
    } else if (refreshToken) {
      await this.tokens.revoke('', refreshToken);
    }
    return { message: 'Logged out' };
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    console.log(user);
    if (!user) {
      throw new UnauthorizedException({ error: 'UNAUTHORIZED', message: 'User not found' });
    }
    return this.users.toPublic(user);
  }

  cookieOptions() {
    return this.tokens.refreshCookieOptions();
  }

  accessCookieOptions() {
    return this.tokens.accessCookieOptions();
  }

  refreshCookieOptions() {
    return this.tokens.refreshCookieOptions();
  }

  clearCookieOptions() {
    return this.tokens.clearCookieOptions();
  }

  attachAuthCookies(res: { cookie: (name: string, value: string, options: object) => void }, tokens: { accessToken: string; refreshToken: string }) {
    res.cookie('accessToken', tokens.accessToken, this.accessCookieOptions());
    res.cookie('refreshToken', tokens.refreshToken, this.refreshCookieOptions());
  }

  clearAuthCookies(res: { clearCookie: (name: string, options?: object) => void }) {
    const opts = this.clearCookieOptions();
    for (const name of ['accessToken', 'refreshToken', 'access_token', 'refresh_token']) {
      res.clearCookie(name, opts);
    }
  }
}
