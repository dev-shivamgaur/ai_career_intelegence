import { normalizeTitle } from '../normalize/normalizers';
import { evaluateSample, gateVerdict, GATE_TARGETS } from '../slice/quality-gate';
import { isAmbiguous, matchLanes, scoreCareers, type CareerModel } from './career-scorer';
import { SUGGESTED_PATTERNS, normalizePattern } from './title-classifier';

const W = { titleWeight: 0.7, skillOverlapWeight: 0.3 };
const careers: CareerModel[] = Object.entries(SUGGESTED_PATTERNS).map(([slug, p]) => ({
  careerId: slug,
  slug,
  ...p,
  skillIds: new Set<string>(),
  lanes: [],
}));
const job = (title: string, skills: Array<{ skillId: string | null; name: string }> = []) => ({ title, normalizedTitle: normalizeTitle(title), skills });
const ids = (title: string) =>
  scoreCareers(job(title), careers, W)
    .filter((s) => s.confidence >= 0.6)
    .map((s) => s.careerId)
    .sort();

describe('scoreCareers: title patterns', () => {
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
      expect(ids(title)).toEqual([]);
    },
  );

  it('does not match inside words', () => {
    expect(scoreCareers({ title: 'Backendless Evangelist', normalizedTitle: 'backendless evangelist', skills: [] }, careers, W)).toEqual([]);
  });

  it('normalizes patterns like titles', () => {
    expect(normalizePattern('Back-End Developer')).toBe('backend engineer');
    expect(normalizePattern('Senior')).toBe('');
  });
});

describe('scoreCareers: skill overlap and ambiguity', () => {
  const backend: CareerModel = {
    careerId: 'b',
    slug: 'backend',
    titlePatterns: ['backend'],
    excludePatterns: [],
    skillIds: new Set(['pg', 'node', 'docker', 'rest']),
    lanes: [
      { id: 'javascript', label: 'JS', keywords: ['node', 'node.js', 'express'], syllabusSlug: '' },
      { id: 'go', label: 'Go', keywords: ['go', 'golang'], syllabusSlug: '' },
    ],
  };
  const backendSkills = [
    { skillId: 'pg', name: 'PostgreSQL' },
    { skillId: 'node', name: 'Node.js' },
    { skillId: 'docker', name: 'Docker' },
    { skillId: 'k8s', name: 'Kubernetes' },
  ];

  it('title match plus overlap raises confidence; overlap needs enough resolved skills', () => {
    const [s] = scoreCareers(job('Backend Engineer', backendSkills), [backend], W);
    expect(s).toMatchObject({ method: 'TITLE_PATTERN', overlap: 0.75, confidence: 0.925 });
    const [few] = scoreCareers(job('Backend Engineer', backendSkills.slice(0, 2)), [backend], W);
    expect(few).toMatchObject({ overlap: null, confidence: 0.7 });
  });

  it('a generic title with strong overlap is a low-confidence candidate and ambiguous (LLM may decide)', () => {
    const scores = scoreCareers(job('Software Engineer', backendSkills), [backend], W);
    expect(scores[0]).toMatchObject({ method: 'SKILL_OVERLAP', confidence: 0.225 });
    expect(isAmbiguous(scores, 0.6)).toBe(true);
    expect(isAmbiguous(scoreCareers(job('Backend Engineer', backendSkills), [backend], W), 0.6)).toBe(false);
    expect(scoreCareers(job('Software Engineer', [{ skillId: 'x', name: 'X' }, { skillId: 'y', name: 'Y' }, { skillId: 'z', name: 'Z' }]), [backend], W)).toEqual([]);
  });

  it('lanes: whole-word keywords in title and skills, best lane wins', () => {
    expect(scoreCareers(job('Backend Engineer (Node.js)', backendSkills), [backend], W)[0].lanes).toEqual(['javascript']);
    expect(matchLanes('Backend Engineer', ['Go', 'PostgreSQL'], backend.lanes)).toEqual(['go']);
    expect(matchLanes('Backend Engineer, Google Cloud', ['PostgreSQL'], backend.lanes)).toEqual([]);
    expect(matchLanes('Golang Backend Engineer', ['Node.js'], backend.lanes)).toEqual(['go']);
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
