/**
 * M6 go / no-go gate. Read-only against the database.
 * Scores the current predictions against a hand-labelled file from export-label-sample.ts, then adds the live
 * unresolved-skill rate and the run of clean fetch runs. Exit code 0 = GO, 2 = FIX.
 *
 * Usage (from backend/): npx ts-node scripts/market/quality-gate.ts --file <labels.json> [--min-confidence 0.6]
 * Predicted careers are the whole-career assignments at or above the confidence that demand counts (M8 accept: ≥ 0.90 precision).
 */
import { readFileSync } from 'fs';
import { INTEL_DEFAULTS } from '../../src/intel-config/intel-config.defaults';
import { PrismaClient } from '../../src/prisma/client';
import { normalizeSkillName } from '../../src/skill-intel/skill-normalize';
import { SkillResolverService } from '../../src/skill-intel/skill-resolver.service';
import { GATE_TARGETS, evaluateSample, gateVerdict, type GateItem } from '../../src/market/slice/quality-gate';

type LabelFile = { items: Array<{ marketJobId: string; labelled: boolean; label: { careers: string[]; skills: string[]; falseMerge?: boolean } }> };

async function main() {
  const i = process.argv.indexOf('--file');
  if (i < 0) throw new Error('Usage: quality-gate.ts --file <labels.json>');
  const file = JSON.parse(readFileSync(process.argv[i + 1], 'utf8')) as LabelFile;
  const labelled = file.items.filter((x) => x.labelled);
  const prisma = new PrismaClient();
  const resolver = new SkillResolverService(prisma as never);
  const keyOf = async (names: string[]) => {
    const res = await resolver.resolveMany(names);
    return res.map((r, n) => r.skillId ?? `n:${normalizeSkillName(names[n])}`);
  };

  const confArg = process.argv.indexOf('--min-confidence');
  const minConf = confArg >= 0 ? Number(process.argv[confArg + 1]) : INTEL_DEFAULTS.demand.minClassificationConfidence;
  const jobs = await prisma.marketJob.findMany({
    where: { id: { in: labelled.map((x) => x.marketJobId) } },
    select: {
      id: true,
      careers: { where: { laneKey: 'all', confidence: { gte: minConf } }, select: { career: { select: { slug: true } } } },
      skills: { select: { skillId: true, normalizedName: true } },
    },
  });
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const items: GateItem[] = [];
  for (const x of labelled) {
    const job = byId.get(x.marketJobId);
    if (!job) {
      console.warn(`skipped ${x.marketJobId}: no longer in the database`);
      continue;
    }
    items.push({
      label: { careers: x.label.careers, skills: await keyOf(x.label.skills), falseMerge: x.label.falseMerge },
      predicted: {
        careers: [...new Set(job.careers.map((c) => c.career.slug))],
        skills: [...new Set(job.skills.map((s) => s.skillId ?? `n:${s.normalizedName}`))],
      },
    });
  }

  const [totals] = await prisma.$queryRaw<Array<{ total: number; unresolved: number }>>`
    SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE s."skillId" IS NULL)::int AS unresolved
    FROM "market_job_skill" s JOIN "market_job" j ON j.id = s."marketJobId" WHERE j.status = 'OPEN'`;
  const runs = await prisma.marketRun.findMany({ where: { kind: 'FETCH' }, orderBy: { createdAt: 'desc' }, take: 10, select: { status: true } });
  let clean = 0;
  for (const r of runs) {
    if (r.status !== 'COMPLETED') break;
    clean += 1;
  }

  const metrics = {
    ...evaluateSample(items),
    unresolvedRate: totals.total ? Math.round((totals.unresolved / totals.total) * 1000) / 1000 : null,
    consecutiveCleanRuns: clean,
  };
  const { checks, verdict } = gateVerdict(metrics, GATE_TARGETS);
  for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}: ${c.value ?? 'n/a'} (target ${c.target})`);
  console.log(JSON.stringify({ extraction: metrics.extraction, classification: metrics.classification }));
  console.log(`VERDICT: ${verdict}`);
  await prisma.$disconnect();
  process.exit(verdict === 'GO' ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
