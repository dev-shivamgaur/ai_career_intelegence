import { shingleSketch } from './dedupe';
import {
  NORMALIZER_VERSION,
  detectSeniority,
  detectWorkType,
  normalizeEmploymentType,
  normalizeTitle,
  parseExperienceYears,
  parseLocation,
  type EmploymentType,
  type Seniority,
  type WorkType,
} from './normalizers';

export type RawPostingInput = {
  rawTitle: string;
  rawLocation: string | null;
  rawDescription: string | null;
  workplaceType: string | null;
  employmentType: string | null;
};

export type NormalizedPosting = {
  title: string;
  normalizedTitle: string;
  seniority: Seniority | null;
  workType: WorkType | null;
  locationText: string | null;
  countries: string[];
  isRemote: boolean;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  employmentType: EmploymentType | null;
  shingleSketch: number[];
  normalizerVersion: string;
};

export function normalizePosting(raw: RawPostingInput, shingleSize = 3): NormalizedPosting {
  const location = parseLocation(raw.rawLocation);
  const workType = detectWorkType({ workplaceType: raw.workplaceType, location: raw.rawLocation, title: raw.rawTitle });
  const exp = parseExperienceYears(raw.rawDescription);
  return {
    title: raw.rawTitle.trim().slice(0, 300),
    normalizedTitle: normalizeTitle(raw.rawTitle, raw.rawLocation) || raw.rawTitle.toLowerCase().trim(),
    seniority: detectSeniority(raw.rawTitle),
    workType,
    locationText: raw.rawLocation?.trim().slice(0, 300) || null,
    countries: location.countries,
    isRemote: location.isRemote || workType === 'REMOTE',
    experienceMinYears: exp.min,
    experienceMaxYears: exp.max,
    employmentType: normalizeEmploymentType(raw.employmentType, raw.rawTitle),
    shingleSketch: shingleSketch(raw.rawDescription, shingleSize),
    normalizerVersion: NORMALIZER_VERSION,
  };
}
