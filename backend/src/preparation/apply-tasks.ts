import { skillMatches } from '../ai/skill-match';

export type ApplyTask = { id: string; relatedSkill: string | null; title: string; phase: string };

function phaseKey(phase: string) {
  return phase.toUpperCase().replace(/[^0-9]/g, '');
}

/**
 * Completes only tasks for this skill in the same phase as the task the learner opened.
 * No opened task means no roadmap writes.
 */
export function selectTasksForApply(tasks: ApplyTask[], skillName: string, opened: { id: string; phase: string } | null): string[] {
  if (!opened) return [];
  const openedPhase = phaseKey(opened.phase);
  const named = tasks.filter((task) => skillMatches(skillName, [task.relatedSkill ?? '', task.title]));
  if (!named.some((task) => task.id === opened.id)) return [];
  return named.filter((task) => phaseKey(task.phase) === openedPhase).map((task) => task.id);
}
