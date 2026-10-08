export type StackLane = {
  id: string;
  label: string;
  keywords: string[];
  syllabusSlug: string;
};

export type RoleFamily = {
  id: string;
  core: string[];
  lanes: StackLane[];
};

export function emptyFamily(id = 'unknown'): RoleFamily {
  return { id, core: [], lanes: [] };
}

export function parseLanes(raw: unknown): StackLane[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const id = String(r.id ?? '').trim();
      if (!id) return null;
      return {
        id,
        label: String(r.label ?? id),
        keywords: Array.isArray(r.keywords) ? r.keywords.map(String) : [],
        syllabusSlug: String(r.syllabusSlug ?? id),
      };
    })
    .filter((l): l is StackLane => Boolean(l));
}

export function familyFromCareer(row: {
  slug: string;
  title?: string;
  syllabusSlug?: string | null;
  coreTopics?: string[];
  stackLanes?: unknown;
}): RoleFamily {
  const lanes = parseLanes(row.stackLanes);
  if (!lanes.length && row.syllabusSlug) {
    return {
      id: row.slug,
      core: row.coreTopics ?? [],
      lanes: [
        {
          id: row.slug,
          label: row.title ?? row.slug,
          keywords: [row.title ?? row.slug, row.slug.replace(/-/g, ' ')],
          syllabusSlug: row.syllabusSlug,
        },
      ],
    };
  }
  return {
    id: row.slug,
    core: row.coreTopics ?? [],
    lanes,
  };
}

export function scoreLane(haystack: string, lane: StackLane): number {
  const hay = ` ${haystack.toLowerCase()} `;
  return lane.keywords.reduce((n, kw) => n + (hay.includes(kw.toLowerCase()) ? 1 : 0), 0);
}

export type LaneRequirement = {
  stackLane: string | null;
  layer: string;
  skill: { name: string };
};

/**
 * Roadmap.sh language pages start with install tours and syntax.
 * A backend or frontend job should not be graded on those nodes.
 */
export function isLanguagePrimer(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!n) return true;
  if (
    /^(what is|why use|why |history of|introduction|intro to|installing|installation|setting up|hello world|learn the basics|learn about|how to run|running |pick a|basic syntax|language basics)\b/.test(
      n,
    )
  ) {
    return true;
  }
  if (
    /\b(npm workspaces|cli-progress|\[global\]|global keyword|global installation|local installation|creating & importing|creating and importing|updating packages|creating packages|semantic versioning|node\.js vs browser|javascript errors|var vs)\b/.test(
      n,
    )
  ) {
    return true;
  }
  if (/^(commonjs|esm|npx|npm|var|let|const)$/.test(n)) return true;
  return false;
}

export type LanePractice = { required: string[]; optional: string[] };

/** Job + language lane. Null means keep the syllabus graph, minus primers. */
export function practiceForLane(careerSlug: string, laneId: string): LanePractice | null {
  const career = careerSlug.toLowerCase();
  const lane = laneId.toLowerCase();
  const backendJob = /backend|full-stack|fullstack|api-design/.test(career);
  const frontendJob = /frontend|full-stack|fullstack/.test(career);
  if (backendJob && (lane === 'nodejs' || lane === 'javascript')) {
    return {
      required: [
        'Express.js',
        'HTTP route handlers',
        'Middleware',
        'REST APIs',
        'Request validation',
        'JWT authentication',
        'PostgreSQL',
        'API error handling',
      ],
      optional: ['ORMs', 'Database indexes', 'Caching', 'Background jobs'],
    };
  }
  if (backendJob && lane === 'python') {
    return {
      required: ['Django', 'FastAPI', 'REST APIs', 'PostgreSQL', 'Request validation', 'JWT authentication', 'API error handling'],
      optional: ['ORMs', 'Database indexes', 'Caching', 'Background jobs'],
    };
  }
  if (backendJob && (lane === 'java' || lane === 'spring-boot')) {
    return {
      required: ['Spring MVC', 'REST APIs', 'Spring Security', 'PostgreSQL', 'Request validation', 'JWT authentication'],
      optional: ['Spring Data JPA', 'Caching', 'API error handling'],
    };
  }
  if (frontendJob && lane === 'javascript') {
    return {
      required: ['DOM', 'Fetch API', 'Forms', 'Accessibility', 'Responsive layout'],
      optional: ['State management', 'UI testing'],
    };
  }
  return null;
}

/** Core rows (no lane) plus the one stack the learner picked. Other lanes stay out. */
export function requirementsForStack<T extends LaneRequirement>(
  rows: T[],
  family: RoleFamily,
  stackId: string | null,
): T[] {
  return rows.filter((row) => {
    const layer = row.layer.toUpperCase();
    if (layer === 'OPTIONAL' || layer === 'ALTERNATIVE') return false;
    if (isLanguagePrimer(row.skill.name) && family.id !== row.stackLane) return false;
    if (belongsToOtherLane(row.skill.name, family, stackId)) return false;
    if (!row.stackLane) return true;
    if (!stackId) return false;
    return row.stackLane === stackId;
  });
}

export function belongsToOtherLane(name: string, family: RoleFamily, stackId: string | null): boolean {
  if (!stackId) return false;
  for (const lane of family.lanes) {
    if (lane.id === stackId) continue;
    if (scoreLane(name, lane) > 0) return true;
  }
  return false;
}

/** Advanced graph nodes that must never become required skill gaps. */
const ADVANCED_TOPIC_MARKERS = [
  'kubernetes',
  'k8s',
  'kafka',
  'grpc',
  'terraform',
  'graphql',
  'elasticsearch',
  'elastic search',
  'opensearch',
  'istio',
  'linkerd',
  'helm',
  'prometheus',
  'grafana',
  'ansible',
  'pulumi',
  'nomad',
  'consul',
  'vault',
  'service mesh',
  'rabbitmq',
  'nats',
  'pulsar',
  'cassandra',
  'hadoop',
  'spark',
  'flink',
  'airflow',
  'kubeflow',
  'argocd',
  'kustomize',
  'opentelemetry',
  'jaeger',
  'zipkin',
  'envoy',
  'cilium',
  'protobuf',
  'protocol buffers',
  'thrift',
  'avro',
  'cqrs',
  'event sourcing',
  'distributed system',
  'distributed systems',
  'raft',
  'paxos',
  'chaos engineering',
  'site reliability',
  'cockroach',
  'spanner',
  'vitess',
  'tidb',
  'snowflake',
  'bigquery',
  'redshift',
  'clickhouse',
  'neo4j',
  'graphql federation',
  'webassembly',
  'wasm',
  'saga pattern',
  'hexagonal',
];

/** Beginner / intermediate stack titles allowed as required (plus career coreTopics). */
const FUNDAMENTAL_TOPIC_MARKERS = [
  'sql',
  'postgres',
  'postgresql',
  'mysql',
  'sqlite',
  'mongodb',
  'redis',
  'rest',
  'http',
  'json',
  'git',
  'github',
  'auth',
  'authentication',
  'authorization',
  'jwt',
  'oauth',
  'session',
  'html',
  'css',
  'javascript',
  'typescript',
  'python',
  'java',
  'golang',
  'rust',
  'csharp',
  'c#',
  'php',
  'ruby',
  'kotlin',
  'node',
  'nodejs',
  'express',
  'spring',
  'django',
  'flask',
  'fastapi',
  'react',
  'nextjs',
  'npm',
  'linux',
  'bash',
  'cli',
  'terminal',
  'testing',
  'jest',
  'junit',
  'crud',
  'api',
  'database',
  'oop',
  'debugging',
  'docker',
  'websocket',
  'websockets',
  'dom',
  'fetch',
  'ajax',
];

function topicHaystack(name: string) {
  return ` ${name
    .toLowerCase()
    .replace(/node\.js/g, 'nodejs')
    .replace(/c\+\+/g, 'cpp')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function hayContainsMarker(hay: string, marker: string) {
  const m = marker.replace(/[^a-z0-9+#]+/g, ' ').trim();
  if (!m) return false;
  if (m.includes(' ')) return hay.includes(` ${m} `);
  return hay.includes(` ${m} `);
}

export function isAdvancedTopic(name: string): boolean {
  const hay = topicHaystack(name);
  return ADVANCED_TOPIC_MARKERS.some((m) => hayContainsMarker(hay, m));
}

export function isFundamentalTopic(name: string): boolean {
  if (isAdvancedTopic(name)) return false;
  const hay = topicHaystack(name);
  return FUNDAMENTAL_TOPIC_MARKERS.some((m) => hayContainsMarker(hay, m));
}

/** Required stack ingest: core titles plus beginner/intermediate names only. */
export function isRequiredStackTopic(name: string, coreTitles: string[]): boolean {
  const trimmed = name.trim();
  if (!trimmed || isAdvancedTopic(trimmed)) return false;
  const coreHit = coreTitles.some(
    (c) => c.trim().toLowerCase() === trimmed.toLowerCase() || hayContainsMarker(topicHaystack(trimmed), c.toLowerCase()),
  );
  return coreHit || isFundamentalTopic(trimmed);
}

/** Career catalog titles are always Want-core, including SEO / Excel / AWS IAM. */
export function isCatalogCoreTopic(name: string, coreTitles: string[]): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  return coreTitles.some(
    (c) =>
      c.trim().toLowerCase() === trimmed.toLowerCase() || hayContainsMarker(topicHaystack(trimmed), c.toLowerCase()),
  );
}

const PUBLIC_SYLLABUS_SLUGS = new Set([
  'nodejs',
  'backend',
  'frontend',
  'javascript',
  'typescript',
  'react',
  'vue',
  'angular',
  'nextjs',
  'react-native',
  'python',
  'java',
  'spring-boot',
  'android',
  'flutter',
  'kotlin',
  'swift-ui',
  'devops',
  'docker',
  'kubernetes',
  'terraform',
  'linux',
  'aws',
  'system-design',
  'sql',
  'postgresql',
  'postgresql-dba',
  'mongodb',
  'redis',
  'elasticsearch',
  'golang',
  'cpp',
  'c',
  'rust',
  'php',
  'laravel',
  'django',
  'ruby',
  'ruby-on-rails',
  'aspnet-core',
  'html',
  'css',
  'fullstack',
  'power-bi',
  'r-programming',
  'wordpress',
  'shell-bash',
  'git-github',
  'design-system',
  'qa',
  'cyber-security',
  'blockchain',
  'prompt-engineering',
  'ai-agents',
  'seo',
  'api-design',
  'product-manager',
  'technical-writer',
  'machine-learning',
]);

export function hasPublicSyllabusGraph(slug?: string | null): boolean {
  const s = slug?.trim().toLowerCase() ?? '';
  if (!s) return false;
  if (PUBLIC_SYLLABUS_SLUGS.has(s)) return true;
  return /^(aws|azure|gcp|cloud)/.test(s);
}
