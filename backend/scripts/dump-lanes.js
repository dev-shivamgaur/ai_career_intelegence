const { PrismaClient } = require('../generated/prisma');
const p = new PrismaClient();
(async () => {
  const careers = await p.career.findMany({
    select: { slug: true, title: true, coreTopics: true, stackLanes: true },
  });
  console.log(
    JSON.stringify(
      careers.map((c) => ({
        slug: c.slug,
        title: c.title,
        core: (c.coreTopics || []).slice(0, 20),
        lanes: c.stackLanes,
      })),
      null,
      2,
    ),
  );
  const reqs = await p.careerSkillRequirement.findMany({
    include: { skill: true, career: true },
  });
  const grouped = {};
  for (const r of reqs) {
    const k = `${r.career.slug}|${r.stackLane || 'core'}|${r.layer}`;
    (grouped[k] = grouped[k] || []).push(r.skill.name);
  }
  console.log('REQS');
  console.log(JSON.stringify(grouped, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
