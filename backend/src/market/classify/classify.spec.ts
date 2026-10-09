import { normalizeTitle } from '../normalize/normalizers';
import { evaluateSample, gateVerdict, GATE_TARGETS } from '../slice/quality-gate';
import { SUGGESTED_PATTERNS, classifyTitle, normalizePattern, type CareerPatterns } from './title-classifier';

const careers: CareerPatterns[] = Object.entries(SUGGESTED_PATTERNS).map(([slug, p]) => ({ careerId: slug, ...p }));
const classify = (title: string) => classifyTitle(title, normalizeTitle(title), careers);
const ids = (title: string) => classify(title).map((m) => m.careerId).sort();

describe('classifyTitle', () => {
  it.each([
    ['Senior Back-End Developer (Node.js)', ['backend']],
    ['Software Engineer, Backend', ['backend']],
    ['Frontend Engineer - React', ['frontend']],
    ['Staff Site Reliability Engineer', ['devops']],
    ['SRE II', ['devops']],
    ['DevOps Engineer', ['devops']],
    ['Full Stack Developer', ['backend', 'frontend']],
    ['Platform Engineer', ['devops']],
  ])('%s -> %j', (title, expected) => {
    expect(ids(title)).toEqual(expected);
  });

  it.each(['Engineering Manager, Backend', 'Head of Frontend', 'Product Designer, Frontend', 'Account Executive', 'Data Scientist', 'Software Engineer'])(
    '%s stays unclassified',
    (title) => {
      expect(classify(title)).toEqual([]);
    },
  );

  it('does not match inside words', () => {
    expect(classifyTitle('Backendless Evangelist', 'backendless evangelist', careers)).toEqual([]);
  });

  it('marks exactly one primary, the longest matching pattern', () => {
    const custom: CareerPatterns[] = [
      { careerId: 'a', titlePatterns: ['engineer'], excludePatterns: [] },
      { careerId: 'b', titlePatterns: ['backend engineer'], excludePatterns: [] },
    ];
    const res = classifyTitle('Backend Engineer', 'backend engineer', custom);
    expect(res.filter((m) => m.isPrimary).map((m) => m.careerId)).toEqual(['b']);
  });

  it('normalizes patterns like titles', () => {
    expect(normalizePattern('Back-End Developer')).toBe('backend engineer');
    expect(normalizePattern('Senior')).toBe('');
  });
});

describe('quality gate', () => {
  it('micro-averages precision and recall', () => {
    const m = evaluateSample([
      { label: { careers: ['backend'], skills: ['go', 'sql'] }, predicted: { careers: ['backend'], skills: ['go', 'sql', 'docker'] } },
      { label: { careers: ['frontend'], skills: ['react'], falseMerge: true }, predicted: { careers: ['backend'], skills: [] } },
    ]);
    expect(m.extraction).toMatchObject({ tp: 2, fp: 1, fn: 1, precision: 0.667, recall: 0.667 });
    expect(m.classification).toMatchObject({ tp: 1, fp: 1, fn: 1, precision: 0.5 });
    expect(m.falseMerges).toBe(1);
  });

  it('GO only when every check passes', () => {
    const good = {
      jobs: 60,
      extraction: { tp: 90, fp: 10, fn: 20, precision: 0.9, recall: 0.818 },
      classification: { tp: 58, fp: 2, fn: 3, precision: 0.967, recall: 0.951 },
      falseMerges: 0,
      unresolvedRate: 0.12,
      consecutiveCleanRuns: 3,
    };
    expect(gateVerdict(good).verdict).toBe('GO');
    expect(gateVerdict({ ...good, jobs: 20 }).verdict).toBe('FIX');
    expect(gateVerdict({ ...good, unresolvedRate: null }).verdict).toBe('FIX');
    expect(gateVerdict({ ...good, falseMerges: 1 }, GATE_TARGETS).checks.find((c) => c.name === 'false dedupe merges')?.pass).toBe(false);
  });
});
