/**
 * Writes a labelling file for the M6 quality gate. Read-only against the database.
 * Picks open market jobs round-robin across companies (so one company cannot dominate) and pre-fills each label with
 * the current prediction; a human corrects "label" and sets "labelled": true.
 *
 * Usage (from backend/): npx ts-node scripts/market/export-label-sample.ts [--size 60] [--out <file>]
 * The file holds posting text: keep it local, do not commit it.
 */
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaClient } from '../../src/prisma/client';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

async function main() {
  const size = Math.min(Math.max(Number(opt('--size', '60')), 1), 500);
  const out = opt('--out', join(tmpdir(), 'market-label-sample.json'));
  const prisma = new PrismaClient();
  const jobs = await prisma.marketJob.findMany({
    where: { status: 'OPEN' },
    orderBy: [{ companyId: 'asc' }, { firstSeenAt: 'asc' }],
    select: {
      id: true,
      title: true,
      sourceCount: true,
      primaryRawJobId: true,
      company: { select: { id: true, name: true } },
      careers: { select: { career: { select: { slug: true } } } },
      skills: { select: { rawName: true, normalizedName: true, level: true, skill: { select: { name: true } } } },
      rawJobs: { select: { id: true, url: true, rawDescription: true, source: { select: { type: true } } } },
    },
  });

  const byCompany = new Map<string, typeof jobs>();
  for (const j of jobs) byCompany.set(j.company.id, [...(byCompany.get(j.company.id) ?? []), j]);
  const picked: typeof jobs = [];
  const queues = [...byCompany.values()];
  for (let round = 0; picked.length < size && queues.some((q) => q.length > round); round += 1) {
    for (const q of queues) if (q[round] && picked.length < size) picked.push(q[round]);
  }

  const items = picked.map((j) => {
    const primary = j.rawJobs.find((r) => r.id === j.primaryRawJobId) ?? j.rawJobs[0];
    const skills = [...new Map(j.skills.map((s) => [s.normalizedName, { name: s.skill?.name ?? s.rawName, level: s.level }])).values()];
    const careers = [...new Set(j.careers.map((c) => c.career.slug))];
    return {
      marketJobId: j.id,
      company: j.company.name,
      title: j.title,
      sources: j.rawJobs.map((r) => ({ type: r.source.type, url: r.url })),
      description: primary?.rawDescription ?? null,
      predicted: { careers, skills },
      labelled: false,
      label: {
        careers,
        skills: skills.map((s) => s.name),
        falseMerge: j.sourceCount > 1 ? false : undefined,
      },
    };
  });

  writeFileSync(
    out,
    JSON.stringify(
      {
        instructions:
          'For each item: fix label.careers (career slugs; [] if none apply), label.skills (every technical skill the posting asks for), ' +
          'and for merged jobs set label.falseMerge to true if the sources are different vacancies. Then set labelled to true.',
        exportedAt: new Date().toISOString(),
        companies: byCompany.size,
        items,
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${items.length} jobs from ${new Set(items.map((i) => i.company)).size} companies to ${out}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
