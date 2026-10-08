import { buildIndex, resolveWithIndex } from './skill-resolver.service';
import { normalizeSkillName, wordTokens } from './skill-normalize';

describe('normalizeSkillName', () => {
  it.each([
    ['Node.js', 'nodejs'],
    ['NodeJS', 'nodejs'],
    ['node js', 'nodejs'],
    ['C++', 'cpp'],
    ['C#', 'csharp'],
    ['.NET', 'dotnet'],
    ['ASP.NET Core', 'aspdotnetcore'],
    ['Spring Boot', 'springboot'],
    ['  ', ''],
  ])('%s -> %s', (raw, key) => {
    expect(normalizeSkillName(raw)).toBe(key);
  });
});

describe('wordTokens', () => {
  it('keeps java and javascript distinct', () => {
    expect(wordTokens('JavaScript developer')).toEqual(['javascript', 'developer']);
    expect(wordTokens('Node.js, C++ and C#')).toEqual(['nodejs', 'cpp', 'and', 'csharp']);
  });
});

describe('resolveWithIndex', () => {
  const skills = [
    { id: 's-node', name: 'Node.js' },
    { id: 's-pg', name: 'PostgreSQL' },
    { id: 's-java', name: 'Java' },
    { id: 's-js', name: 'JavaScript' },
    { id: 's-react', name: 'React' },
    { id: 's-react-dup', name: 'react' },
    { id: 's-k8s', name: 'Kubernetes' },
  ];
  const index = buildIndex(skills, [
    { normalizedAlias: 'postgres', skill: skills[1] },
    { normalizedAlias: 'psql', skill: skills[1] },
  ]);

  it('resolves exact names first', () => {
    expect(resolveWithIndex('react', index)).toMatchObject({ skillId: 's-react-dup', method: 'EXACT', confidence: 1 });
  });

  it('resolves normalized names to the oldest row', () => {
    expect(resolveWithIndex('NodeJS', index)).toMatchObject({ skillId: 's-node', method: 'NORMALIZED' });
    expect(resolveWithIndex('REACT', index)).toMatchObject({ skillId: 's-react', method: 'NORMALIZED' });
    expect(index.ambiguousNormalized).toBe(1);
  });

  it('resolves approved aliases', () => {
    expect(resolveWithIndex('Postgres', index)).toMatchObject({ skillId: 's-pg', method: 'ALIAS', confidence: 0.9 });
    expect(resolveWithIndex('PSQL', index)).toMatchObject({ skillId: 's-pg', method: 'ALIAS' });
  });

  it('uses the lexicon only for short single-hit names', () => {
    expect(resolveWithIndex('k8s', index)).toMatchObject({ skillId: 's-k8s', method: 'LEXICON', confidence: 0.75 });
    expect(resolveWithIndex('Java Spring', index).method).toBe('NONE');
  });

  it('never matches by substring', () => {
    expect(resolveWithIndex('Javanese', index).method).toBe('NONE');
    expect(resolveWithIndex('Go', index).method).toBe('NONE');
  });

  it('returns NONE for empty input', () => {
    expect(resolveWithIndex('   ', index)).toMatchObject({ skillId: null, method: 'NONE', confidence: 0 });
  });
});
