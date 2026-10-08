import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis abstraction that gracefully no-ops when REDIS_URL is missing.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private memory = new Map<string, { value: string; expiresAt?: number }>();

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.log('REDIS_URL not set — using in-memory no-op store');
      return;
    }
    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      this.client.on('error', (err) => {
        this.logger.warn(`Redis error (falling back to memory): ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(`Redis init failed, using in-memory fallback: ${(err as Error).message}`);
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.client) {
      try {
        return await this.client.get(key);
      } catch {
        /* fall through */
      }
    }
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch {
        /* fall through */
      }
    }
    this.memory.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async incr(key: string): Promise<number> {
    if (this.client) {
      try {
        return await this.client.incr(key);
      } catch {
        /* fall through */
      }
    }
    const current = Number((await this.get(key)) ?? '0') + 1;
    const entry = this.memory.get(key);
    this.memory.set(key, { value: String(current), expiresAt: entry?.expiresAt });
    return current;
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.client) {
      try {
        const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
      } catch {
        /* fall through */
      }
    }
    if (await this.get(key)) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async ttl(key: string): Promise<number> {
    if (this.client) {
      try {
        return await this.client.ttl(key);
      } catch {
        /* fall through */
      }
    }
    const entry = this.memory.get(key);
    if (!entry?.expiresAt) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (this.client) {
      try {
        await this.client.expire(key, ttlSeconds);
        return;
      } catch {
        /* fall through */
      }
    }
    const entry = this.memory.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
      this.memory.set(key, entry);
    }
  }

  async del(key: string): Promise<void> {
    if (this.client) {
      try {
        await this.client.del(key);
        return;
      } catch {
        /* fall through */
      }
    }
    this.memory.delete(key);
  }
}
