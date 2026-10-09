import { AshbyConnector } from './ashby.connector';
import { GreenhouseConnector } from './greenhouse.connector';
import { LeverConnector } from './lever.connector';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validBoardToken } from './source-connector';

const fixture = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8'));
const greenhouse = fixture('greenhouse');
const lever = fixture('lever');
const ashby = fixture('ashby');

describe('GreenhouseConnector.parse', () => {
  const jobs = new GreenhouseConnector().parse(greenhouse);

  it('skips postings without a title', () => {
    expect(jobs.map((j) => j.externalId)).toEqual(['4012345', '4012346']);
  });

  it('decodes entity-encoded HTML into sectioned text', () => {
    const text = jobs[0].descriptionText;
    expect(text).toContain('Requirements\n- 5+ years with Node.js and TypeScript\n- PostgreSQL & Redis');
    expect(text).toContain('Nice to have\n- Kafka');
    expect(text).not.toMatch(/<|&lt;|&amp;/);
  });

  it('maps metadata', () => {
    expect(jobs[0]).toMatchObject({
      title: 'Senior Backend Engineer (Node.js)',
      location: 'Bengaluru, India',
      url: 'https://boards.greenhouse.io/examplecorp/jobs/4012345',
      department: 'Engineering',
    });
    expect(jobs[0].postedAt?.toISOString()).toBe('2026-09-01T13:00:00.000Z');
    expect(jobs[1].department).toBeNull();
  });

  it('returns [] for unexpected shapes', () => {
    expect(new GreenhouseConnector().parse({ nope: true })).toEqual([]);
    expect(new GreenhouseConnector().parse(null)).toEqual([]);
  });
});

describe('LeverConnector.parse', () => {
  const jobs = new LeverConnector().parse(lever);

  it('joins intro, titled lists and closing text', () => {
    expect(jobs[0].descriptionText).toBe(
      'Join our platform team.\n\nWhat you need\n- Java 17 and Spring Boot\n- REST APIs\n\nBonus points\n- Docker\n\nWe offer health insurance.',
    );
  });

  it('maps categories and timestamps', () => {
    expect(jobs[0]).toMatchObject({ location: 'Pune, India', employmentType: 'Full-time', workplaceType: 'hybrid', department: 'Platform' });
    expect(jobs[0].postedAt?.toISOString()).toBe('2025-09-01T08:00:00.000Z');
    expect(jobs[1].department).toBe('Analytics');
    expect(jobs[1].descriptionText).toBe('SQL and Python.');
  });
});

describe('AshbyConnector.parse', () => {
  const jobs = new AshbyConnector().parse(ashby);

  it('drops unlisted postings', () => {
    expect(jobs.map((j) => j.title)).toEqual(['Full Stack Engineer', 'DevOps Engineer']);
  });

  it('prefers HTML so section headings survive', () => {
    expect(jobs[0].descriptionText).toBe('Must have\n- React\n- Node.js\n\nPreferred\n- GraphQL');
    expect(jobs[0].workplaceType).toBe('OnSite');
    expect(jobs[1].workplaceType).toBe('Remote');
    expect(jobs[1].descriptionText).toBe('Kubernetes and Terraform.');
  });
});

describe('board URLs', () => {
  it('builds the documented public endpoints', () => {
    expect(new GreenhouseConnector().boardUrl('acme')).toBe('https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true');
    expect(new LeverConnector().boardUrl('acme')).toBe('https://api.lever.co/v0/postings/acme?mode=json&limit=100&skip=0');
    expect(new AshbyConnector().boardUrl('acme')).toBe('https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=false');
  });

  it('rejects unsafe board tokens', () => {
    expect(validBoardToken('acme-corp_1.io')).toBe(true);
    expect(validBoardToken('../etc')).toBe(false);
    expect(validBoardToken('a b')).toBe(false);
    expect(validBoardToken('')).toBe(false);
  });
});
