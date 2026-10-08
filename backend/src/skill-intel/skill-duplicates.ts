import { normalizeSkillName } from './skill-normalize';

export type DuplicateGroup = {
  normalizedName: string;
  skills: Array<{ id: string; name: string; category: string; references: number }>;
};

/** Report only: groups Skill rows that share a normalized name. Nothing is merged. */
export function findDuplicateGroups(
  skills: Array<{ id: string; name: string; category: string; references?: number }>,
): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();
  for (const s of skills) {
    const key = normalizeSkillName(s.name);
    if (!key) continue;
    const group = groups.get(key) ?? { normalizedName: key, skills: [] };
    group.skills.push({ id: s.id, name: s.name, category: s.category, references: s.references ?? 0 });
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((g) => g.skills.length > 1)
    .sort((a, b) => b.skills.length - a.skills.length || a.normalizedName.localeCompare(b.normalizedName));
}
