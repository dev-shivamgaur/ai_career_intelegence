/** A skill counts as market demand from this active-stock share upward. */
export const MARKET_MIN_SHARE = 0.05;
/** Required roadmap skills below this share are an importance mismatch. */
export const MISMATCH_WEAK_SHARE = 0.15;
/** Optional roadmap skills at or above this share are an importance mismatch. */
export const MISMATCH_STRONG_SHARE = 0.2;

export type RoadmapSkill = {
  skillId: string;
  name: string;
  importance: string;
  type: string;
};

export type MarketSkill = {
  skillId: string;
  name: string;
  demandPct: number;
  jobCount: number;
  companies: number;
  n: number;
  wilsonLower: number;
};

export type TrendHit = { skillId: string; label: string };

export type ComparedSkill = {
  skillId: string;
  name: string;
  demandPct: number | null;
  jobCount: number | null;
  companies: number | null;
  n: number | null;
  wilsonLower: number | null;
  roadmapImportance: string | null;
  roadmapType: string | null;
  trend: string | null;
};

export type CompareSets = {
  overlap: ComparedSkill[];
  roadmapOnly: ComparedSkill[];
  marketOnly: ComparedSkill[];
  emerging: ComparedSkill[];
  mismatch: ComparedSkill[];
};

function row(id: string, name: string, market?: MarketSkill, road?: RoadmapSkill, trend?: string | null): ComparedSkill {
  return {
    skillId: id,
    name,
    demandPct: market?.demandPct ?? null,
    jobCount: market?.jobCount ?? null,
    companies: market?.companies ?? null,
    n: market?.n ?? null,
    wilsonLower: market?.wilsonLower ?? null,
    roadmapImportance: road?.importance ?? null,
    roadmapType: road?.type ?? null,
    trend: trend ?? null,
  };
}

export function inMarket(skill: MarketSkill): boolean {
  return skill.demandPct >= MARKET_MIN_SHARE;
}

/** Required/high on the roadmap but rare in postings, or optional/low on the roadmap but common in postings. */
export function isMismatch(road: RoadmapSkill, market: MarketSkill): boolean {
  const required = road.type === 'REQUIRED' || road.importance === 'HIGH';
  const optional = road.type === 'NICE_TO_HAVE' || road.importance === 'LOW';
  if (required && market.demandPct < MISMATCH_WEAK_SHARE) return true;
  if (optional && market.demandPct >= MISMATCH_STRONG_SHARE) return true;
  return false;
}

/**
 * Sets are deterministic. Emerging comes only from a stored EMERGING trend label.
 * A skill can sit in overlap and also in emerging or mismatch.
 */
export function compareRoadmapMarket(roadmap: RoadmapSkill[], market: MarketSkill[], trends: TrendHit[]): CompareSets {
  const roadBy = new Map(roadmap.map((r) => [r.skillId, r]));
  const marketBy = new Map(market.filter(inMarket).map((m) => [m.skillId, m]));
  const trendBy = new Map(trends.map((t) => [t.skillId, t.label]));
  const overlap: ComparedSkill[] = [];
  const roadmapOnly: ComparedSkill[] = [];
  const marketOnly: ComparedSkill[] = [];
  const mismatch: ComparedSkill[] = [];
  for (const [id, road] of roadBy) {
    const m = marketBy.get(id);
    const item = row(id, road.name, m, road, trendBy.get(id) ?? null);
    if (m) {
      overlap.push(item);
      if (isMismatch(road, m)) mismatch.push(item);
    } else roadmapOnly.push(item);
  }
  for (const [id, m] of marketBy) {
    if (roadBy.has(id)) continue;
    marketOnly.push(row(id, m.name, m, undefined, trendBy.get(id) ?? null));
  }
  const emerging = [...marketBy.values()]
    .filter((m) => trendBy.get(m.skillId) === 'EMERGING')
    .map((m) => row(m.skillId, m.name, m, roadBy.get(m.skillId), 'EMERGING'));
  const byName = (a: ComparedSkill, b: ComparedSkill) => a.name.localeCompare(b.name);
  return {
    overlap: overlap.sort(byName),
    roadmapOnly: roadmapOnly.sort(byName),
    marketOnly: marketOnly.sort(byName),
    emerging: emerging.sort(byName),
    mismatch: mismatch.sort(byName),
  };
}
