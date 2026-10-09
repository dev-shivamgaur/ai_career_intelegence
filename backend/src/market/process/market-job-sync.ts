import type { PrismaClient } from '../../prisma/client';

/**
 * After a fetch, recompute status / lastSeenAt / closedAt of every MarketJob linked to this source
 * from all of its raw rows (a vacancy stays open while any board still lists it). One statement.
 */
export async function syncMarketJobsForSource(prisma: Pick<PrismaClient, '$executeRaw'>, sourceId: string): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "market_job" AS mj SET
      "lastSeenAt" = agg.last_seen,
      "status" = (CASE WHEN agg.open_count > 0 THEN 'OPEN' WHEN agg.stale_count > 0 THEN 'STALE' ELSE 'CLOSED' END)::"MarketListingStatus",
      "closedAt" = CASE WHEN agg.open_count + agg.stale_count > 0 THEN NULL ELSE agg.closed_at END,
      "sourceCount" = agg.sources,
      "updatedAt" = NOW()
    FROM (
      SELECT "marketJobId" AS id,
             MAX("lastSeenAt") AS last_seen,
             COUNT(*) FILTER (WHERE "listingStatus" = 'OPEN') AS open_count,
             COUNT(*) FILTER (WHERE "listingStatus" = 'STALE') AS stale_count,
             MAX(COALESCE("closedAt", "lastSeenAt")) AS closed_at,
             COUNT(DISTINCT "sourceId")::int AS sources
      FROM "market_raw_job"
      WHERE "marketJobId" IN (
        SELECT DISTINCT "marketJobId" FROM "market_raw_job" WHERE "sourceId" = ${sourceId} AND "marketJobId" IS NOT NULL
      )
      GROUP BY "marketJobId"
    ) AS agg
    WHERE mj.id = agg.id`;
}
