import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as adminApi from "@/services/api/adminApi";
import * as marketApi from "@/services/api/marketAdminApi";
import type { SkillCandidateRow, SkillMergePlan } from "@/services/api/marketAdminApi";
import { useToast } from "@/store/hooks";
import { useState } from "react";

const STATUSES = ["PENDING", "MAPPED", "APPROVED", "REJECTED"] as const;

function SkillPicker({ skills, value, onChange }: { skills: adminApi.AdminSkill[]; value: string; onChange: (id: string) => void }) {
  return (
    <select
      className="h-8 max-w-[14rem] rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-600 dark:bg-slate-900"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Map to skill…</option>
      {skills.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

export function AdminMarketSkillsPage() {
  const { push } = useToast();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("PENDING");
  const candidates = useAsyncData((signal) => marketApi.listCandidates(status, { signal }), [status]);
  const skills = useAsyncData(() => adminApi.listSkills());
  const [aliasQuery, setAliasQuery] = useState("");
  const aliases = useAsyncData((signal) => marketApi.listAliases(aliasQuery || undefined, { signal }), [aliasQuery]);
  const duplicates = useAsyncData(() => marketApi.listDuplicateSkills());
  const log = useAsyncData(() => marketApi.listReviewLog());
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [newAlias, setNewAlias] = useState({ skillId: "", alias: "" });
  const [plan, setPlan] = useState<SkillMergePlan | null>(null);
  const [busy, setBusy] = useState(false);

  const skillList = [...(skills.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  function refresh() {
    void candidates.reload();
    void aliases.reload();
    void duplicates.reload();
    void log.reload();
    void skills.reload();
  }

  async function act(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    try {
      const res = await action();
      push(`${label}${res && typeof res === "object" && "relinked" in res ? `: ${(res as { relinked: number }).relinked} row(s) relinked` : ""}`);
      refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  }

  async function suggest() {
    setBusy(true);
    try {
      const res = await marketApi.suggestCandidates(25);
      push(res.skipped ? `Suggestions skipped: ${res.skipped}` : `Suggested ${res.suggested} of ${res.processed}; auto-mapped ${res.autoMapped}`);
      refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : "Suggestion failed");
    } finally {
      setBusy(false);
    }
  }

  async function previewMerge(sourceId: string, targetId: string) {
    try {
      setPlan(await marketApi.mergeSkills(sourceId, targetId, false));
    } catch (err) {
      push(err instanceof Error ? err.message : "Merge preview failed");
    }
  }

  async function executeMerge() {
    if (!plan) return;
    if (!window.confirm(`Merge "${plan.source.name}" into "${plan.target.name}"? The source skill is deleted. This cannot be undone.`)) return;
    await act("Merged", async () => {
      const res = await marketApi.mergeSkills(plan.source.id, plan.target.id, true);
      setPlan(null);
      return res;
    });
  }

  function approve(c: SkillCandidateRow) {
    const name = window.prompt("Name of the new skill", c.name);
    if (!name) return;
    void act(`Created skill ${name}`, () => marketApi.approveCandidate(c.id, { name }));
  }

  function reject(c: SkillCandidateRow) {
    const note = window.prompt(`Reject "${c.name}" as not a skill? Optional note:`, "");
    if (note === null) return;
    void act(`Rejected ${c.name}`, () => marketApi.rejectCandidate(c.id, note || undefined));
  }

  if (candidates.error && !candidates.data) return <ErrorState message={candidates.error} code={candidates.errorCode} onRetry={refresh} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Skill review queue"
          description="Skill names from postings that no skill or approved alias resolves. Approving or mapping relinks every pending row with that name; rejecting removes them."
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void suggest()}>
                Suggest matches
              </Button>
              <Button size="sm" variant="ghost" onClick={refresh}>
                Refresh
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <Button key={s} size="sm" variant={status === s ? "primary" : "outline"} onClick={() => setStatus(s)}>
                {s} {candidates.data?.counts[s] !== undefined ? `(${candidates.data.counts[s]})` : ""}
              </Button>
            ))}
          </div>
          <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-800">
            {(candidates.data?.items ?? []).map((c) => (
              <li key={c.id} className="flex flex-col gap-2 py-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.name} <span className="text-xs text-slate-500">· {c.jobCount} jobs · {c.companyCount} companies</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.suggestedSkill
                      ? `Suggested: ${c.suggestedSkill.name} (${c.suggestionMethod} ${c.suggestionScore?.toFixed(2) ?? ""})`
                      : c.suggestionMethod
                        ? `No confident match (${c.suggestionMethod})`
                        : "Not yet suggested"}
                    {c.resolvedSkill ? ` · resolved to ${c.resolvedSkill.name}` : ""}
                  </p>
                  {c.autoApproved && <Badge tone="warning">auto-approved</Badge>}
                </div>
                {c.status === "PENDING" && (
                  <div className="flex flex-wrap items-center gap-2">
                    {c.suggestedSkill && (
                      <Button size="sm" disabled={busy} onClick={() => void act(`Mapped ${c.name}`, () => marketApi.mapCandidate(c.id, c.suggestedSkill!.id))}>
                        Accept suggestion
                      </Button>
                    )}
                    <SkillPicker skills={skillList} value={picks[c.id] ?? ""} onChange={(id) => setPicks({ ...picks, [c.id]: id })} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !picks[c.id]}
                      onClick={() => void act(`Mapped ${c.name}`, () => marketApi.mapCandidate(c.id, picks[c.id]))}
                    >
                      Map
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => approve(c)}>
                      New skill
                    </Button>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => reject(c)}>
                      Reject
                    </Button>
                  </div>
                )}
                {c.status === "REJECTED" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(`Reopened ${c.name}`, () => marketApi.reopenCandidate(c.id))}>
                    Reopen
                  </Button>
                )}
              </li>
            ))}
            {candidates.data && candidates.data.items.length === 0 && <li className="py-2 text-slate-500">Nothing here.</li>}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Aliases" description="Approved aliases resolve market skill names. Adding one relinks matching unresolved rows." />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <SkillPicker skills={skillList} value={newAlias.skillId} onChange={(skillId) => setNewAlias({ ...newAlias, skillId })} />
            <div className="w-48">
              <Input placeholder="Alias, e.g. Postgres" value={newAlias.alias} onChange={(e) => setNewAlias({ ...newAlias, alias: e.target.value })} />
            </div>
            <Button
              size="sm"
              disabled={busy || !newAlias.skillId || !newAlias.alias.trim()}
              onClick={() =>
                void act(`Added alias ${newAlias.alias}`, async () => {
                  const res = await marketApi.addAlias(newAlias.skillId, newAlias.alias.trim());
                  setNewAlias({ skillId: "", alias: "" });
                  return res;
                })
              }
            >
              Add alias
            </Button>
            <div className="ml-auto w-56">
              <Input placeholder="Search aliases" value={aliasQuery} onChange={(e) => setAliasQuery(e.target.value)} />
            </div>
          </div>
          <ul className="grid gap-x-6 text-sm sm:grid-cols-2">
            {(aliases.data ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-1">
                <span className="truncate">
                  {a.alias} → <span className="font-medium">{a.skill.name}</span>{" "}
                  <span className="text-xs text-slate-500">
                    {a.source}
                    {a.status !== "APPROVED" ? ` · ${a.status}` : ""}
                  </span>
                </span>
                {a.status === "APPROVED" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(`Disabled ${a.alias}`, () => marketApi.disableAlias(a.id))}>
                    Disable
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Duplicate skills"
          description="Skills whose names normalize to the same key. Merging moves every reference to the target; preview first (dry run)."
        />
        <CardBody className="space-y-3 text-sm">
          {(duplicates.data ?? []).map((d) => (
            <div key={d.key} className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-500">{d.key}</span>
              {d.skills.slice(1).map((s) => (
                <Button key={s.id} size="sm" variant="outline" onClick={() => void previewMerge(s.id, d.skills[0].id)}>
                  Merge “{s.name}” into “{d.skills[0].name}”
                </Button>
              ))}
            </div>
          ))}
          {duplicates.data && duplicates.data.length === 0 && <p className="text-slate-500">No duplicates.</p>}
          {plan && (
            <div className="rounded-lg border border-stone-200 p-3 text-xs dark:border-stone-700">
              <p className="mb-1 font-medium">
                Dry run: {plan.source.name} → {plan.target.name}
              </p>
              <p>Moves: {Object.entries(plan.moves).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
              <p className="text-amber-700 dark:text-amber-300">
                Dropped (target already has an equivalent row): {Object.entries(plan.conflicts).map(([k, v]) => `${k} ${v}`).join(" · ")}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="danger" disabled={busy} onClick={() => void executeMerge()}>
                  Execute merge
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPlan(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Review log" />
        <CardBody>
          <ul className="space-y-1 text-xs">
            {(log.data ?? []).map((l) => (
              <li key={l.id}>
                <span className="text-slate-500">{new Date(l.createdAt).toLocaleString()}</span> · <span className="font-mono">{l.action}</span>
                {l.details ? ` · ${JSON.stringify(l.details)}` : ""}
              </li>
            ))}
            {log.data && log.data.length === 0 && <li className="text-slate-500">No decisions yet.</li>}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
