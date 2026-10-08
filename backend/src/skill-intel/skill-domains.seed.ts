export type SkillDomainSeed = { key: string; label: string; sortOrder: number; parentKey?: string };

/** Initial controlled vocabulary. Admins can add more; the seed never overwrites admin edits. */
export const SKILL_DOMAIN_SEED: SkillDomainSeed[] = [
  { key: 'programming-language', label: 'Programming languages', sortOrder: 10 },
  { key: 'core-backend', label: 'Backend frameworks & APIs', sortOrder: 20 },
  { key: 'frontend', label: 'Frontend', sortOrder: 30 },
  { key: 'mobile', label: 'Mobile', sortOrder: 40 },
  { key: 'database', label: 'Databases', sortOrder: 50 },
  { key: 'cloud', label: 'Cloud platforms', sortOrder: 60 },
  { key: 'devops', label: 'DevOps & infrastructure', sortOrder: 70 },
  { key: 'messaging', label: 'Messaging & streaming', sortOrder: 80 },
  { key: 'testing', label: 'Testing & quality', sortOrder: 90 },
  { key: 'security', label: 'Security & auth', sortOrder: 100 },
  { key: 'data', label: 'Data engineering & analytics', sortOrder: 110 },
  { key: 'ai-ml', label: 'AI & machine learning', sortOrder: 120 },
  { key: 'system-design', label: 'System design & architecture', sortOrder: 130 },
  { key: 'tooling', label: 'Developer tooling', sortOrder: 140 },
];
