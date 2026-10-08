import { BadRequestException } from '@nestjs/common';
import { mergeConfig, validatePatch } from './intel-config.service';
import { INTEL_DEFAULTS } from './intel-config.defaults';

describe('IntelConfig merge/validate', () => {
  it('returns defaults when nothing is stored', () => {
    expect(mergeConfig('dedupe', null)).toEqual(INTEL_DEFAULTS.dedupe);
  });

  it('overrides only known fields with matching types', () => {
    const merged = mergeConfig('dedupe', { windowDays: 30, jaccardThreshold: 'high', bogus: 1 });
    expect(merged).toEqual({ ...INTEL_DEFAULTS.dedupe, windowDays: 30 });
  });

  it('rejects unknown fields, wrong types and negative numbers', () => {
    expect(() => validatePatch('dedupe', { nope: 1 })).toThrow(BadRequestException);
    expect(() => validatePatch('dedupe', { windowDays: '30' })).toThrow(BadRequestException);
    expect(() => validatePatch('dedupe', { windowDays: -1 })).toThrow(BadRequestException);
    expect(validatePatch('dedupe', { windowDays: 30 })).toEqual({ windowDays: 30 });
  });
});
