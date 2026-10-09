import { CANONICAL_SKILL_SEED } from '../../skill-intel/skill-aliases.seed';
import { MarketLlmExtractor } from './market-llm-extractor.service';
import { MARKET_VOCABULARY } from './market-vocabulary';
import { locateEvidence, mergeHits, validateLlmSkills } from './merge';
import { buildMatchers, excerpt, extractByRules } from './rule-extractor';
import { detectSections } from './sections';

const matchers = buildMatchers([...CANONICAL_SKILL_SEED.map((s) => ({ name: s.name, forms: s.aliases })), ...MARKET_VOCABULARY]);

const POSTING = [
  'About us',
  'We help teams go to market faster. Next steps are simple.',
  'What you will do',
  '- Build services in Go and Node.js',
  'Requirements',
  '- 4+ years of experience with PostgreSQL',
  '- Strong TypeScript and REST API design',
  '- Docker and Kubernetes (K8s)',
  'Nice to have',
  '- Kafka or RabbitMQ',
  '- Terraform experience is a plus',
].join('\n');

describe('detectSections', () => {
  it('labels requirement, preferred and other blocks', () => {
    const kinds = detectSections(POSTING).map((s) => s.kind);
    expect(kinds).toEqual(['OTHER', 'OTHER', 'REQUIRED', 'PREFERRED']);
  });

  it('a posting without headings is one NONE section', () => {
    expect(detectSections('We need Python and SQL.\nApply now.')).toEqual([{ start: 0, end: 34, kind: 'NONE' }]);
  });

  it('does not treat a full sentence as a heading', () => {
    expect(detectSections('Plus, we offer equity and remote work for everyone.').map((s) => s.kind)).toEqual(['NONE']);
  });
});

describe('extractByRules', () => {
  const hits = extractByRules(POSTING, matchers);
  const byName = new Map(hits.map((h) => [h.name, h]));

  it('finds dictionary skills with section levels', () => {
    expect(byName.get('PostgreSQL')).toMatchObject({ level: 'REQUIRED', confidence: 0.9, yearsRequired: 4 });
    expect(byName.get('TypeScript')?.level).toBe('REQUIRED');
    expect(byName.get('REST')?.level).toBe('REQUIRED');
    expect(byName.get('Kubernetes')?.level).toBe('REQUIRED');
    expect(byName.get('Kafka')?.level).toBe('RECOMMENDED');
    expect(byName.get('Terraform')?.level).toBe('RECOMMENDED');
    expect(byName.get('Node.js')?.level).toBe('NICE_TO_HAVE');
  });

  it('accepts "Go" in tech context but not "go to market"; ignores bare "Next"', () => {
    expect(byName.get('Go')?.level).toBe('NICE_TO_HAVE');
    const goHit = byName.get('Go')!;
    expect(POSTING.slice(goHit.matchStart, goHit.matchEnd)).toBe('Go');
    expect(POSTING.slice(goHit.lineStart, goHit.lineEnd)).toContain('Build services in Go');
    expect(byName.has('Next.js')).toBe(false);
  });

  it('avoids classic substring false positives', () => {
    const text = 'Requirements\n- JavaScript and MongoDB\n- Rest of the team is in Berlin\n- We react quickly';
    const names = extractByRules(text, matchers).map((h) => h.name).sort();
    expect(names).toEqual(['JavaScript', 'MongoDB']);
  });

  it('every hit span points at its line in the text', () => {
    for (const h of hits) {
      expect(h.matchStart).toBeGreaterThanOrEqual(h.lineStart);
      expect(h.matchEnd).toBeLessThanOrEqual(h.lineEnd);
    }
  });

  it('lets the longer form claim its span ("Spring Boot" before "Spring")', () => {
    const names = extractByRules('Requirements\n- Java with Spring Boot', matchers).map((h) => h.name).sort();
    expect(names).toEqual(['Java', 'Spring Boot']);
  });
});

describe('excerpt', () => {
  it('stays inside the line, contains the match and honours the limit', () => {
    const line = `${'x '.repeat(200)}Kafka ${'y '.repeat(200)}`;
    const at = line.indexOf('Kafka');
    const ex = excerpt(line, { lineStart: 0, lineEnd: line.length, matchStart: at, matchEnd: at + 5 }, 50)!;
    expect(ex.end - ex.start).toBeLessThanOrEqual(50);
    expect(ex.text).toContain('Kafka');
    expect(excerpt(line, { lineStart: 0, lineEnd: 10, matchStart: 0, matchEnd: 1 }, 0)).toBeNull();
  });
});

describe('LLM validation and merge', () => {
  const text = 'Requirements:\n- Experience with Apache  Kafka streams\n- Comfortable with GraphQL';

  it('keeps only verbatim evidence, ignoring whitespace and case, and caps confidence', () => {
    expect(locateEvidence(text, 'experience with apache kafka')).not.toBeNull();
    const valid = validateLlmSkills(
      text,
      [
        { name: 'Kafka', level: 'REQUIRED', evidence: 'Experience with Apache Kafka', confidence: 0.95 },
        { name: 'Snowflake', level: 'REQUIRED', evidence: 'Snowflake warehouse', confidence: 0.9 },
        { name: 'skills', level: 'REQUIRED', evidence: 'Comfortable with GraphQL', confidence: 0.9 },
      ],
      0.7,
    );
    expect(valid.map((v) => v.name)).toEqual(['Kafka']);
    expect(valid[0].confidence).toBe(0.7);
  });

  it('merges by key: both passes -> RULE_LLM, LLM-only stays capped', () => {
    const rule = extractByRules(text, matchers);
    const llm = validateLlmSkills(
      text,
      [
        { name: 'Kafka', level: 'REQUIRED', evidence: 'Apache  Kafka streams', confidence: 0.9 },
        { name: 'Kafka Streams', level: 'PREFERRED', evidence: 'Kafka streams', confidence: 0.9 },
      ],
      0.7,
    );
    const merged = mergeHits(rule, llm, (n) => n.toLowerCase());
    const kafka = merged.find((m) => m.name === 'Kafka')!;
    expect(kafka.method).toBe('RULE_LLM');
    expect(kafka.confidence).toBeCloseTo(0.95);
    expect(merged.find((m) => m.name === 'Kafka Streams')).toMatchObject({ method: 'LLM', confidence: 0.7, level: 'RECOMMENDED' });
    expect(merged.find((m) => m.name === 'GraphQL')?.method).toBe('RULE');
  });
});

describe('MarketLlmExtractor budget', () => {
  const OLD = process.env.MARKET_LLM_EXTRACTION;
  afterEach(() => {
    process.env.MARKET_LLM_EXTRACTION = OLD;
  });

  function make(used: number) {
    const invoke = jest.fn().mockResolvedValue({ skills: [] });
    const llm = { isConfigured: () => true, chat: () => ({ withStructuredOutput: () => ({ invoke }) }) };
    const redis = { incr: jest.fn().mockResolvedValue(used), expire: jest.fn() };
    const config = { get: async () => ({ llmDailyLimit: 200, maxDescriptionChars: 12000 }) };
    return { extractor: new MarketLlmExtractor(llm as never, redis as never, config as never), invoke };
  }

  it('is off unless the flag is on', async () => {
    delete process.env.MARKET_LLM_EXTRACTION;
    const { extractor, invoke } = make(1);
    expect(await extractor.extract('text')).toEqual({ skipped: 'DISABLED' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('enforces the daily limit', async () => {
    process.env.MARKET_LLM_EXTRACTION = 'true';
    const over = make(201);
    expect(await over.extractor.extract('text')).toEqual({ skipped: 'BUDGET' });
    expect(over.invoke).not.toHaveBeenCalled();
    const within = make(200);
    expect(await within.extractor.extract('text')).toEqual({ skills: [] });
    expect(within.invoke).toHaveBeenCalledTimes(1);
  });
});
