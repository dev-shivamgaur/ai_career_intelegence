/**
 * M1 backfill. Idempotent. Dry run unless --apply is passed.
 *   npx ts-node --transpile-only scripts/skill-intel/backfill-m1.ts [--apply]
 *
 * 1. Seeds SkillDomain rows (never overwrites admin edits).
 * 2. Fills Skill.normalizedName.
 * 3. Sets Skill.domainId for seeded canonical skills that have no domain yet.
 * 4. Seeds SkillAlias rows for canonical skills that already exist (never creates Skill rows).
 * 5. Infers CareerSkillRequirement.source = ROADMAP from completed ingest job results; others stay LEGACY.
 * 6. Writes a duplicate-skill report (no merges).
 *
 * Uses raw UPDATEs so Skill.updatedAt is not bumped and existing rows keep their timestamps.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '../../generated/prisma';
import { normalizeSkillName } from '../../src/skill-intel/skill-normalize';
import { SKILL_DOMAIN_SEED } from '../../src/skill-intel/skill-domains.seed';
import { CANONICAL_SKILL_SEED } from '../../src/skill-intel/skill-aliases.seed';
import { findDuplicateGroups } from '../../src/skill-intel/skill-duplicates';

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function seedDomains() {
  const existing = new Map((await prisma.skillDomain.findMany()).map((d) => [d.key, d]));
  let created = 0;
  for (const seed of SKILL_DOMAIN_SEED) {
    if (existing.has(seed.key)) continue;
    created += 1;
    if (apply) await prisma.skillDomain.create({ data: { key: seed.key, label: seed.label, sortOrder: seed.sortOrder } });
  }
  return { created, alreadyPresent: SKILL_DOMAIN_SEED.length - created };
}

async function backfillNormalizedNames() {
  const skills = await prisma.skill.findMany({ select: { id: true, name: true, normalizedName: true } });
  let updated = 0;
  for (const s of skills) {
    const key = normalizeSkillName(s.name) || null;
    if (s.normalizedName === key) continue;
    updated += 1;
    if (apply) await prisma.$executeRaw`UPDATE skill SET "normalizedName" = ${key} WHERE id = ${s.id}`;
  }
  return { skills: skills.length, updated };
}

type SkillRow = { id: string; name: string; domainId: string | null; createdAt: Date };

function findTarget(seed: (typeof CANONICAL_SKILL_SEED)[number], skills: SkillRow[], byNormalized: Map<string, SkillRow[]>) {
  const exact = skills.find((s) => s.name === seed.name);
  if (exact) return exact;
  for (const key of [seed.name, ...seed.aliases].map(normalizeSkillName)) {
    const rows = byNormalized.get(key);
    if (rows?.length) return rows[0];
  }
  return null;
}

async function seedDomainsAndAliases() {
  const domains = new Map((await prisma.skillDomain.findMany()).map((d) => [d.key, d.id]));
  const skills: SkillRow[] = await prisma.skill.findMany({
    select: { id: true, name: true, domainId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const byNormalized = new Map<string, SkillRow[]>();
  for (const s of skills) {
    const key = normalizeSkillName(s.name);
    byNormalized.set(key, [...(byNormalized.get(key) ?? []), s]);
  }
  const aliasRows = await prisma.skillAlias.findMany({ select: { normalizedAlias: true } });
  const taken = new Set(aliasRows.map((a) => a.normalizedAlias));

  const missingCanonical: string[] = [];
  let domainsSet = 0;
  let aliasesCreated = 0;
  for (const seed of CANONICAL_SKILL_SEED) {
    const target = findTarget(seed, skills, byNormalized);
    if (!target) {
      missingCanonical.push(seed.name);
      continue;
    }
    const domainId = domains.get(seed.domain);
    if (domainId && !target.domainId) {
      domainsSet += 1;
      if (apply) await prisma.$executeRaw`UPDATE skill SET "domainId" = ${domainId} WHERE id = ${target.id}`;
      target.domainId = domainId;
    }
    const targetKey = normalizeSkillName(target.name);
    for (const alias of [seed.name, ...seed.aliases]) {
      const key = normalizeSkillName(alias);
      if (!key || key === targetKey || taken.has(key)) continue;
      taken.add(key);
      aliasesCreated += 1;
      if (apply) {
        await prisma.skillAlias.create({
          data: { skillId: target.id, alias, normalizedAlias: key, status: 'APPROVED', source: 'SEED' },
        });
      }
    }
  }
  return { canonical: CANONICAL_SKILL_SEED.length, missingCanonical, domainsSet, aliasesCreated };
}

async function inferProvenance() {
  const jobs = await prisma.ingestCareerJob.findMany({
    where: { status: 'COMPLETED' },
    select: { careerId: true, result: true, finishedAt: true },
    orderBy: { finishedAt: 'asc' },
  });
  let candidates = 0;
  let updated = 0;
  for (const job of jobs) {
    const result = (job.result ?? {}) as { added?: unknown; source?: unknown };
    const added = Array.isArray(result.added) ? result.added.filter((n): n is string => typeof n === 'string') : [];
    if (!added.length) continue;
    const sourceRef = typeof result.source === 'string' ? result.source : null;
    const rows = await prisma.careerSkillRequirement.findMany({
      where: { careerId: job.careerId, source: 'LEGACY', skill: { name: { in: added } } },
      select: { id: true },
    });
    candidates += rows.length;
    for (const row of rows) {
      updated += 1;
      if (apply) {
        await prisma.$executeRaw`UPDATE career_skill_requirement SET source = 'ROADMAP', "sourceRef" = ${sourceRef}, "lastSeenAt" = ${job.finishedAt} WHERE id = ${row.id} AND source = 'LEGACY'`;
      }
    }
  }
  return { completedJobs: jobs.length, candidates, updated };
}

async function duplicateReport() {
  const skills = await prisma.skill.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      _count: { select: { userSkills: true, careerRequirements: true, jobSkills: true, skillGaps: true } },
    },
  });
  const groups = findDuplicateGroups(
    skills.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      references: s._count.userSkills + s._count.careerRequirements + s._count.jobSkills + s._count.skillGaps,
    })),
  );
  const dir = join(__dirname, '..', '..', '..', 'docs', 'reports');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'm1-skill-duplicates.json');
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), totalSkills: skills.length, groups }, null, 2));
  return { totalSkills: skills.length, duplicateGroups: groups.length, file };
}

async function main() {
  console.log(apply ? 'M1 backfill: APPLY' : 'M1 backfill: DRY RUN (pass --apply to write)');
  console.log('domains', await seedDomains());
  console.log('normalizedName', await backfillNormalizedNames());
  console.log('domains+aliases', await seedDomainsAndAliases());
  console.log('provenance', await inferProvenance());
  console.log('duplicates', await duplicateReport());
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
