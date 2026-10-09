import { findDuplicate, locationsCompatible, shingleSketch, sketchJaccard } from './dedupe';
import { normalizePosting } from './normalize-posting';
import {
  detectSeniority,
  detectWorkType,
  normalizeEmploymentType,
  normalizeTitle,
  parseExperienceYears,
  parseLocation,
} from './normalizers';

describe('normalizeTitle', () => {
  it.each([
    ['Senior Back-End Developer (Node.js) - Berlin', 'Berlin, Germany', 'backend engineer node'],
    ['Sr. Software Engineer, Backend', null, 'software engineer backend'],
    ['Backend Engineer II', null, 'backend engineer'],
    ['Staff Full Stack Engineer | Remote', 'Remote', 'fullstack engineer'],
    ['Frontend Developer – React', 'London, UK', 'frontend engineer react'],
    ['SDE 2', null, 'software engineer'],
    ['Account Executive - France', 'Remote, France', 'account executive'],
    ['Machine Learning Engineer', null, 'machine learning engineer'],
    ['Junior QA Engineer', null, 'quality assurance engineer'],
  ])('%s -> %s', (raw, location, expected) => {
    expect(normalizeTitle(raw, location)).toBe(expected);
  });

  it('keeps a dash segment that is not a location', () => {
    expect(normalizeTitle('Software Engineer - Payments', 'New York, NY')).toBe('software engineer payments');
  });
});

describe('detectSeniority', () => {
  it.each([
    ['Senior Backend Engineer', 'SENIOR'],
    ['Sr. Software Engineer', 'SENIOR'],
    ['Software Engineer III', 'SENIOR'],
    ['Software Engineer II', 'MID'],
    ['Software Engineer I', 'JUNIOR'],
    ['Junior Developer', 'JUNIOR'],
    ['New Grad Software Engineer', 'JUNIOR'],
    ['Staff Engineer', 'STAFF'],
    ['Principal Engineer', 'PRINCIPAL'],
    ['Tech Lead, Platform', 'LEAD'],
    ['Engineering Manager', 'MANAGER'],
    ['Software Engineering Intern', 'INTERN'],
    ['Backend Engineer', null],
  ])('%s -> %s', (title, expected) => {
    expect(detectSeniority(title)).toBe(expected);
  });
});

describe('detectWorkType', () => {
  it('prefers the explicit ATS field and leaves unclear cases null', () => {
    expect(detectWorkType({ workplaceType: 'Remote', location: 'Berlin' })).toBe('REMOTE');
    expect(detectWorkType({ workplaceType: 'Hybrid' })).toBe('HYBRID');
    expect(detectWorkType({ workplaceType: 'OnSite' })).toBe('ONSITE');
    expect(detectWorkType({ location: 'Remote, Canada' })).toBe('REMOTE');
    expect(detectWorkType({ location: 'London (Hybrid)' })).toBe('HYBRID');
    expect(detectWorkType({ location: 'Bengaluru, India' })).toBeNull();
  });
});

describe('parseLocation', () => {
  it.each([
    ['Remote, Canada; Remote, United Kingdom; Remote, United States', ['CA', 'GB', 'US'], true],
    ['San Francisco, CA', ['US'], false],
    ['Austin, TX', ['US'], false],
    ['Bengaluru, Karnataka, India', ['IN'], false],
    ['London, UK', ['GB'], false],
    ['Berlin', ['DE'], false],
    ['Remote', [], true],
    ['', [], false],
  ])('%s', (text, countries, remote) => {
    expect(parseLocation(text)).toEqual({ countries, isRemote: remote });
  });
});

describe('parseExperienceYears', () => {
  it.each([
    ['You have 5+ years of professional experience with Go.', 5, null],
    ['3-5 years of experience building APIs', 3, 5],
    ['At least 2 years working with PostgreSQL', 2, null],
    ['Minimum of 4 years in backend roles. 8+ years of experience preferred.', 4, null],
    ['Founded 25 years ago, we have experience...', null, null],
    ['', null, null],
  ])('%s', (text, min, max) => {
    expect(parseExperienceYears(text)).toEqual({ min, max });
  });
});

describe('normalizeEmploymentType', () => {
  it('maps ATS spellings', () => {
    expect(normalizeEmploymentType('Full-time')).toBe('FULL_TIME');
    expect(normalizeEmploymentType('FullTime')).toBe('FULL_TIME');
    expect(normalizeEmploymentType('part_time')).toBe('PART_TIME');
    expect(normalizeEmploymentType('Contractor')).toBe('CONTRACT');
    expect(normalizeEmploymentType(null, 'Software Engineering Intern')).toBe('INTERNSHIP');
    expect(normalizeEmploymentType(null)).toBeNull();
  });
});

describe('dedupe', () => {
  const base =
    'We are hiring a backend engineer to design and build scalable APIs in Node.js and PostgreSQL. ' +
    'You will own services end to end, write tests, review code, and work with product on roadmap. ' +
    'Requirements: 3+ years of experience, strong TypeScript, SQL, REST, Docker, AWS, CI/CD pipelines.';

  it('near-identical descriptions score high, unrelated ones low', () => {
    const a = shingleSketch(base);
    const b = shingleSketch(`${base} Apply via our careers page.`);
    const c = shingleSketch('Join our sales team to close enterprise deals across EMEA and grow revenue with key accounts.');
    expect(sketchJaccard(a, b)).toBeGreaterThanOrEqual(0.8);
    expect(sketchJaccard(a, c)).toBeLessThan(0.1);
    expect(sketchJaccard([], a)).toBe(0);
  });

  it('location compatibility', () => {
    expect(locationsCompatible({ countries: ['US'], isRemote: false }, { countries: ['US', 'CA'], isRemote: true })).toBe(true);
    expect(locationsCompatible({ countries: ['US'], isRemote: false }, { countries: ['IN'], isRemote: false })).toBe(false);
    expect(locationsCompatible({ countries: [], isRemote: true }, { countries: ['US'], isRemote: true })).toBe(true);
  });

  const posted = new Date('2026-10-01T00:00:00Z');
  const subject = {
    sourceId: 'lever-1',
    normalizedTitle: 'backend engineer',
    countries: ['US'],
    isRemote: false,
    postedAt: posted,
    firstSeenAt: posted,
    shingleSketch: shingleSketch(base),
  };
  const candidate = {
    id: 'job-1',
    normalizedTitle: 'backend engineer',
    countries: ['US'],
    isRemote: false,
    postedAt: new Date('2026-09-20T00:00:00Z'),
    firstSeenAt: new Date('2026-09-20T00:00:00Z'),
    shingleSketch: shingleSketch(`${base} Apply now.`),
    sourceIds: ['greenhouse-1'],
  };
  const opts = { windowDays: 45, jaccardThreshold: 0.8 };

  it('merges the same vacancy posted on another board', () => {
    expect(findDuplicate(subject, [candidate], opts)?.id).toBe('job-1');
  });

  it('never merges two postings from the same board, different titles, other countries, or outside the window', () => {
    expect(findDuplicate(subject, [{ ...candidate, sourceIds: ['lever-1'] }], opts)).toBeNull();
    expect(findDuplicate(subject, [{ ...candidate, normalizedTitle: 'frontend engineer' }], opts)).toBeNull();
    expect(findDuplicate(subject, [{ ...candidate, countries: ['IN'] }], opts)).toBeNull();
    expect(
      findDuplicate(subject, [{ ...candidate, postedAt: new Date('2026-07-01T00:00:00Z'), firstSeenAt: new Date('2026-07-01T00:00:00Z') }], opts),
    ).toBeNull();
    expect(findDuplicate({ ...subject, shingleSketch: shingleSketch('Totally different role about data pipelines and Spark clusters at scale for analytics.') }, [candidate], opts)).toBeNull();
  });

  it('normalizePosting is deterministic', () => {
    const raw = { rawTitle: 'Senior Backend Engineer', rawLocation: 'Remote, US', rawDescription: base, workplaceType: null, employmentType: 'Full-time' };
    expect(normalizePosting(raw)).toEqual(normalizePosting(raw));
    expect(normalizePosting(raw)).toMatchObject({
      normalizedTitle: 'backend engineer',
      seniority: 'SENIOR',
      workType: 'REMOTE',
      countries: ['US'],
      isRemote: true,
      experienceMinYears: 3,
      employmentType: 'FULL_TIME',
    });
  });
});
