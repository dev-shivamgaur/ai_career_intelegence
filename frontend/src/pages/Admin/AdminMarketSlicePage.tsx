import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as marketApi from "@/services/api/marketAdminApi";
import type { CareerMarketProfile, SliceCareerSkills, SliceSkill, SliceSkillJobs } from "@/services/api/marketAdminApi";
import { useToast } from "@/store/hooks";
import { useState } from "react";

const LEVEL_TONE = { REQUIRED: "brand", RECOMMENDED: "warning", NICE_TO_HAVE: "neutral" } as const;

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const rate = (v: number | null) => (v === null ? "—" : v.toFixed(3));
const splitList = (text: string) =>
  text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

function PatternEditor({ career, onSaved }: { career: CareerMarketProfile; onSaved: () => void }) {
  const { push } = useToast();
  const [titles, setTitles] = useState((career.profile?.titlePatterns ?? []).join("\n"));
  const [excludes, setExcludes] = useState((career.profile?.excludePatterns ?? []).join("\n"));
  const [enabled, setEnabled] = useState(career.profile?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await marketApi.saveCareerProfile(career.id, { titlePatterns: splitList(titles), excludePatterns: splitList(excludes), enabled });
      push(`Saved title patterns for ${career.title}. Re-run classification to apply them.`);
      onSaved();
    } catch (err) {
      push(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const area = "h-28 w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-900";
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{career.title}</p>
        <Badge tone="neutral">{career.openJobs} open jobs</Badge>
        {!career.profile && <Badge tone="warning">no patterns: jobs are never assigned here</Badge>}
        <label className="ml-auto flex items-center gap-1 text-xs">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> enabled
        </label>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-slate-500">Title patterns (one per line, whole words, normalized like titles)</span>
          <textarea className={area} value={titles} onChange={(e) => setTitles(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-slate-500">Exclude when the raw title contains</span>
          <textarea className={area} value={excludes} onChange={(e) => setExcludes(e.target.value)} />
        </label>
      </div>
      <div className="flex gap-2">
        {career.suggested && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setTitles(career.suggested!.titlePatterns.join("\n"));
              setExcludes(career.suggested!.excludePatterns.join("\n"));
            }}
          >
            Use suggestions
          </Button>
        )}
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </li>
  );
}

export function AdminMarketSlicePage() {
  const { push } = useToast();
  const summary = useAsyncData(() => marketApi.getSlice());
  const profiles = useAsyncData(() => marketApi.getCareerProfiles());
  const candidates = useAsyncData(() => marketApi.listCandidates());
  const [careerSkills, setCareerSkills] = useState<SliceCareerSkills | null>(null);
  const [skill, setSkill] = useState<SliceSkill | null>(null);
  const [skillJobs, setSkillJobs] = useState<SliceSkillJobs | null>(null);

  function refresh() {
    void summary.reload();
    void profiles.reload();
    void candidates.reload();
  }

  async function openCareer(careerId: string) {
    try {
      setSkill(null);
      setSkillJobs(null);
      setCareerSkills(await marketApi.getSliceCareerSkills(careerId));
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not load skills");
    }
  }

  async function openSkill(s: SliceSkill) {
    if (!careerSkills) return;
    try {
      setSkill(s);
      setSkillJobs(await marketApi.getSliceSkillJobs(careerSkills.career.id, s.key));
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not load jobs");
    }
  }

  async function reclassify() {
    try {
      const res = await marketApi.startReclassifyRun();
      push(`Reclassification: ${res.taskCount} task(s) queued`);
    } catch (err) {
      push(err instanceof Error ? err.message : "Reclassification failed");
    }
  }

  const error = summary.error ?? profiles.error;
  if (error) return <ErrorState message={error} code={summary.errorCode ?? profiles.errorCode} onRetry={refresh} />;
  const s = summary.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Market slice report"
          description="Admin-only vertical slice. Raw counts of currently open jobs (ACTIVE_STOCK). No percentages or trends are published from the slice."
          action={
            <Button size="sm" variant="ghost" onClick={refresh}>
              Refresh
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {s && (
            <>
              <p className="text-xs text-slate-500">
                Basis {s.basis} · as of {new Date(s.asOf).toLocaleString()}
              </p>
              <div className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
                <Tile label="Open jobs" value={s.openJobs} />
                <Tile label="Classified / unclassified" value={`${s.classification.classified} / ${s.classification.unclassified}`} hint={`unclassified rate ${rate(s.quality.unclassifiedRate)}`} />
                <Tile label="Unresolved skill rate" value={rate(s.quality.unresolvedSkillRate)} hint={`${s.quality.unresolvedNames} names · ${s.quality.pendingCandidates} pending`} />
                <Tile label="Cross-source merges" value={s.quality.mergedJobs} hint={`merge rate ${rate(s.quality.mergeRate)}`} />
                <Tile label="Clean fetch runs in a row" value={s.consecutiveCleanFetchRuns} hint={`failed rows ${s.quality.failedRows} · purged ${s.quality.purgedDescriptions}`} />
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Careers" description="Pick a career to see its top skills, then a skill to see the jobs, sources and evidence behind the count." />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(s?.careers ?? []).map((c) => (
              <Button key={c.careerId} size="sm" variant={careerSkills?.career.id === c.careerId ? "primary" : "outline"} onClick={() => void openCareer(c.careerId)}>
                {c.title} · {c.jobCount} jobs · {c.companyCount} companies
              </Button>
            ))}
            {s && s.careers.length === 0 && <p className="text-sm text-slate-500">No classified jobs yet. Add title patterns below, then run classification.</p>}
          </div>

          {careerSkills && (
            <div className="overflow-x-auto">
              <p className="mb-2 text-xs text-slate-500">
                {careerSkills.career.title}: {careerSkills.jobCount} open jobs from {careerSkills.companyCount} companies. Each job counts once per skill, at its strongest level.
              </p>
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="py-1">Skill</th>
                    <th>Jobs</th>
                    <th>Required</th>
                    <th>Preferred</th>
                    <th>Mentioned</th>
                    <th>Companies</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                  {careerSkills.skills.map((row) => (
                    <tr key={row.key} className={skill?.key === row.key ? "bg-stone-100 dark:bg-stone-800" : undefined}>
                      <td className="py-1">
                        <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => void openSkill(row)}>
                          {row.name}
                        </button>{" "}
                        {!row.resolved && <Badge tone="warning">unresolved</Badge>}
                      </td>
                      <td>{row.jobCount}</td>
                      <td>{row.requiredCount}</td>
                      <td>{row.preferredCount}</td>
                      <td>{row.niceCount}</td>
                      <td>{row.companyCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {skill && skillJobs && (
            <div className="rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-700">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">
                  {skill.name}: {skillJobs.jobs.length} job(s)
                </p>
                <Button size="sm" variant="ghost" onClick={() => setSkill(null)}>
                  Close
                </Button>
              </div>
              <ul className="space-y-3">
                {skillJobs.jobs.map((j) => (
                  <li key={j.id} className="space-y-1">
                    <p>
                      <span className="font-medium">{j.title}</span> · {j.company.name}
                      {j.locationText ? ` · ${j.locationText}` : ""}
                      {j.careers[0]?.matchedPattern ? <span className="text-xs text-slate-500"> · matched “{j.careers[0].matchedPattern}”</span> : null}
                    </p>
                    {j.skills.map((e, i) => (
                      <div key={`${e.rawJob.id}-${i}`} className="ml-3 space-y-0.5 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={LEVEL_TONE[e.level]}>{e.level}</Badge>
                          <Badge tone="neutral">
                            {e.method} · {e.confidence.toFixed(2)}
                          </Badge>
                          <span className="text-slate-500">
                            {e.rawJob.source.type} · {e.rawJob.source.boardToken} · {e.extractorVersion}
                          </span>
                          {e.rawJob.url && (
                            <a className="text-brand-600 hover:underline" href={e.rawJob.url} target="_blank" rel="noreferrer noopener">
                              posting
                            </a>
                          )}
                        </div>
                        <p className="font-mono text-slate-600 dark:text-slate-300">
                          {e.evidence ?? (e.rawJob.contentPurgedAt ? "(excerpt removed by retention)" : "(no excerpt stored)")}
                        </p>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Career title patterns"
          description="Title-pattern classification only. Jobs whose title matches no pattern stay UNCLASSIFIED and are not counted."
          action={
            <Button size="sm" variant="outline" onClick={() => void reclassify()}>
              Re-run classification
            </Button>
          }
        />
        <CardBody className="space-y-3">
          <ul className="divide-y divide-stone-200 dark:divide-stone-800">
            {(profiles.data?.careers ?? []).map((c) => (
              <PatternEditor key={`${c.id}-${c.profile?.updatedAt ?? "new"}`} career={c} onSaved={() => void profiles.reload()} />
            ))}
          </ul>
          {profiles.data && profiles.data.unclassifiedSample.length > 0 && (
            <div className="text-xs">
              <p className="mb-1 font-medium">Recent unclassified titles</p>
              <ul className="grid gap-x-4 sm:grid-cols-2">
                {profiles.data.unclassifiedSample.map((u) => (
                  <li key={u.id} className="truncate text-slate-600 dark:text-slate-300">
                    {u.title} <span className="text-slate-400">· {u.company.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Unresolved skill names" description="Read-only here. Approve, map, reject or merge them on the Skill review page." />
        <CardBody>
          {candidates.error && <p className="text-sm text-red-600">{candidates.error}</p>}
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1">Name</th>
                <th>Jobs</th>
                <th>Companies</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
              {(candidates.data?.items ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="py-1">{c.name}</td>
                  <td>{c.jobCount}</td>
                  <td>{c.companyCount}</td>
                  <td>{new Date(c.lastSeenAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {candidates.data && candidates.data.items.length === 0 && (
                <tr>
                  <td className="py-2 text-slate-500" colSpan={4}>
                    No unresolved names.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
