import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { INTEL_DEFAULTS, isIntelConfigKey, type IntelConfigKey, type IntelConfigShape } from './intel-config.defaults';

const CACHE_TTL_SECONDS = 60;
const cacheKey = (key: string) => `intel-config:${key}`;

@Injectable()
export class IntelConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get<K extends IntelConfigKey>(key: K): Promise<IntelConfigShape[K]> {
    const cached = await this.redis.get(cacheKey(key));
    if (cached) return JSON.parse(cached) as IntelConfigShape[K];
    const row = await this.prisma.intelConfig.findUnique({ where: { key } });
    const merged = mergeConfig(key, row?.value);
    await this.redis.set(cacheKey(key), JSON.stringify(merged), CACHE_TTL_SECONDS);
    return merged;
  }

  async list() {
    const rows = await this.prisma.intelConfig.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return (Object.keys(INTEL_DEFAULTS) as IntelConfigKey[]).map((key) => {
      const row = byKey.get(key);
      return {
        key,
        value: mergeConfig(key, row?.value),
        defaults: INTEL_DEFAULTS[key],
        version: row?.version ?? 0,
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  history(key: string, take = 20) {
    return this.prisma.intelConfigChange.findMany({ where: { key }, orderBy: { createdAt: 'desc' }, take });
  }

  async set(key: string, patch: Record<string, unknown>, changedBy: string | null) {
    if (!isIntelConfigKey(key)) throw new BadRequestException({ error: 'UNKNOWN_CONFIG_KEY', message: `Unknown config key ${key}` });
    const value = validatePatch(key, patch);
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.intelConfig.findUnique({ where: { key } });
      const version = (existing?.version ?? 0) + 1;
      const saved = await tx.intelConfig.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, version, updatedBy: changedBy },
        update: { value: value as Prisma.InputJsonValue, version, updatedBy: changedBy },
      });
      await tx.intelConfigChange.create({
        data: {
          key,
          version,
          oldValue: (existing?.value ?? undefined) as Prisma.InputJsonValue | undefined,
          newValue: value as Prisma.InputJsonValue,
          changedBy,
        },
      });
      return saved;
    });
    await this.redis.del(cacheKey(key));
    return { key, value: mergeConfig(key, result.value), version: result.version };
  }
}

export function mergeConfig<K extends IntelConfigKey>(key: K, stored: unknown): IntelConfigShape[K] {
  const defaults = INTEL_DEFAULTS[key] as Record<string, unknown>;
  const out: Record<string, unknown> = { ...defaults };
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [field, value] of Object.entries(stored as Record<string, unknown>)) {
      if (field in defaults && typeof value === typeof defaults[field]) out[field] = value;
    }
  }
  return out as IntelConfigShape[K];
}

/** Only known fields with the same primitive type as the default are accepted. */
export function validatePatch(key: IntelConfigKey, patch: Record<string, unknown>): Record<string, unknown> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new BadRequestException({ error: 'INVALID_CONFIG', message: 'Config value must be an object' });
  }
  const defaults = INTEL_DEFAULTS[key] as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (!(field in defaults)) {
      throw new BadRequestException({ error: 'INVALID_CONFIG', message: `Unknown field ${key}.${field}` });
    }
    if (typeof value !== typeof defaults[field]) {
      throw new BadRequestException({ error: 'INVALID_CONFIG', message: `${key}.${field} must be ${typeof defaults[field]}` });
    }
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
      throw new BadRequestException({ error: 'INVALID_CONFIG', message: `${key}.${field} must be a non-negative number` });
    }
    clean[field] = value;
  }
  return clean;
}
