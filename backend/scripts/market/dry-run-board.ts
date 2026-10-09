/**
 * Non-persisting dry run of one public ATS board through the real connector + MarketHttpClient
 * (allowlist, robots.txt check, throttle, timeout). Uses in-memory stand-ins for Redis and config,
 * never touches the database and prints only a small sample.
 *
 *   npx ts-node --transpile-only scripts/market/dry-run-board.ts <GREENHOUSE|LEVER|ASHBY> <boardToken>
 *
 * This does not record a terms review. Enabling a source still requires an admin terms review.
 */
import { MarketHttpClient } from '../../src/market/http/market-http-client';
import { ConnectorRegistry } from '../../src/market/connectors/connector-registry';
import { INTEL_DEFAULTS } from '../../src/intel-config/intel-config.defaults';
import { validBoardToken } from '../../src/market/connectors/source-connector';

class MemoryRedis {
  private store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.store.set(key, value);
  }
  async incr(key: string) {
    const next = Number(this.store.get(key) ?? '0') + 1;
    this.store.set(key, String(next));
    return next;
  }
  async expire() {
    return 1;
  }
}

class DefaultsConfig {
  async get(key: keyof typeof INTEL_DEFAULTS) {
    return INTEL_DEFAULTS[key];
  }
}

async function main() {
  const [type, token] = process.argv.slice(2);
  if (!type || !token || !['GREENHOUSE', 'LEVER', 'ASHBY'].includes(type) || !validBoardToken(token)) {
    console.error('Usage: dry-run-board.ts <GREENHOUSE|LEVER|ASHBY> <boardToken>');
    process.exit(2);
  }
  const http = new MarketHttpClient(new MemoryRedis() as never, new DefaultsConfig() as never);
  const registry = new ConnectorRegistry(http);
  const connector = registry.get(type as never);
  const started = Date.now();
  const result = await connector.fetch(token, http);
  const withDescription = result.jobs.filter((j) => j.descriptionText.length > 200).length;
  console.log(
    JSON.stringify(
      {
        url: result.fetchedUrl,
        robots: result.robots,
        jobs: result.jobs.length,
        withDescriptionOver200Chars: withDescription,
        withPostedAt: result.jobs.filter((j) => j.postedAt).length,
        elapsedMs: Date.now() - started,
        sample: result.jobs.slice(0, 3).map((j) => ({
          externalId: j.externalId,
          title: j.title,
          location: j.location,
          postedAt: j.postedAt,
          descriptionChars: j.descriptionText.length,
          descriptionHead: j.descriptionText.slice(0, 160),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(`Dry run failed: ${(err as Error).message}`);
  process.exit(1);
});
