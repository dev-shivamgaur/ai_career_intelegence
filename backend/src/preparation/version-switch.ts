/** Pure helpers for learner package version selection. */

export type PublishedVersionRow = {
  id: string;
  version: number;
  status: string;
};

export function pickLatestPublished<T extends { version: number }>(rows: T[]): T | null {
  if (!rows.length) return null;
  return rows.reduce((best, row) => (row.version > best.version ? row : best));
}

export function resolveTargetPackageId(
  rows: PublishedVersionRow[],
  opts: { packageId?: string | null; packageVersion?: number | null },
): { packageId: string; version: number } | { error: 'NOT_FOUND' | 'NOT_PUBLISHED' } {
  const published = rows.filter((row) => row.status === 'PUBLISHED');
  if (opts.packageId) {
    const hit = rows.find((row) => row.id === opts.packageId);
    if (!hit) return { error: 'NOT_FOUND' };
    if (hit.status !== 'PUBLISHED') return { error: 'NOT_PUBLISHED' };
    return { packageId: hit.id, version: hit.version };
  }
  if (opts.packageVersion != null) {
    const hit = published.find((row) => row.version === opts.packageVersion);
    if (!hit) return { error: 'NOT_FOUND' };
    return { packageId: hit.id, version: hit.version };
  }
  const latest = pickLatestPublished(published);
  if (!latest) return { error: 'NOT_FOUND' };
  return { packageId: latest.id, version: latest.version };
}

export function shouldAbandonForSwitch(
  openPackageId: string | null | undefined,
  targetPackageId: string,
  switchVersion: boolean,
): boolean {
  if (!openPackageId) return false;
  if (openPackageId === targetPackageId) return false;
  return switchVersion;
}

export function buildVersionInfo(current: number, currentPackageId: string, latest: number, latestPackageId: string) {
  return {
    current,
    latest,
    packageId: currentPackageId,
    latestPackageId,
    upgradeAvailable: latest > current,
  };
}
