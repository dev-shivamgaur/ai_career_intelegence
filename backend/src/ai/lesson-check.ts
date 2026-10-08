import type { GuidanceLevel } from './skill-guidance';
import type { Seniority } from './evidence.service';

export type CheckQuestion = {
  id: string;
  prompt: string;
  rubric: string;
};

export type CheckBand = 'foundation' | 'medium' | 'applied';

export function checkBand(educationLevel: string, seniority: Seniority): CheckBand {
  if (seniority === 'job') return 'applied';
  const edu = educationLevel.toUpperCase();
  if (edu === 'HIGH_SCHOOL' || edu === 'INTERMEDIATE') return 'foundation';
  return 'medium';
}

export function prepareWhere(skill: string, role: string, learningStyle: string): string[] {
  const s = skill.trim() || 'this topic';
  const r = role.trim() || 'your target role';
  const style = learningStyle.toUpperCase();
  const lines = [
    `Official documentation of ${s} (search it yourself — we do not send you a third-party syllabus page).`,
    `One small artefact you can finish in a sitting that a ${r} would actually use.`,
  ];
  if (style === 'COURSE') {
    lines.push(`Your current course or college lab for ${s}: redo one exercise without copying the sample.`);
  } else if (style === 'READING') {
    lines.push(`Read one chapter or doc page, then write five lines in your own words — not a definition copied from the heading.`);
  } else {
    lines.push(`Build or change something in a repo/folder on your machine that uses ${s}.`);
  }
  lines.push(`Evidence: paste a short explanation of what you did, plus a link or file note. Repeating the skill name is not evidence.`);
  return lines;
}

export function localQuestions(
  skill: string,
  role: string,
  level: GuidanceLevel,
  band: CheckBand,
  count = 7,
  phase?: string | null,
): CheckQuestion[] {
  const s = skill.trim() || 'this topic';
  const r = role.trim() || 'your target role';
  const family = familyOf(s);
  const base = seedQuestions(s, r, level, band, family);
  const layered = phaseQuestions(s, r, phase);
  const seen = new Set<string>();
  const out: CheckQuestion[] = [];
  for (const item of [...layered, ...base]) {
    const key = item.prompt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, id: `q${out.length + 1}` });
    if (out.length >= count) break;
  }
  return out;
}

function phaseQuestions(s: string, place: string, phase?: string | null): CheckQuestion[] {
  const prompts = stackPrompts(s, place);
  const count = questionCountForPhase(phase);
  return prompts.slice(0, count).map((prompt, i) => q(`p${i + 1}`, prompt, 'Applied answer in this stack, not a definition.'));
}

export function questionCountForPhase(phase?: string | null): number {
  const p = (phase ?? 'D7').toUpperCase().replace(/[^0-9]/g, '');
  if (p === '30') return 15;
  if (p === '60') return 20;
  if (p === '90') return 25;
  if (p === '180') return 30;
  return 7;
}

/** Practical first, then applied, then production. Longer windows keep the harder tail. */
function stackPrompts(s: string, place: string): string[] {
  const p = place.trim() || 'your path';
  return [
    `In ${p} work, where is ${s} actually used? What goes in, and what should come out?`,
    `Describe the smallest ${p} task that uses ${s} and can be finished in one sitting.`,
    `What must you already be able to do in ${p} before ${s} is worth practicing?`,
    `What mistake makes ${s} look finished in ${p} when it is still wrong?`,
    `How would you check that ${s} worked in ${p} without repeating the skill name?`,
    `What would you leave out of a first ${p} attempt at ${s}, and why is that safe?`,
    `What proof would you keep after this week to show ${s} in ${p}?`,
    `Plan one ${p} piece of work that depends on ${s}. List the steps in the order you would do them.`,
    `Two ways to handle ${s} in ${p}. Which do you choose first, and what does the other cost?`,
    `How does ${s} connect to one other part of ${p} work?`,
    `Someone reviews your ${p} work on ${s}. What would they send back, and what would they accept?`,
    `How do you check ${s} in ${p} without redoing the whole job?`,
    `What would you measure after using ${s} in ${p} so you know it helped?`,
    `What must stay private or correct when ${s} is used in ${p}?`,
    `Walk through one failed ${p} case that involves ${s}. What do you record, and what do you not share?`,
    `What example or sample do you need before you can practice ${s} in ${p}?`,
    `After 30 days, what artefact shows you can use ${s} in ${p} without a guide open?`,
    `Something goes wrong in live ${p} work and ${s} is involved. What do you check first?`,
    `How does ${s} change time, cost, or risk in ${p}? Name one signal you would watch.`,
    `Describe an approach to ${s} in ${p} you would refuse, and the simpler one you would use.`,
    `What breaks if two people rely on ${s} in ${p} at the same time?`,
    `How do you undo a bad ${s} decision in ${p} without stopping all the other work?`,
    `Which nearby skill in ${p} is easy to get wrong once ${s} is in place?`,
    `Who should be allowed to use or change ${s} in ${p}, and how do you check a forbidden case?`,
    `${s} is the slow or expensive part of ${p} work. What do you look at before adding more people or tools?`,
    `If you had half the time for ${s} in ${p}, what would you drop, and what would still be true?`,
    `How do you tell a real problem with ${s} in ${p} from a false alarm?`,
    `What compatibility or handoff problem appears when ${s} changes in ${p}?`,
    `What evidence from real ${p} work would convince you someone is strong at ${s}?`,
    `Name one harder neighbor of ${s} in ${p} that should wait, and what fails if you start it now.`,
  ];
}

/** Hours from the topic itself, not a flat label. */
export function hoursForTopic(name: string, stretch = false): number {
  const n = name.toLowerCase();
  let hours = 3;
  if (/git|html|css|json|http/.test(n)) hours = 3;
  if (/javascript|typescript|node|express|react|sql|rest|api|auth|jwt|test/.test(n)) hours = 6;
  if (/postgres|mongo|redis|docker|prisma|nest|next|security|oauth/.test(n)) hours = 8;
  if (/kafka|kubernetes|graphql|microservice|queue|rabbit|system design|distributed/.test(n)) hours = 12;
  if (stretch) hours += 4;
  return hours;
}

function seedQuestions(
  s: string,
  r: string,
  level: GuidanceLevel,
  band: CheckBand,
  family: ReturnType<typeof familyOf>,
): CheckQuestion[] {

  if (level === 'missing') {
    return [
      q(
        'use',
        band === 'applied'
          ? `In a real ${r} task, when would you reach for ${s} versus skip it? Give a concrete situation from work, not a definition.`
          : `Describe one real task in ${r} work where ${s} is used. What goes in, what comes out? No dictionary sentence.`,
        'Names a situation, inputs/outputs, not a slogan.',
      ),
      q(
        'mistake',
        family === 'data'
          ? `Someone runs a slow query or loses data with ${s}. What is the first thing you check, and why?`
          : `What is a common mistake beginners make with ${s} on a ${r} team, and how would you catch it?`,
        'Specific failure, not “practice more”.',
      ),
      q(
        'proof',
        `What would you put on your profile as proof you used ${s} this week? Describe the artefact in 3–5 sentences.`,
        'Artefact details, not the skill name alone.',
      ),
    ];
  }

  if (family === 'data') {
    return [
      q(
        'tx',
        band === 'applied'
          ? `A checkout writes two tables. How do you keep them consistent with ${s}? What happens if the app dies mid-write?`
          : `When do you need a transaction in ${s}? Give a yes-example and a no-example for ${r} work.`,
        'Atomicity / consistency in their words.',
      ),
      q(
        'perf',
        band === 'foundation'
          ? `A list page is slow. What would you look at in ${s} before adding more servers?`
          : `How would you decide an index versus a schema change for a slow ${s} query? What would you measure?`,
        'Indexes/plans/pooling — not CREATE TABLE.',
      ),
      q(
        'ops',
        `How does a ${r} app typically talk to ${s} in production (connections, pooling, env)? What breaks if you open a new connection per request?`,
        'Pooling / connections, not install steps.',
      ),
    ];
  }

  if (family === 'http') {
    return [
      q(
        'contract',
        `Design one ${r} endpoint that uses ${s}. Status codes, request body, and one error case — no “REST is representational…” lecture.`,
        'Concrete contract.',
      ),
      q(
        'authz',
        `How do you keep this ${s} call from being used by the wrong user? One practical check.`,
        'Authn/authz, not a vendor name.',
      ),
      q(
        'proof',
        `What artefact proves you can ship ${s} (test, screenshot of a failing then passing call, or PR note)?`,
        'Artefact, not keyword.',
      ),
    ];
  }

  if (family === 'git') {
    return [
      q('branch', `You broke main. Walk through how you would fix it with ${s} without rewriting teammates’ history.`, 'Safe recovery.'),
      q('review', `What would you look for in a ${s} PR for a ${r} intern?`, 'Review judgment.'),
      q('proof', `What history on GitHub/GitLab would count as evidence you use ${s} daily?`, 'History, not logo.'),
    ];
  }

  return [
    q(
      'decision',
      band === 'applied'
        ? `You already use ${s}. What trade-off would you explain in a ${r} design review this week?`
        : `How would you use ${s} in a small ${r} project this week? Steps, not a definition.`,
      'Decision or steps.',
    ),
    q(
      'debug',
      `It fails in staging. First three checks related to ${s}?`,
      'Debug path.',
    ),
    q(
      'proof',
      `Describe evidence a hiring manager would believe for ${s} (repo, metric, or write-up).`,
      'Believable artefact.',
    ),
  ];
}

export function scoreAnswers(
  skill: string,
  questions: CheckQuestion[],
  answers: Array<{ id: string; text: string }>,
): { score: number; passed: boolean; feedback: string; per: Record<string, number> } {
  const skillBits = new Set(
    skill
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2),
  );
  const per: Record<string, number> = {};
  let total = 0;
  for (const qn of questions) {
    const raw = answers.find((a) => a.id === qn.id)?.text ?? '';
    const text = raw.trim();
    let pts = 0;
    if (text.length >= 60) pts += 40;
    else if (text.length >= 28) pts += 20;
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2);
    const unique = new Set(words);
    const extra = [...unique].filter((w) => !skillBits.has(w)).length;
    if (extra >= 8) pts += 40;
    else if (extra >= 4) pts += 25;
    else if (extra >= 2) pts += 10;
    if (/because|when|if |instead|measure|fail|error|index|transaction|pool|status|branch|review|audience|campaign|metric|budget|funnel|iam|vpc/i.test(text)) {
      pts += 20;
    }
    pts = Math.min(100, pts);
    per[qn.id] = pts;
    total += pts;
  }
  const score = questions.length ? Math.round(total / questions.length) : 0;
  const passed = score >= 55;
  const feedback = passed
    ? `Check score ${score}/100. Answers show you can talk about the work, not just the skill name.`
    : `Check score ${score}/100. Write real situations (what you would do), not a one-line definition of ${skill}.`;
  return { score, passed, feedback, per };
}

function familyOf(skill: string): 'data' | 'http' | 'git' | 'campaign' | 'cloud' | 'ui' | 'other' {
  const h = skill.toLowerCase();
  if (/sql|postgres|mysql|sqlite|mongo|redis|database|prisma/.test(h)) return 'data';
  if (/rest|http|api|json|graphql/.test(h)) return 'http';
  if (/\bgit\b|github|gitlab/.test(h)) return 'git';
  if (/seo|campaign|brand|content|copy|ads?|funnel|crm|email marketing|social/.test(h)) return 'campaign';
  if (/aws|azure|gcp|iam|vpc|cloudformation|terraform|s3|ec2/.test(h)) return 'cloud';
  if (/html|css|react|vue|figma|ui|ux|accessibility/.test(h)) return 'ui';
  return 'other';
}

function extraQuestions(
  s: string,
  r: string,
  band: CheckBand,
  family: ReturnType<typeof familyOf>,
): CheckQuestion[] {
  const tough = [
    q('tradeoff', `What would you drop if you had half the time/budget for ${s} on a ${r} team, and what would break?`, 'Trade-off.'),
    q('metric', `Name one metric that would prove ${s} is working, and one that can lie.`, 'Measurement.'),
    q('fail', `Walk through a failure of ${s} you have seen or would expect. First three checks?`, 'Debug.'),
    q('stack', `How does ${s} sit next to the rest of a ${r} stack (tools around it, not a definition)?`, 'Context.'),
    q('senior', band === 'applied' ? `What would you challenge in a peer’s ${s} work in review?` : `What would a senior look for in your ${s} artefact?`, 'Bar.'),
  ];
  if (family === 'campaign') {
    tough.push(q('audience', `Who is the audience for this ${s} work, and how would you change the message for a second segment?`, 'Audience.'));
  }
  if (family === 'cloud') {
    tough.push(q('iam', `Who should be allowed to change ${s} in production, and how would you prove it in an audit?`, 'Access.'));
  }
  return tough;
}

function q(id: string, prompt: string, rubric: string): CheckQuestion {
  return { id, prompt, rubric };
}
