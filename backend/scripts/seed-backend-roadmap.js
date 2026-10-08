/**
 * Clears every application row, then loads the Backend Developer catalog
 * from the official roadmap.sh backend graph:
 * https://roadmap.sh/api/v1-official-roadmap/backend
 *
 * Shared backend skills have no stack lane. Each language is its own lane,
 * so a Python learner is not asked for JavaScript, and no lane pulls the
 * Node.js graph (EventEmitter and the rest stay out).
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

const core = [
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

const lanes = [
  {
    id: 'javascript',
    label: 'JavaScript',
    keywords: ['javascript', 'node', 'nodejs', 'node.js', 'express'],
    skill: 'JavaScript',
  },
  {
    id: 'python',
    label: 'Python',
    keywords: ['python', 'django', 'fastapi', 'flask'],
    skill: 'Python',
  },
  {
    id: 'java',
    label: 'Java',
    keywords: ['java', 'spring', 'spring boot'],
    skill: 'Java',
  },
  {
    id: 'go',
    label: 'Go',
    keywords: ['go', 'golang'],
    skill: 'Golang',
  },
  {
    id: 'php',
    label: 'PHP',
    keywords: ['php', 'laravel'],
    skill: 'PHP',
  },
  {
    id: 'ruby',
    label: 'Ruby',
    keywords: ['ruby', 'rails', 'ruby on rails'],
    skill: 'Ruby',
  },
  {
    id: 'csharp',
    label: 'C#',
    keywords: ['c#', 'csharp', '.net', 'asp.net', 'dotnet'],
    skill: 'C# .NET',
  },
  {
    id: 'rust',
    label: 'Rust',
    keywords: ['rust'],
    skill: 'Rust',
  },
];

const optional = [
  'GitLab',
  'MySQL',
  'MariaDB',
  'SQLite',
  'MS SQL',
  'Oracle',
  'Database Migrations',
  'SOAP',
  'gRPC',
  'GraphQL',
  'N+1 Problem',
  'OAuth',
  'Basic Authentication',
  'Token Authentication',
  'Cookie Based Auth',
  'OpenID',
  'SAML',
  'Nginx',
  'Apache',
  'Caddy',
  'MS IIS',
  'Redis',
  'Memcached',
  'HTTP Caching',
  'Web Security',
  'MD5',
  'SHA',
  'scrypt',
  'bcrypt',
  'OWASP Risks',
  'HTTPS',
  'SSL/TLS',
  'CORS',
  'Server Security',
  'CSP',
  'How LLMs Work',
  'AI vs Traditional Coding',
  'Embeddings',
  'Vectors',
  'RAG',
  'Claude Code',
  'Cursor',
  'Copilot',
  'Antigravity',
  'Prompting Techniques',
  'Code Reviews',
  'AI Agents',
  'MCP',
  'Agent Skills',
  'Refactoring',
  'Documentation Generation',
  'Gemini',
  'OpenAI',
  'Anthropic',
  'Streaming',
  'Structured Outputs',
  'Function Calling',
  'CI/CD',
  'Integration Testing',
  'Unit Testing',
  'Functional Testing',
  'Transactions',
  'ORMs',
  'ACID',
  'Normalization',
  'Failure Modes',
  'Profiling Performance',
  'Kafka',
  'RabbitMQ',
  'LXC',
  'Monolith',
  'Microservices',
  'SOA',
  'Serverless',
  'Service Mesh',
  'Twelve Factor Apps',
  'Elasticsearch',
  'Solr',
  'Server Sent Events',
  'Database Indexes',
  'WebSockets',
  'Data Replication',
  'Long and Short Polling',
  'Sharding Strategies',
  'CAP Theorem',
  'Observability',
  'Graceful Degradation',
  'Throttling',
  'Backpressure',
  'Loadshifting',
  'Circuit Breaker',
  'Instrumentation',
  'Monitoring',
  'Telemetry',
  'MongoDB',
  'CouchDB',
  'Firebase',
  'RethinkDB',
  'DynamoDB',
  'Neo4j',
  'ClickHouse',
  'Cassandra',
  'ScyllaDB',
  'InfluxDB',
  'TimescaleDB',
  'AWS Neptune',
  'DGraph',
];

async function clearData() {
  const tables = await prisma.$queryRaw`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;
  const names = tables.map((row) => `"${row.tablename}"`).join(', ');
  if (!names) return;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

async function skillId(name, category) {
  const row = await prisma.skill.upsert({
    where: { name },
    update: { category },
    create: { name, category },
  });
  return row.id;
}

async function main() {
  await clearData();

  const career = await prisma.career.create({
    data: {
      title: 'Backend Developer',
      slug: 'backend',
      syllabusSlug: 'backend',
      overview:
        'Server-side path from the official Backend roadmap: how the web works, one language, Git, a relational database, REST, and authentication. Later topics stay optional.',
      marketExpectations:
        'Entry backend roles expect one language used on real projects, Git, SQL against a relational database, a REST API, and authentication. The rest of the roadmap is context, not a checklist you must finish first.',
      entryLevelExpectations:
        'Learn one backend language and build projects with it. Use Git and GitHub, run CRUD on PostgreSQL, build a REST API, and add authentication. A computer science degree is not required.',
      coreTopics: core,
      stackLanes: lanes.map((lane) => ({
        id: lane.id,
        label: lane.label,
        keywords: lane.keywords,
        syllabusSlug: '',
      })),
    },
  });

  for (const name of core) {
    const id = await skillId(name, 'Core');
    await prisma.careerSkillRequirement.create({
      data: {
        careerId: career.id,
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
        careerId: career.id,
        skillId: id,
        importance: 'HIGH',
        type: 'REQUIRED',
        layer: 'STACK_REQUIRED',
        stackLane: lane.id,
      },
    });
  }

  for (const name of optional) {
    const id = await skillId(name, 'Stack');
    await prisma.careerSkillRequirement.create({
      data: {
        careerId: career.id,
        skillId: id,
        importance: 'LOW',
        type: 'RECOMMENDED',
        layer: 'OPTIONAL',
        stackLane: null,
      },
    });
  }

  const [careers, skills, requirements] = await Promise.all([
    prisma.career.count(),
    prisma.skill.count(),
    prisma.careerSkillRequirement.groupBy({
      by: ['layer', 'stackLane'],
      _count: true,
    }),
  ]);
  console.log(JSON.stringify({ careers, skills, requirements }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
