/**
 * Upserts demo skills, links them to a career, and publishes PrepPackages.
 * Run: npx ts-node -r tsconfig-paths/register scripts/seed-prep-packages.ts
 * Or:  npx ts-node scripts/seed-prep-packages.ts
 */
import { PrismaClient, PrepPackageStatus, Priority, RequirementType } from '../src/prisma/client';
import { buildDeterministicPackage, genericCareerScope } from '../src/preparation/package-builder';
import { DEMO_SKILLS, RICH_SKILL_BUILDERS } from '../src/preparation/seed-packages';

const prisma = new PrismaClient();

async function ensureCareer() {
  const existing = await prisma.career.findFirst({
    where: { OR: [{ slug: 'backend-developer' }, { slug: 'ai-engineer' }] },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;
  return prisma.career.create({
    data: {
      title: 'Backend Developer',
      slug: 'backend-developer',
      overview: 'Build APIs, data stores, and reliable services.',
      marketExpectations: 'Strong fundamentals in APIs, databases, and delivery.',
      entryLevelExpectations: 'Can ship a small service with tests and a clear schema.',
      coreTopics: DEMO_SKILLS.slice(0, 12).map((s) => s.name),
    },
  });
}

async function main() {
  const career = await ensureCareer();
  const skillIds = new Map<string, string>();

  for (const row of DEMO_SKILLS) {
    const skill = await prisma.skill.upsert({
      where: { name: row.name },
      update: { category: row.category },
      create: { name: row.name, category: row.category },
    });
    skillIds.set(row.name, skill.id);

    const requirement = await prisma.careerSkillRequirement.findFirst({
      where: { careerId: career.id, skillId: skill.id },
    });
    if (!requirement) {
      await prisma.careerSkillRequirement.create({
        data: {
          careerId: career.id,
          skillId: skill.id,
          importance: Priority.MEDIUM,
          type: RequirementType.REQUIRED,
          layer: 'CORE',
          source: 'SEED',
        },
      });
    }

    const existing = await prisma.prepPackage.findFirst({
      where: { skillId: skill.id, careerScope: genericCareerScope(), status: PrepPackageStatus.PUBLISHED },
      orderBy: { version: 'desc' },
    });
    if (existing) {
      console.log(`skip published ${row.name} v${existing.version}`);
      continue;
    }

    const latest = await prisma.prepPackage.findFirst({
      where: { skillId: skill.id, careerScope: genericCareerScope() },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    let content;
    let rubric;
    let contentHash: string;
    if (row.rich && RICH_SKILL_BUILDERS[row.name]) {
      const built = RICH_SKILL_BUILDERS[row.name](skill.id);
      content = built.content;
      rubric = built.rubric;
      contentHash = built.contentHash;
    } else {
      const built = buildDeterministicPackage({
        skillId: skill.id,
        skillName: skill.name,
        careerTitle: career.title,
        prerequisites: [],
        resources: [],
        dailyHours: null,
        phase: 'D30',
        conceptual: Boolean(row.conceptual),
      });
      content = built.content;
      rubric = built.rubric;
      contentHash = built.contentHash;
    }

    await prisma.prepPackage.create({
      data: {
        skillId: skill.id,
        careerScope: genericCareerScope(),
        version,
        content,
        rubric,
        contentHash,
        status: PrepPackageStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    console.log(`published ${row.name} v${version}${row.rich ? ' (rich)' : ''}`);
  }

  const topics = DEMO_SKILLS.map((s) => s.name);
  await prisma.career.update({
    where: { id: career.id },
    data: { coreTopics: topics },
  });
  console.log(`career ${career.slug} coreTopics updated (${topics.length})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
