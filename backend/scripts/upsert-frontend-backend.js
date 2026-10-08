/**
 * Fetches the official frontend and backend graphs and upserts those two
 * careers. Does not wipe other tables.
 *
 * Pattern matches scripts/seed-backend-roadmap.js:
 *   CORE            stackLane null, required, shared by every stack
 *   STACK_REQUIRED  one skill on each language or framework lane
 *   OPTIONAL        remaining roadmap.sh topics, stackLane null
 *
 * Lane syllabusSlug stays empty so a later sync does not pull a language
 * primer graph into the job.
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

const SKIP = new Set([
  'introduction',
  'learn the basics',
  'learn about apis',
  'learn a framework',
  'pick a backend language',
  'version control',
  'version control systems',
  'vcs hosting',
  'repo hosting services',
  'package managers',
  'css frameworks',
  'linters & formatters',
  'module bundlers',
  'testing',
  'auth strategies',
  'web security',
  'type checkers',
  'web components',
  'mobile apps',
  'desktop apps',
  'deployment',
  'performance',
  'design systems',
  'web apis',
  'relational databases',
  'nosql databases',
  'more about databases',
  'scaling databases',
  'architectural patterns',
  'message brokers',
  'learn about web servers',
  'building for scale',
  'real-time data',
  'frontend basics',
  'search engines',
  'ai assisted coding',
  'implementing ai',
  'applications',
  'integration patterns',
  'skills',
]);

const RENAME = new Map([
  ['how does the internet work', 'Internet'],
  ['what is http', 'HTTP'],
  ['http', 'HTTP'],
  ['what is domain name', 'Domain Name'],
  ['domain name', 'Domain Name'],
  ['what is hosting', 'Web Hosting'],
  ['hosting', 'Web Hosting'],
  ['dns and how it works', 'DNS'],
  ['dns', 'DNS'],
  ['browsers and how they work', 'Browsers'],
  ['browsers', 'Browsers'],
  ['how llms work', 'How LLMs Work'],
  ['docs generation', 'Documentation Generation'],
  ['ci / cd', 'CI/CD'],
  ['influx db', 'InfluxDB'],
  ['open api specs', 'OpenAPI'],
  ['rags', 'RAG'],
  ['vue.js', 'Vue.js'],
]);

function cleanLabel(raw) {
  let text = raw.replace(/\s+/g, ' ').trim().replace(/\?$/, '');
  const key = text.toLowerCase();
  if (RENAME.has(key)) return RENAME.get(key);
  if (SKIP.has(key)) return '';
  if (/^(what is|why |how to|learn the|learn about|pick a|introduction)\b/.test(key)) return '';
  if (text.length < 2 || text.length > 60) return '';
  return text;
}

async function labelsFor(slug) {
  const res = await fetch(`https://roadmap.sh/api/v1-official-roadmap/${slug}`);
  if (!res.ok) throw new Error(`roadmap.sh ${slug} returned ${res.status}`);
  const json = await res.json();
  const nodes = json.nodes || json.roadmap?.nodes || [];
  const seen = new Set();
  const labels = [];
  for (const node of nodes) {
    if (!['topic', 'subtopic', 'topics'].includes(node.type)) continue;
    const title = cleanLabel(node.data?.label || node.data?.name || '');
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    labels.push(title);
  }
  return labels;
}

const backendLanes = [
  { id: 'javascript', label: 'JavaScript', keywords: ['javascript', 'node', 'nodejs', 'node.js', 'express'], skill: 'JavaScript' },
  { id: 'python', label: 'Python', keywords: ['python', 'django', 'fastapi', 'flask'], skill: 'Python' },
  { id: 'java', label: 'Java', keywords: ['java', 'spring', 'spring boot'], skill: 'Java' },
  { id: 'go', label: 'Go', keywords: ['go', 'golang'], skill: 'Golang' },
  { id: 'php', label: 'PHP', keywords: ['php', 'laravel'], skill: 'PHP' },
  { id: 'ruby', label: 'Ruby', keywords: ['ruby', 'rails', 'ruby on rails'], skill: 'Ruby' },
  { id: 'csharp', label: 'C#', keywords: ['c#', 'csharp', '.net', 'asp.net', 'dotnet'], skill: 'C# .NET' },
  { id: 'rust', label: 'Rust', keywords: ['rust'], skill: 'Rust' },
];

const frontendLanes = [
  { id: 'react', label: 'React', keywords: ['react', 'react.js', 'next', 'next.js'], skill: 'React' },
  { id: 'vue', label: 'Vue', keywords: ['vue', 'vue.js', 'nuxt'], skill: 'Vue.js' },
  { id: 'angular', label: 'Angular', keywords: ['angular'], skill: 'Angular' },
  { id: 'svelte', label: 'Svelte', keywords: ['svelte', 'sveltekit'], skill: 'Svelte' },
];

const backendCore = [
  'Internet',
  'HTTP',
  'Domain Name',
  'Web Hosting',
  'DNS',
  'Browsers',
  'HTML',
  'CSS',
  'Git',
  'GitHub',
  'PostgreSQL',
  'REST',
  'JSON APIs',
  'OpenAPI',
  'Authentication',
  'JWT',
];

const frontendCore = [
  'Internet',
  'HTTP',
  'Domain Name',
  'Web Hosting',
  'DNS',
  'Browsers',
  'HTML',
  'CSS',
  'JavaScript',
  'Git',
  'GitHub',
  'Accessibility',
];

async function skillId(name, category) {
  const row = await prisma.skill.upsert({
    where: { name },
    update: {},
    create: { name, category },
  });
  return row.id;
}

async function upsertCareer(data) {
  return prisma.career.upsert({
    where: { slug: data.slug },
    update: {
      title: data.title,
      syllabusSlug: data.syllabusSlug,
      overview: data.overview,
      marketExpectations: data.marketExpectations,
      entryLevelExpectations: data.entryLevelExpectations,
      coreTopics: data.coreTopics,
      stackLanes: data.stackLanes,
      isCustom: false,
    },
    create: data,
  });
}

async function replaceRequirements(careerId, core, lanes, optionalNames) {
  await prisma.careerSkillRequirement.deleteMany({ where: { careerId } });
  const coreSet = new Set(core.map((name) => name.toLowerCase()));
  const laneSet = new Set(lanes.map((lane) => lane.skill.toLowerCase()));

  for (const name of core) {
    const id = await skillId(name, 'Core');
    await prisma.careerSkillRequirement.create({
      data: {
        careerId,
        skillId: id,
        importance: 'HIGH',
        type: 'REQUIRED',
        layer: 'CORE',
        stackLane: null,
      },
    });
  }

  for (const lane of lanes) {
    const id = await skillId(lane.skill, 'Stack');
    await prisma.careerSkillRequirement.create({
      data: {
        careerId,
        skillId: id,
        importance: 'HIGH',
        type: 'REQUIRED',
        layer: 'STACK_REQUIRED',
        stackLane: lane.id,
      },
    });
  }

  for (const name of optionalNames) {
    const key = name.toLowerCase();
    if (coreSet.has(key) || laneSet.has(key)) continue;
    const id = await skillId(name, 'Stack');
    await prisma.careerSkillRequirement.create({
      data: {
        careerId,
        skillId: id,
        importance: 'LOW',
        type: 'RECOMMENDED',
        layer: 'OPTIONAL',
        stackLane: null,
      },
    });
  }
}

async function main() {
  const [frontendLabels, backendLabels] = await Promise.all([
    labelsFor('frontend'),
    labelsFor('backend'),
  ]);

  const backend = await upsertCareer({
    title: 'Backend Developer',
    slug: 'backend',
    syllabusSlug: 'backend',
    overview:
      'Server-side path from the official Backend roadmap: how the web works, one language, Git, a relational database, REST, and authentication. Later topics stay optional.',
    marketExpectations:
      'Entry backend roles expect one language used on real projects, Git, SQL against a relational database, a REST API, and authentication. The rest of the roadmap is context, not a checklist you must finish first.',
    entryLevelExpectations:
      'Learn one backend language and build projects with it. Use Git and GitHub, run CRUD on PostgreSQL, build a REST API, and add authentication. A computer science degree is not required.',
    coreTopics: backendCore,
    isCustom: false,
    stackLanes: backendLanes.map((lane) => ({
      id: lane.id,
      label: lane.label,
      keywords: lane.keywords,
      syllabusSlug: '',
    })),
  });

  const frontend = await upsertCareer({
    title: 'Frontend Developer',
    slug: 'frontend',
    syllabusSlug: 'frontend',
    overview:
      'Browser path from the official Frontend roadmap: how the web works, HTML, CSS, JavaScript, Git, and one UI framework. Later topics stay optional.',
    marketExpectations:
      'Entry frontend roles expect HTML, CSS, JavaScript, Git, and one framework such as React used on a real interface. The rest of the roadmap is context, not a checklist you must finish first.',
    entryLevelExpectations:
      'Build pages with HTML and CSS, use JavaScript in the browser, ship work with Git, and learn one framework. A computer science degree is not required.',
    coreTopics: frontendCore,
    isCustom: false,
    stackLanes: frontendLanes.map((lane) => ({
      id: lane.id,
      label: lane.label,
      keywords: lane.keywords,
      syllabusSlug: '',
    })),
  });

  await replaceRequirements(backend.id, backendCore, backendLanes, backendLabels);
  await replaceRequirements(frontend.id, frontendCore, frontendLanes, frontendLabels);

  await prisma.knowledgeChunk.deleteMany({
    where: {
      OR: [{ tags: { has: 'backend' } }, { tags: { has: 'frontend' } }],
    },
  });

  const summary = await prisma.careerSkillRequirement.groupBy({
    by: ['careerId', 'layer'],
    where: { careerId: { in: [backend.id, frontend.id] } },
    _count: true,
  });
  console.log(
    JSON.stringify(
      {
        source: 'https://roadmap.sh/api/v1-official-roadmap/{frontend,backend}',
        backendLabels: backendLabels.length,
        frontendLabels: frontendLabels.length,
        summary,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
