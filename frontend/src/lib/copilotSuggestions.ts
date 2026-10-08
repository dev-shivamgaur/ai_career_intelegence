import type { Profile } from "@/types";

function examLabel(profile: Profile) {
  return profile.targetExamName || profile.careerGoal?.title || "this exam";
}

function examSlug(profile: Profile) {
  return `${profile.targetExamSlug ?? ""} ${profile.careerGoal?.slug ?? ""}`.toLowerCase();
}

function roleLabel(profile: Profile) {
  const title = profile.careerGoal?.title?.trim();
  if (title && title !== "Not selected") return title;
  const goal = profile.prepGoalText?.trim();
  if (goal) return goal;
  return "this role";
}

function knownSkill(profile: Profile) {
  const strong = profile.skills.find((s) => s.status === "strong" || s.proficiency >= 50);
  return strong?.name || profile.skills[0]?.name;
}

function sarkariChips(profile: Profile) {
  const exam = examLabel(profile);
  const slug = examSlug(profile);
  const hours = profile.availableHoursPerDay || 2;
  const chips = [
    `Am I eligible for ${exam} on age and education?`,
    `What should I study next for ${exam}?`,
    `I have ${hours} hours a day — plan ${exam} for this week.`,
  ];

  if (/\bcgl\b|ssc/.test(slug)) {
    chips.push(`How should I start Quantitative Aptitude for ${exam}?`);
    chips.push(`For ${exam}, should I focus on Reasoning, GA, or English first?`);
  } else if (/ibps|bank|\bpo\b|clerk|sbi/.test(slug)) {
    chips.push(`How do I prepare puzzles and data interpretation for ${exam}?`);
    chips.push(`What banking awareness should I cover first for ${exam}?`);
  } else if (/ntpc|rrb|railway/.test(slug)) {
    chips.push(`What is a CBT 1 study plan for ${exam}?`);
    chips.push(`How should I cover maths and GK for ${exam}?`);
  } else if (/upsc|cse|\bias\b/.test(slug)) {
    chips.push(`How do I start GS for ${exam} with my current education?`);
    chips.push(`What should my daily answer-writing look like for ${exam}?`);
  } else if (/afcat|cds|nda|defence|air\s*force|navy|army/.test(slug)) {
    chips.push(`Which written papers matter first for ${exam}?`);
    chips.push(`How should I use my 10th and 12th papers for ${exam} eligibility?`);
  } else {
    chips.push(`Did you read my 10th and 12th marksheets for ${exam}?`);
    chips.push(`Which ${exam} subject should I tick next?`);
  }

  return chips.slice(0, 6);
}

function privateChips(profile: Profile) {
  const role = roleLabel(profile);
  const hours = profile.availableHoursPerDay || 2;
  const stack = profile.evidence?.stackLabel || profile.primaryStack;
  const skill = knownSkill(profile);
  const chips = [
    `What should I learn next for ${role}?`,
    `How close am I to a junior ${role} job?`,
    `I have ${hours} hours per day. Make a ${role} plan.`,
  ];
  if (skill) chips.push(`I already know ${skill}. What is next for ${role}?`);
  if (stack) chips.push(`Should I stay on ${stack} for ${role}?`);
  else chips.push(`Which skill should I prioritize for ${role}?`);
  chips.push(`Give me a 7-day practice plan for the weakest ${role} skill.`);
  chips.push(`How do I prove ${skill || "my top skill"} with a project a recruiter can open?`);
  return chips.slice(0, 6);
}

export function copilotSuggestionChips(profile?: Profile | null): string[] {
  if (!profile) {
    return ["What should I learn next from my saved profile?"];
  }
  if (profile.careerTrack === "government_exam") return sarkariChips(profile);
  return privateChips(profile);
}

export function copilotWelcome(profile?: Profile | null) {
  if (!profile) {
    return "I use your saved profile and documents. Pick a suggestion or ask a question.";
  }
  if (profile.careerTrack === "government_exam") {
    const exam = examLabel(profile);
    return `I will answer from your marksheets, eligibility flags, and the ${exam} catalog we store — not from random private-tech stacks.`;
  }
  const role = roleLabel(profile);
  return `I compare your resume, skills, and documents to the ${role} syllabus we store for you. I will not send you to another site to study.`;
}
