import { filterMissing, normalizeSkill, skillMatches } from './skill-match';

// Characterization: locks in current behavior, including known loose matches (issue I-03).
describe('normalizeSkill (characterization)', () => {
  it('strips filler words and punctuation', () => {
    expect(normalizeSkill('REST APIs')).toBe('rest');
    expect(normalizeSkill('Spring Boot')).toBe('spring boot');
    expect(normalizeSkill('Node.js')).toBe('node js');
    expect(normalizeSkill('Advanced Python Language')).toBe('python');
  });

  it('rewrites # and ++', () => {
    expect(normalizeSkill('C#')).toBe('csharp');
    expect(normalizeSkill('C++')).toBe('cpp');
  });

  it('returns empty for pure filler', () => {
    expect(normalizeSkill('API')).toBe('');
    expect(normalizeSkill('  ')).toBe('');
  });
});

describe('skillMatches (characterization)', () => {
  it('matches exact and normalized names', () => {
    expect(skillMatches('REST APIs', ['rest'])).toBe(true);
    expect(skillMatches('PostgreSQL', ['postgresql'])).toBe(true);
    expect(skillMatches('Spring Boot', ['springboot'])).toBe(true);
  });

  it('matches by substring in both directions', () => {
    expect(skillMatches('React', ['react.js'])).toBe(true);
    expect(skillMatches('Express.js', ['express'])).toBe(true);
  });

  it('keeps the known substring false positives (I-03)', () => {
    expect(skillMatches('Go', ['mongodb'])).toBe(true);
    expect(skillMatches('Java', ['javascript'])).toBe(true);
  });

  it('does not match unrelated names', () => {
    expect(skillMatches('Kubernetes', ['docker', 'linux'])).toBe(false);
  });

  it('returns false when the target normalizes to empty', () => {
    expect(skillMatches('API', ['api design'])).toBe(false);
    expect(skillMatches('', ['anything'])).toBe(false);
  });

  it('skips known entries that normalize to empty', () => {
    expect(skillMatches('Docker', ['api', 'framework'])).toBe(false);
  });
});

describe('filterMissing (characterization)', () => {
  it('returns only names without a match, in input order', () => {
    expect(filterMissing(['React', 'Vue', 'Redux'], ['react.js'])).toEqual(['Vue', 'Redux']);
  });
});
