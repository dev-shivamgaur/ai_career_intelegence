/** Own copy of the IST slot logic so field-ingest.scheduler.ts stays untouched. IST has no daylight saving. */
export function istParts(date: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

export type MarketSlot = 'fetch' | 'aggregate' | 'retention';

export const MARKET_SLOT_HOURS: Record<MarketSlot, number> = { retention: 2, fetch: 6, aggregate: 20 };

/** The slot whose IST hour is now, with its window key (e.g. "2026-10-09-fetch"), or null. */
export function marketSlotAt(date: Date): { slot: MarketSlot; windowKey: string } | null {
  const { day, hour } = istParts(date);
  for (const [slot, h] of Object.entries(MARKET_SLOT_HOURS) as Array<[MarketSlot, number]>) {
    if (hour === h) return { slot, windowKey: `${day}-${slot}` };
  }
  return null;
}
