import { Injectable, Logger } from '@nestjs/common';
import type { RobotsStatus } from '../../prisma/client';
import { RedisService } from '../../redis/redis.service';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { isPathAllowed, parseRobots } from './robots';

export type MarketFetchErrorCode =
  | 'HOST_NOT_ALLOWED'
  | 'ROBOTS_DISALLOWED'
  | 'HTTP_CLIENT_ERROR'
  | 'HTTP_SERVER_ERROR'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'INVALID_JSON';

export class MarketFetchError extends Error {
  constructor(
    readonly code: MarketFetchErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

export type FetchJsonResult<T> = { data: T; status: number; url: string; robots: RobotsStatus };

const UNKNOWN_MARKER = '__UNKNOWN__';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Outbound client for market sources only. WebResearchService is not used or modified.
 * Allowlisted hosts, robots.txt as a crawl-policy signal, per-host rate limit, timeout, retry with backoff.
 */
@Injectable()
export class MarketHttpClient {
  private readonly logger = new Logger(MarketHttpClient.name);
  private readonly allowedHosts = new Set<string>();
  private readonly lastRequestAt = new Map<string, number>();

  constructor(
    private readonly redis: RedisService,
    private readonly config: IntelConfigService,
  ) {
    for (const host of (process.env.MARKET_EXTRA_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase())) {
      if (host) this.allowedHosts.add(host);
    }
  }

  allowHosts(hosts: string[]) {
    for (const host of hosts) this.allowedHosts.add(host.toLowerCase());
  }

  isHostAllowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && this.allowedHosts.has(parsed.hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  async robotsStatus(url: string): Promise<RobotsStatus> {
    const fetchCfg = await this.config.get('fetch');
    const parsed = new URL(url);
    const key = `market:robots:${parsed.host}`;
    let text = await this.redis.get(key);
    if (text === null) {
      text = await this.downloadRobots(parsed, fetchCfg.timeoutMs, fetchCfg.userAgent);
      await this.redis.set(key, text, fetchCfg.robotsCacheHours * 3600);
    }
    if (text === UNKNOWN_MARKER) return 'UNKNOWN';
    const token = fetchCfg.userAgent.split('/')[0];
    return isPathAllowed(parseRobots(text), token, parsed.pathname + parsed.search) ? 'ALLOWED' : 'DISALLOWED';
  }

  async getJson<T>(url: string): Promise<FetchJsonResult<T>> {
    if (!this.isHostAllowed(url)) {
      throw new MarketFetchError('HOST_NOT_ALLOWED', `Host not on the market allowlist: ${safeHost(url)}`, false);
    }
    const robots = await this.robotsStatus(url);
    if (robots === 'DISALLOWED') {
      throw new MarketFetchError('ROBOTS_DISALLOWED', `robots.txt disallows ${new URL(url).pathname}`, false);
    }
    const fetchCfg = await this.config.get('fetch');
    let lastError: MarketFetchError | null = null;
    for (let attempt = 0; attempt <= fetchCfg.maxRetries; attempt += 1) {
      if (attempt > 0) await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
      await this.throttle(new URL(url).host, fetchCfg.requestsPerMinutePerHost);
      try {
        const res = await this.request(url, fetchCfg.timeoutMs, fetchCfg.userAgent, 'application/json');
        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get('retry-after'));
          if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 120) await sleep(retryAfter * 1000);
          lastError = new MarketFetchError(
            res.status === 429 ? 'RATE_LIMITED' : 'HTTP_SERVER_ERROR',
            `HTTP ${res.status} from ${safeHost(url)}`,
            true,
            res.status,
          );
          continue;
        }
        if (res.status >= 400) {
          throw new MarketFetchError('HTTP_CLIENT_ERROR', `HTTP ${res.status} from ${safeHost(url)}`, false, res.status);
        }
        const body = await res.text();
        try {
          return { data: JSON.parse(body) as T, status: res.status, url, robots };
        } catch {
          throw new MarketFetchError('INVALID_JSON', `Invalid JSON from ${safeHost(url)}`, false, res.status);
        }
      } catch (err) {
        if (err instanceof MarketFetchError && !err.retryable) throw err;
        lastError =
          err instanceof MarketFetchError
            ? err
            : (err as Error).name === 'AbortError'
              ? new MarketFetchError('TIMEOUT', `Timeout after ${fetchCfg.timeoutMs}ms`, true)
              : new MarketFetchError('NETWORK', (err as Error).message, true);
      }
    }
    throw lastError ?? new MarketFetchError('NETWORK', 'Request failed', true);
  }

  private async request(url: string, timeoutMs: number, userAgent: string, accept: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        headers: { 'user-agent': userAgent, accept },
        redirect: 'error',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async downloadRobots(parsed: URL, timeoutMs: number, userAgent: string): Promise<string> {
    try {
      await this.throttle(parsed.host, 60);
      const res = await this.request(`${parsed.protocol}//${parsed.host}/robots.txt`, Math.min(timeoutMs, 10_000), userAgent, 'text/plain');
      if (res.status !== 200) return UNKNOWN_MARKER;
      return (await res.text()).slice(0, 500_000);
    } catch (err) {
      this.logger.warn(`robots.txt unreachable for ${parsed.host}: ${(err as Error).message}`);
      return UNKNOWN_MARKER;
    }
  }

  /** Per-host spacing in-process plus a per-minute counter in Redis (shared across API and worker). */
  private async throttle(host: string, perMinute: number) {
    const limit = Math.max(1, perMinute);
    const spacing = Math.ceil(60_000 / limit);
    const last = this.lastRequestAt.get(host) ?? 0;
    const wait = last + spacing - Date.now();
    if (wait > 0) await sleep(wait);
    for (let i = 0; i < 3; i += 1) {
      const minute = Math.floor(Date.now() / 60_000);
      const key = `market:rl:${host}:${minute}`;
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, 120);
      if (count <= limit) break;
      await sleep((minute + 1) * 60_000 - Date.now() + 50);
    }
    this.lastRequestAt.set(host, Date.now());
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-url';
  }
}
