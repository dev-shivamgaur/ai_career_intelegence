-- Deterministic snapshot of what the existing comparison produced (skill gaps, fit score, want-list).
-- Compare before/after a phase: psql -tA -f comparison-snapshot.sql > before.txt
SELECT 'gap|' || g."userId" || '|' || s.name || '|' || g."currentStatus" || '|' || g.required || '|' || g.priority || '|' || g."estimatedHours" || '|' || md5(coalesce(g.why::text, ''))
FROM skill_gap g JOIN skill s ON s.id = g."skillId"
UNION ALL
SELECT 'goal|' || cg."userId" || '|' || cg."careerId" || '|' || cg."isActive" || '|' || coalesce(cg."estimatedMatch"::text, '') || '|' || md5(coalesce(cg.breakdown::text, ''))
       || '|' || md5(array_to_string(cg."missingAreas", ',')) || '|' || md5(array_to_string(cg."strongAreas", ',')) || '|' || coalesce(cg."lastAnalyzedAt"::text, '')
FROM career_goal cg
UNION ALL
SELECT 'req|' || r."careerId" || '|' || s.name || '|' || r.layer || '|' || coalesce(r."stackLane", '') || '|' || r.type || '|' || r.importance
FROM career_skill_requirement r JOIN skill s ON s.id = r."skillId"
UNION ALL
SELECT 'task|' || rm."userId" || '|' || t.title || '|' || t.status || '|' || t.phase || '|' || t."sortOrder"
FROM roadmap_task t JOIN roadmap rm ON rm.id = t."roadmapId"
UNION ALL
SELECT 'skill|' || s.name || '|' || s.category
FROM skill s
ORDER BY 1;
