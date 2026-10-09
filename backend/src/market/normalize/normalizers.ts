/** Deterministic, pure normalizers for market postings. Bump NORMALIZER_VERSION when any rule changes. */
export const NORMALIZER_VERSION = 'norm-1';

export type Seniority = 'INTERN' | 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF' | 'PRINCIPAL' | 'LEAD' | 'MANAGER';
export type WorkType = 'REMOTE' | 'HYBRID' | 'ONSITE';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'TEMPORARY';

const SENIORITY_WORDS =
  /\b(senior|sr|junior|jr|lead|principal|staff|intern|internship|associate|entry[ -]level|mid[ -]level|mid|graduate|grad|trainee|head of|director|vp|chief|manager|i{1,3}|iv|v|[1-5])\b/g;

const TITLE_SYNONYMS: Array<[RegExp, string]> = [
  [/\bback[\s-]?end\b/g, 'backend'],
  [/\bfront[\s-]?end\b/g, 'frontend'],
  [/\bfull[\s-]?stack\b/g, 'fullstack'],
  [/\bnode\.?js\b/g, 'node'],
  [/\breact\.?js\b/g, 'react'],
  [/\bsdet\b/g, 'software engineer test'],
  [/\b(sde|swe)\b/g, 'software engineer'],
  [/\bdevelopers?\b/g, 'engineer'],
  [/\bdev\b/g, 'engineer'],
  [/\bengineers\b/g, 'engineer'],
  [/\bprogrammer\b/g, 'engineer'],
  [/\bml\b/g, 'machine learning'],
  [/\bai\b/g, 'artificial intelligence'],
  [/\bqa\b/g, 'quality assurance'],
  [/\bsre\b/g, 'site reliability engineer'],
];

const REMOTE_WORDS = /\b(remote|anywhere|worldwide|global|distributed|work from home|wfh)\b/i;
const HYBRID_WORDS = /\bhybrid\b/i;
const ONSITE_WORDS = /\b(on[\s-]?site|in[\s-]?office|in office)\b/i;

/**
 * Title without seniority, punctuation, location suffixes and spelling variants.
 * "Senior Back-End Developer (Node.js) - Berlin" with location "Berlin, Germany" -> "backend engineer node".
 */
export function normalizeTitle(rawTitle: string, location?: string | null): string {
  const locationWords = new Set(
    (location ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1),
  );
  const segments = rawTitle.split(/\s+[-–—|]\s+|\s*\|\s*/);
  const kept = segments.filter((seg, i) => {
    if (i === 0) return true;
    const words = seg.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (!words.length) return false;
    const isLocation = words.every((w) => locationWords.has(w) || REMOTE_WORDS.test(w));
    return !isLocation;
  });
  let t = kept.join(' ').toLowerCase().normalize('NFKC');
  t = t.replace(/c\+\+/g, 'cpp').replace(/c#/g, 'csharp').replace(/\.net\b/g, 'dotnet');
  for (const [re, rep] of TITLE_SYNONYMS) t = t.replace(re, rep);
  t = t.replace(/[^a-z0-9]+/g, ' ');
  t = t.replace(SENIORITY_WORDS, ' ');
  t = t.replace(REMOTE_WORDS, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/** Seniority from the title only; descriptions mention many levels, so they are not used. Null when unclear. */
export function detectSeniority(rawTitle: string): Seniority | null {
  const t = ` ${rawTitle.toLowerCase()} `;
  if (/\b(intern|internship|trainee|apprentice)\b/.test(t)) return 'INTERN';
  if (/\b(head of|director|vp|vice president|chief|engineering manager|manager)\b/.test(t)) return 'MANAGER';
  if (/\bprincipal\b/.test(t)) return 'PRINCIPAL';
  if (/\bstaff\b/.test(t)) return 'STAFF';
  if (/\b(lead|tech lead|team lead)\b/.test(t)) return 'LEAD';
  if (/\b(senior|sr)\b/.test(t) || /\b(iii|3)\s*$/.test(t.trim())) return 'SENIOR';
  if (/\b(junior|jr|entry[ -]level|graduate|grad|new grad)\b/.test(t) || /\b(i|1)\s*$/.test(t.trim())) return 'JUNIOR';
  if (/\b(mid[ -]level|mid|intermediate)\b/.test(t) || /\b(ii|2)\s*$/.test(t.trim())) return 'MID';
  return null;
}

/** Maps to the existing WorkType enum. Explicit ATS field first, then location and title. Unclear stays null. */
export function detectWorkType(input: {
  workplaceType?: string | null;
  location?: string | null;
  title?: string | null;
}): WorkType | null {
  const explicit = (input.workplaceType ?? '').toLowerCase();
  if (/remote/.test(explicit)) return 'REMOTE';
  if (/hybrid/.test(explicit)) return 'HYBRID';
  if (/on[\s-]?site|office/.test(explicit)) return 'ONSITE';
  const text = `${input.location ?? ''} ${input.title ?? ''}`;
  if (HYBRID_WORDS.test(text)) return 'HYBRID';
  if (REMOTE_WORDS.test(text)) return 'REMOTE';
  if (ONSITE_WORDS.test(text)) return 'ONSITE';
  return null;
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  US: ['united states', 'america', 'new york', 'san francisco', 'seattle', 'austin', 'boston', 'chicago', 'los angeles', 'denver'],
  GB: ['united kingdom', 'england', 'scotland', 'london', 'great britain', 'manchester', 'edinburgh'],
  IN: ['india', 'bengaluru', 'bangalore', 'mumbai', 'pune', 'hyderabad', 'chennai', 'delhi', 'new delhi', 'gurugram', 'gurgaon', 'noida', 'kolkata'],
  CA: ['canada', 'toronto', 'vancouver', 'montreal', 'ontario', 'quebec', 'british columbia'],
  DE: ['germany', 'deutschland', 'berlin', 'munich', 'münchen', 'hamburg', 'frankfurt'],
  FR: ['france', 'paris', 'lyon'],
  NL: ['netherlands', 'amsterdam', 'rotterdam'],
  IE: ['ireland', 'dublin'],
  ES: ['spain', 'madrid', 'barcelona'],
  PT: ['portugal', 'lisbon', 'porto'],
  PL: ['poland', 'warsaw', 'krakow', 'kraków'],
  AU: ['australia', 'sydney', 'melbourne'],
  SG: ['singapore'],
  JP: ['japan', 'tokyo'],
  BR: ['brazil', 'são paulo', 'sao paulo'],
  MX: ['mexico', 'mexico city'],
  IL: ['israel', 'tel aviv'],
  AE: ['united arab emirates', 'dubai'],
  SE: ['sweden', 'stockholm'],
  CH: ['switzerland', 'zurich', 'zürich', 'geneva'],
};

const ALIAS_INDEX: Array<{ re: RegExp; code: string }> = Object.entries(COUNTRY_ALIASES).flatMap(([code, names]) =>
  names.map((n) => ({ re: new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu'), code })),
);

/** Short codes are case-sensitive; US state abbreviations only count after a comma ("Austin, TX"). */
const UPPERCASE_CODES: Array<[RegExp, string]> = [
  [/\b(US|USA|U\.S\.)\b/, 'US'],
  [/,\s*(AL|AZ|CO|CT|DC|FL|GA|IL|MA|MD|MI|MN|NC|NJ|NY|OH|OR|PA|TX|UT|VA|WA|WI)\b/, 'US'],
  [/\b(UK)\b/, 'GB'],
  [/\b(UAE)\b/, 'AE'],
];

/** Countries mentioned in a location string (ISO-3166 alpha-2), plus whether it is remote. Multi-location boards return several. */
export function parseLocation(location: string | null | undefined): { countries: string[]; isRemote: boolean } {
  const text = (location ?? '').trim();
  if (!text) return { countries: [], isRemote: false };
  const countries = new Set<string>();
  for (const { re, code } of ALIAS_INDEX) if (re.test(text)) countries.add(code);
  for (const [re, code] of UPPERCASE_CODES) if (re.test(text)) countries.add(code);
  return { countries: [...countries].sort(), isRemote: REMOTE_WORDS.test(text) };
}

/** Years of experience asked for. Returns the smallest minimum found near the word "experience". */
export function parseExperienceYears(description: string | null | undefined): { min: number | null; max: number | null } {
  const text = (description ?? '').slice(0, 20_000);
  let min: number | null = null;
  let max: number | null = null;
  const consider = (lo: number, hi: number | null) => {
    if (lo > 30 || (hi !== null && (hi > 40 || hi < lo))) return;
    if (min === null || lo < min) {
      min = lo;
      max = hi;
    }
  };
  // "experience" must follow within a few plain words ("5+ years of professional experience"), not a later clause.
  const range = /(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\+?\s*(?:years|yrs)\s+(?:of\s+)?(?:[a-z-]+\s+){0,3}experience/gi;
  const plus = /(\d{1,2})\s*\+?\s*(?:years|yrs)\s+(?:of\s+)?(?:[a-z-]+\s+){0,3}experience/gi;
  const atLeast = /(?:at least|minimum(?: of)?|min\.?)\s*(\d{1,2})\s*(?:years|yrs)/gi;
  for (const m of text.matchAll(range)) consider(Number(m[1]), Number(m[2]));
  for (const m of text.matchAll(plus)) consider(Number(m[1]), null);
  for (const m of text.matchAll(atLeast)) consider(Number(m[1]), null);
  return { min, max };
}

export function normalizeEmploymentType(raw: string | null | undefined, title?: string | null): EmploymentType | null {
  const t = `${raw ?? ''}`.toLowerCase().replace(/[_\s-]+/g, '');
  if (/intern/.test(t) || /\b(intern|internship)\b/i.test(title ?? '')) return 'INTERNSHIP';
  if (/parttime/.test(t)) return 'PART_TIME';
  if (/fulltime|permanent|regular/.test(t)) return 'FULL_TIME';
  if (/contract|freelance|contractor/.test(t)) return 'CONTRACT';
  if (/temp|temporary|seasonal|fixedterm/.test(t)) return 'TEMPORARY';
  if (/\b(contract|contractor)\b/i.test(title ?? '')) return 'CONTRACT';
  return null;
}
