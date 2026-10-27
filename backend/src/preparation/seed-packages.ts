import type { PrepContent, PrepRubric } from './package.schema';
import { prepContentSchema, prepRubricSchema } from './package.schema';
import { hashPackage } from './package-builder';

export type SeedPackage = {
  skillName: string;
  category: string;
  conceptual: boolean;
  rich: boolean;
  content: PrepContent;
  rubric: PrepRubric;
  contentHash: string;
};

function pack(
  skillId: string,
  skillName: string,
  partial: Omit<PrepContent, 'skillId' | 'skillName' | 'schemaVersion'> & { schemaVersion?: number },
  rubricPartial: PrepRubric,
): { content: PrepContent; rubric: PrepRubric; contentHash: string } {
  const content = prepContentSchema.parse({
    schemaVersion: 2,
    skillId,
    skillName,
    ...partial,
  });
  const rubric = prepRubricSchema.parse(rubricPartial);
  return { content, rubric, contentHash: hashPackage(content, rubric) };
}

/** Rich conceptual package — no practical task. */
export function promptingTechniquesPackage(skillId: string) {
  return pack(
    skillId,
    'Prompting Techniques',
    {
      careerTitle: 'AI Engineer',
      dailyHours: 2,
      phase: 'D30',
      targetCareerSlugs: ['ai-engineer', 'backend-developer'],
      subtopics: [
        { key: 'clarity', title: 'Clear instructions', order: 0, objectiveKeys: ['write-clear'] },
        { key: 'constraints', title: 'Constraints and format', order: 1, objectiveKeys: ['constrain'] },
        { key: 'eval', title: 'Evaluate outputs', order: 2, objectiveKeys: ['evaluate'] },
      ],
      objectives: [
        { key: 'write-clear', title: 'Write a clear task prompt', questionKeys: ['q-mcq-1', 'q-short-1'] },
        { key: 'constrain', title: 'Add constraints and output shape', questionKeys: ['q-scenario-1'] },
        { key: 'evaluate', title: 'Judge when a prompt failed', questionKeys: ['q-theory-1'] },
      ],
      prerequisites: [],
      estimatedMinutes: 45,
      difficulty: 'foundation',
      lessons: [
        {
          key: 'clarity',
          title: 'Clear instructions',
          explanation:
            'A useful prompt names the role, the task, the inputs, and what a good answer looks like. Vague asks produce vague answers. Prefer one job per prompt over a long mixed request.',
          objectiveKey: 'write-clear',
          subtopicKey: 'clarity',
          questionKeys: ['q-mcq-1', 'q-short-1'],
          examples: [
            'Role: senior reviewer. Task: list three risks in this API change. Format: bullets.',
            'Include the user story and the acceptance criteria in the prompt body.',
          ],
          mistakes: [
            'Only naming the skill without a situation.',
            'Asking for everything at once with no success criteria.',
          ],
        },
        {
          key: 'constraints',
          title: 'Constraints and structured outputs',
          explanation:
            'Constraints reduce drift: length, tone, allowed tools, and JSON or table shape. Structured outputs make answers checkable. State what to omit as well as what to include.',
          objectiveKey: 'constrain',
          subtopicKey: 'constraints',
          questionKeys: ['q-scenario-1'],
          examples: ['Return JSON with keys summary and risks. No markdown fences.'],
          mistakes: ['Leaving format open when a downstream system needs JSON.'],
        },
        {
          key: 'eval',
          title: 'Evaluate and iterate',
          explanation:
            'When an answer fails, change one variable: context, constraint, or example. Keep a short failure note so the next prompt is not a guess.',
          objectiveKey: 'evaluate',
          subtopicKey: 'eval',
          questionKeys: ['q-theory-1'],
          examples: ['Failure: invents APIs. Fix: paste the OpenAPI snippet and forbid inventing fields.'],
          mistakes: ['Treating one lucky answer as proof the prompt always works.'],
        },
      ],
      resources: [],
      questions: [
        {
          key: 'q-mcq-1',
          lessonKey: 'clarity',
          objectiveKey: 'write-clear',
          type: 'mcq',
          prompt: 'Which prompt is more likely to produce a checkable answer?',
          options: [
            { id: 'good', label: 'As a QA lead, list three test cases for this login flow, each with steps and expected result.' },
            { id: 'bad', label: 'Tell me about prompting.' },
          ],
        },
        {
          key: 'q-short-1',
          lessonKey: 'clarity',
          objectiveKey: 'write-clear',
          type: 'short',
          prompt: 'Write a short prompt that asks for a code review of a NestJS controller. Include role, task, and one success check.',
        },
        {
          key: 'q-scenario-1',
          lessonKey: 'constraints',
          objectiveKey: 'constrain',
          type: 'scenario',
          prompt: 'Your pipeline needs JSON with keys title and steps. The model keeps returning markdown. What constraint do you add, and why?',
        },
        {
          key: 'q-theory-1',
          lessonKey: 'eval',
          objectiveKey: 'evaluate',
          type: 'theory',
          prompt: 'The model invents endpoints that are not in your OpenAPI file. What do you change in the next prompt?',
        },
      ],
      tasks: [],
      completionSummary: 'Verified when every objective is passed. No repository evidence is required for this skill.',
      nextActionTemplate: 'Finish clear prompts, then constraints, then evaluation.',
    },
    {
      passLine: 70,
      questions: {
        'q-mcq-1': { correctOptionId: 'good' },
        'q-short-1': { keywords: ['review', 'nestjs', 'controller', 'check'] },
        'q-scenario-1': { keywords: ['json', 'format', 'markdown', 'keys'] },
        'q-theory-1': { keywords: ['openapi', 'forbid', 'invent', 'snippet', 'context'] },
      },
      tasks: {},
    },
  );
}

/** Rich practical package — GitHub evidence optional but present. */
export function ragPackage(skillId: string) {
  return pack(
    skillId,
    'RAG',
    {
      careerTitle: 'AI Engineer',
      dailyHours: 2,
      phase: 'D30',
      targetCareerSlugs: ['ai-engineer'],
      subtopics: [
        { key: 'embed', title: 'Embeddings', order: 0, objectiveKeys: ['embed'] },
        { key: 'retrieve', title: 'Retrieval', order: 1, objectiveKeys: ['retrieve'] },
        { key: 'ground', title: 'Grounded answers', order: 2, objectiveKeys: ['ground'] },
      ],
      objectives: [
        { key: 'embed', title: 'Explain embeddings for retrieval', questionKeys: ['q-rag-mcq', 'q-rag-theory'] },
        { key: 'retrieve', title: 'Describe a retrieval step', questionKeys: ['q-rag-short'] },
        { key: 'ground', title: 'Keep answers grounded', questionKeys: ['q-rag-scenario'] },
      ],
      prerequisites: [],
      estimatedMinutes: 90,
      difficulty: 'core',
      lessons: [
        {
          key: 'embed',
          title: 'Embeddings for search',
          explanation:
            'Embeddings turn text into vectors so similar meaning lands nearby. Chunking and metadata decide what you can retrieve later. Embedding alone is not an answer.',
          objectiveKey: 'embed',
          subtopicKey: 'embed',
          questionKeys: ['q-rag-mcq', 'q-rag-theory'],
          examples: ['Split docs by section, embed each chunk, store vector + source id.'],
          mistakes: ['Embedding the whole book as one vector and hoping retrieval still works.'],
          codeBlocks: [
            {
              language: 'typescript',
              caption: 'Conceptual store shape',
              code: 'type Chunk = { id: string; text: string; vector: number[]; source: string };',
            },
          ],
        },
        {
          key: 'retrieve',
          title: 'Retrieve then generate',
          explanation:
            'Query → embed → nearest chunks → pass only those chunks to the model. Rank and filter by source when possible. Empty retrieval should fail closed, not invent.',
          objectiveKey: 'retrieve',
          subtopicKey: 'retrieve',
          questionKeys: ['q-rag-short'],
          examples: ['Top-k = 4 chunks with source titles in the prompt.'],
          mistakes: ['Sending the whole corpus in the prompt and calling it RAG.'],
        },
        {
          key: 'ground',
          title: 'Grounded answers',
          explanation:
            'Ask the model to cite chunk ids and refuse when context is missing. Log which chunks were used so you can debug wrong answers.',
          objectiveKey: 'ground',
          subtopicKey: 'ground',
          questionKeys: ['q-rag-scenario'],
          examples: ['If no chunk scores above threshold, reply that the docs do not cover it.'],
          mistakes: ['Letting the model answer from training data when retrieval is empty.'],
        },
      ],
      resources: [],
      questions: [
        {
          key: 'q-rag-mcq',
          lessonKey: 'embed',
          objectiveKey: 'embed',
          type: 'mcq',
          prompt: 'What is the main job of embeddings in a RAG pipeline?',
          options: [
            { id: 'search', label: 'Turn text into vectors so similar chunks can be retrieved.' },
            { id: 'train', label: 'Fine-tune the base model weights on every user question.' },
          ],
        },
        {
          key: 'q-rag-theory',
          lessonKey: 'embed',
          objectiveKey: 'embed',
          type: 'theory',
          prompt: 'Why does chunk size matter when you embed documents for RAG?',
        },
        {
          key: 'q-rag-short',
          lessonKey: 'retrieve',
          objectiveKey: 'retrieve',
          type: 'short',
          prompt: 'Describe the steps from a user question to the chunks you put in the model prompt.',
        },
        {
          key: 'q-rag-scenario',
          lessonKey: 'ground',
          objectiveKey: 'ground',
          type: 'scenario',
          prompt: 'Retrieval returns zero useful chunks. What should your system do, and why?',
        },
      ],
      tasks: [
        {
          key: 'github-rag',
          prompt: 'Paste a public GitHub URL that embeds documents and retrieves chunks (or a close equivalent). A definition is not evidence.',
          required: true,
          evidenceKind: 'github',
          acceptanceCriteria: ['Public repository', 'Shows embedding or vector store usage', 'Shows a retrieve step'],
        },
      ],
      completionSummary: 'Verified when objectives pass and the GitHub task is verified.',
      nextActionTemplate: 'Finish embeddings, retrieval, grounding, then submit repository evidence.',
    },
    {
      passLine: 70,
      questions: {
        'q-rag-mcq': { correctOptionId: 'search' },
        'q-rag-theory': { keywords: ['chunk', 'context', 'retrieve', 'size', 'overlap'] },
        'q-rag-short': { keywords: ['embed', 'query', 'chunk', 'prompt', 'top'] },
        'q-rag-scenario': { keywords: ['refuse', 'empty', 'missing', 'threshold', 'not invent'] },
      },
      tasks: { 'github-rag': { requiresGithub: true, evidenceKind: 'github' } },
    },
  );
}

export function codeReviewsPackage(skillId: string) {
  return pack(
    skillId,
    'Code Reviews',
    {
      careerTitle: 'Backend Developer',
      dailyHours: 2,
      phase: 'D30',
      objectives: [
        { key: 'find-risk', title: 'Spot a concrete risk', questionKeys: ['q-cr-mcq', 'q-cr-short'] },
        { key: 'feedback', title: 'Write actionable feedback', questionKeys: ['q-cr-scenario'] },
      ],
      prerequisites: [],
      estimatedMinutes: 60,
      difficulty: 'core',
      lessons: [
        {
          key: 'risks',
          title: 'Review for risk, not taste',
          explanation:
            'Prioritize correctness, security, data loss, and operability. Style notes come after. Every comment should name the risk and a suggested check or change.',
          objectiveKey: 'find-risk',
          questionKeys: ['q-cr-mcq', 'q-cr-short'],
          examples: ['Missing transaction around multi-row writes can leave partial state.'],
          mistakes: ['Only commenting on naming while ignoring error handling.'],
        },
        {
          key: 'feedback',
          title: 'Actionable review comments',
          explanation:
            'Good comments are specific, testable, and respectful. Prefer “what breaks” over “I would write it differently” without a reason.',
          objectiveKey: 'feedback',
          questionKeys: ['q-cr-scenario'],
          examples: ['Please guard null userId before the query; otherwise the handler 500s on logout races.'],
          mistakes: ['Nitpicking without saying whether the change must block merge.'],
        },
      ],
      resources: [],
      questions: [
        {
          key: 'q-cr-mcq',
          lessonKey: 'risks',
          objectiveKey: 'find-risk',
          type: 'mcq',
          prompt: 'Which review comment is highest priority?',
          options: [
            { id: 'sec', label: 'This endpoint trusts a client-supplied role without checking the session.' },
            { id: 'style', label: 'Rename this variable to match your preference.' },
          ],
        },
        {
          key: 'q-cr-short',
          lessonKey: 'risks',
          objectiveKey: 'find-risk',
          type: 'short',
          prompt: 'A PR deletes rows then writes new ones without a transaction. What risk do you raise?',
        },
        {
          key: 'q-cr-scenario',
          lessonKey: 'feedback',
          objectiveKey: 'feedback',
          type: 'scenario',
          prompt: 'Write one review comment for a missing null check on userId before a DB query.',
        },
      ],
      tasks: [],
      completionSummary: 'Verified when review objectives are passed.',
      nextActionTemplate: 'Practice risk spotting, then write one actionable comment.',
    },
    {
      passLine: 70,
      questions: {
        'q-cr-mcq': { correctOptionId: 'sec' },
        'q-cr-short': { keywords: ['transaction', 'partial', 'fail', 'inconsistent', 'rollback'] },
        'q-cr-scenario': { keywords: ['null', 'userId', 'guard', 'check', 'query'] },
      },
      tasks: {},
    },
  );
}

export function relationalDatabasesPackage(skillId: string) {
  return pack(
    skillId,
    'Relational Databases',
    {
      careerTitle: 'Backend Developer',
      dailyHours: 2,
      phase: 'D30',
      objectives: [
        { key: 'schema', title: 'Model a simple schema', questionKeys: ['q-db-mcq', 'q-db-short'] },
        { key: 'query', title: 'Write a safe query', questionKeys: ['q-db-sql'] },
      ],
      prerequisites: [],
      estimatedMinutes: 75,
      difficulty: 'core',
      lessons: [
        {
          key: 'schema',
          title: 'Tables, keys, and relations',
          explanation:
            'Normalize enough to avoid update anomalies. Primary keys identify rows; foreign keys keep relations honest. Index columns you filter and join on.',
          objectiveKey: 'schema',
          questionKeys: ['q-db-mcq', 'q-db-short'],
          examples: ['users.id → orders.user_id with ON DELETE restrict for paid orders.'],
          mistakes: ['Storing lists of ids as a comma string instead of a join table.'],
        },
        {
          key: 'query',
          title: 'Queries and safety',
          explanation:
            'Prefer parameterized queries. Know when an index helps. Explain plans beat guessing. Transactions protect multi-step writes.',
          objectiveKey: 'query',
          questionKeys: ['q-db-sql'],
          examples: ['SELECT id, email FROM users WHERE email = $1'],
          mistakes: ['String-concatenating user input into SQL.'],
          codeBlocks: [
            {
              language: 'sql',
              code: 'SELECT o.id, o.total\nFROM orders o\nJOIN users u ON u.id = o.user_id\nWHERE u.email = $1;',
            },
          ],
        },
      ],
      resources: [],
      questions: [
        {
          key: 'q-db-mcq',
          lessonKey: 'schema',
          objectiveKey: 'schema',
          type: 'mcq',
          prompt: 'What does a foreign key primarily enforce?',
          options: [
            { id: 'ref', label: 'That related rows reference an existing parent row.' },
            { id: 'fast', label: 'That every SELECT runs under 1ms.' },
          ],
        },
        {
          key: 'q-db-short',
          lessonKey: 'schema',
          objectiveKey: 'schema',
          type: 'short',
          prompt: 'Why index a foreign key column you join on frequently?',
        },
        {
          key: 'q-db-sql',
          lessonKey: 'query',
          objectiveKey: 'query',
          type: 'sql',
          prompt: 'Write a parameterized SQL query that fetches orders for a user email (use $1).',
        },
      ],
      tasks: [],
      completionSummary: 'Verified when schema and query objectives pass.',
      nextActionTemplate: 'Finish schema basics, then write a parameterized query.',
    },
    {
      passLine: 70,
      questions: {
        'q-db-mcq': { correctOptionId: 'ref' },
        'q-db-short': { keywords: ['join', 'index', 'lookup', 'scan', 'performance'] },
        'q-db-sql': { testHints: ['select', 'join', '$1', 'orders', 'users'], keywords: ['select', '$1', 'join'] },
      },
      tasks: {},
    },
  );
}

export function cicdPackage(skillId: string) {
  return pack(
    skillId,
    'CI/CD',
    {
      careerTitle: 'Backend Developer',
      dailyHours: 2,
      phase: 'D60',
      objectives: [
        { key: 'pipeline', title: 'Describe a CI pipeline', questionKeys: ['q-ci-mcq', 'q-ci-short'] },
        { key: 'deploy', title: 'Separate build from deploy', questionKeys: ['q-ci-scenario'] },
      ],
      prerequisites: [],
      estimatedMinutes: 60,
      difficulty: 'core',
      lessons: [
        {
          key: 'ci',
          title: 'Continuous integration',
          explanation:
            'CI runs install, lint, test, and build on every change so broken main is rare. Keep pipelines fast and deterministic. Secrets stay in the CI vault, not in the repo.',
          objectiveKey: 'pipeline',
          questionKeys: ['q-ci-mcq', 'q-ci-short'],
          examples: ['On pull request: npm ci → lint → test → build artifact.'],
          mistakes: ['Skipping tests on main because “it worked on my machine”.'],
        },
        {
          key: 'cd',
          title: 'Continuous delivery',
          explanation:
            'CD promotes a built artifact through environments with approvals when needed. Build once; deploy the same artifact. Rollbacks need a previous known-good artifact.',
          objectiveKey: 'deploy',
          questionKeys: ['q-ci-scenario'],
          examples: ['Tag image sha; staging then production use the same digest.'],
          mistakes: ['Rebuilding differently for production than for CI.'],
        },
      ],
      resources: [],
      questions: [
        {
          key: 'q-ci-mcq',
          lessonKey: 'ci',
          objectiveKey: 'pipeline',
          type: 'mcq',
          prompt: 'What belongs in a basic CI pipeline for a Node API?',
          options: [
            { id: 'checks', label: 'Install dependencies, run tests, and produce a build artifact.' },
            { id: 'prod', label: 'SSH into production and edit files by hand.' },
          ],
        },
        {
          key: 'q-ci-short',
          lessonKey: 'ci',
          objectiveKey: 'pipeline',
          type: 'short',
          prompt: 'Why keep secrets out of the git repository in a CI setup?',
        },
        {
          key: 'q-ci-scenario',
          lessonKey: 'cd',
          objectiveKey: 'deploy',
          type: 'scenario',
          prompt: 'Staging passed on image digest abc. Production rebuilds from a different commit. What is wrong?',
        },
      ],
      tasks: [
        {
          key: 'ci-config',
          prompt: 'Paste a public GitHub URL that contains a CI workflow file (for example GitHub Actions).',
          required: true,
          evidenceKind: 'github',
        },
      ],
      completionSummary: 'Verified when objectives pass and CI config evidence is verified.',
      nextActionTemplate: 'Cover CI checks, then delivery, then submit a workflow repo.',
    },
    {
      passLine: 70,
      questions: {
        'q-ci-mcq': { correctOptionId: 'checks' },
        'q-ci-short': { keywords: ['secret', 'leak', 'vault', 'env', 'commit'] },
        'q-ci-scenario': { keywords: ['same', 'artifact', 'digest', 'rebuild', 'promote'] },
      },
      tasks: { 'ci-config': { requiresGithub: true, evidenceKind: 'github' } },
    },
  );
}

export const RICH_SKILL_BUILDERS: Record<string, (skillId: string) => ReturnType<typeof pack>> = {
  'Prompting Techniques': promptingTechniquesPackage,
  RAG: ragPackage,
  'Code Reviews': codeReviewsPackage,
  'Relational Databases': relationalDatabasesPackage,
  'CI/CD': cicdPackage,
};

export const DEMO_SKILLS: Array<{ name: string; category: string; conceptual?: boolean; rich?: boolean }> = [
  { name: 'Prompting Techniques', category: 'AI', conceptual: true, rich: true },
  { name: 'RAG', category: 'AI', rich: true },
  { name: 'Code Reviews', category: 'Engineering', conceptual: true, rich: true },
  { name: 'Relational Databases', category: 'Data', conceptual: true, rich: true },
  { name: 'CI/CD', category: 'Engineering', rich: true },
  { name: 'Documentation Generation', category: 'Engineering', conceptual: true },
  { name: 'Gemini', category: 'AI', conceptual: true },
  { name: 'OpenAI', category: 'AI', conceptual: true },
  { name: 'Anthropic', category: 'AI', conceptual: true },
  { name: 'Refactoring', category: 'Engineering' },
  { name: 'Streaming', category: 'AI', conceptual: true },
  { name: 'Structured Outputs', category: 'AI', conceptual: true },
  { name: 'Function Calling', category: 'AI', conceptual: true },
  { name: 'Vectors', category: 'AI', conceptual: true },
  { name: 'Embeddings', category: 'AI', conceptual: true },
  { name: 'MCP', category: 'AI', conceptual: true },
  { name: 'Agents', category: 'AI', conceptual: true },
  { name: 'OpenAPI Specs', category: 'Engineering', conceptual: true },
  { name: 'NoSQL', category: 'Data', conceptual: true },
  { name: 'Web Security', category: 'Engineering', conceptual: true },
  { name: 'Testing', category: 'Engineering' },
  { name: 'Architectural Patterns', category: 'Engineering', conceptual: true },
  { name: 'Message Brokers', category: 'Engineering' },
  { name: 'Throttling', category: 'Engineering', conceptual: true },
  { name: 'DNS', category: 'Infrastructure', conceptual: true },
  { name: 'Real-Time Data', category: 'Data' },
  { name: 'InfluxDB', category: 'Data' },
  { name: 'AI-assisted coding', category: 'AI', conceptual: true },
];
