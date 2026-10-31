import { PrepContentForm } from "@/components/admin/prep/PrepContentForm";
import { PrepRubricForm } from "@/components/admin/prep/PrepRubricForm";
import {
  contentToPayload,
  parseContent,
  parseRubric,
  rubricToPayload,
  type PrepContentForm as ContentForm,
  type PrepRubricForm as RubricForm,
} from "@/components/admin/prep/prepFormTypes";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  createPrepDraft,
  generatePrepDraft,
  getPrepPackage,
  listCareers,
  listPrepPackages,
  previewPrepPackage,
  publishPrepPackage,
  updatePrepDraft,
  validatePrepPackage,
  type AdminPrepPackageDetail,
  type AdminPrepPackageRow,
  type AdminSkill,
} from "@/services/api/adminApi";
import { useMemo, useState } from "react";

type EditorTab = "meta" | "objectives" | "lessons" | "questions" | "tasks" | "resources" | "rubric" | "preview";

type SkillGroup = {
  skillId: string;
  skillName: string;
  skillCategory: string;
  versions: AdminPrepPackageRow[];
};

function groupBySkill(rows: AdminPrepPackageRow[]): SkillGroup[] {
  const map = new Map<string, SkillGroup>();
  for (const row of rows) {
    const existing = map.get(row.skillId);
    if (existing) {
      existing.versions.push(row);
    } else {
      map.set(row.skillId, {
        skillId: row.skillId,
        skillName: row.skillName,
        skillCategory: row.skillCategory,
        versions: [row],
      });
    }
  }
  for (const group of map.values()) {
    group.versions.sort((a, b) => b.version - a.version);
  }
  return [...map.values()].sort((a, b) => a.skillName.localeCompare(b.skillName));
}

export function AdminPrepPackagesPage() {
  const packages = useAsyncData(() => listPrepPackages());
  const careers = useAsyncData(() => listCareers());
  const [careerId, setCareerId] = useState("");
  const [skillId, setSkillId] = useState("");
  const [conceptual, setConceptual] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminPrepPackageDetail | null>(null);
  const [content, setContent] = useState<ContentForm>(() => parseContent(null));
  const [rubric, setRubric] = useState<RubricForm>(() => parseRubric(null));
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState<EditorTab>("meta");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedSkills, setExpandedSkills] = useState<Record<string, boolean>>({});

  const selectedCareer = useMemo(
    () => (careers.data ?? []).find((c) => c.id === careerId) ?? null,
    [careers.data, careerId],
  );

  const roleSkills: AdminSkill[] = useMemo(() => {
    if (!selectedCareer) return [];
    const seen = new Map<string, AdminSkill>();
    for (const req of selectedCareer.requirements) {
      if (!seen.has(req.skill.id)) seen.set(req.skill.id, req.skill);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedCareer]);

  const roleSkillIds = useMemo(() => new Set(roleSkills.map((s) => s.id)), [roleSkills]);

  const filteredPackages = useMemo(() => {
    const rows = packages.data ?? [];
    if (!careerId) return rows;
    return rows.filter((r) => roleSkillIds.has(r.skillId));
  }, [packages.data, careerId, roleSkillIds]);

  const groups = useMemo(() => groupBySkill(filteredPackages), [filteredPackages]);

  async function openPackage(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const row = await getPrepPackage(id);
      setSelectedId(id);
      setDetail(row);
      setContent(parseContent(row.content, { id: row.skillId, name: row.skillName }));
      setRubric(parseRubric(row.rubric));
      setPreview(null);
      setTab("meta");
      setExpandedSkills((prev) => ({ ...prev, [row.skillId]: true }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load package");
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    if (!skillId.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const row = await createPrepDraft(skillId.trim(), conceptual);
      await packages.reload();
      await openPackage(row.id);
      setMessage("Draft created");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create draft");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!detail || detail.status !== "DRAFT") {
      setMessage("Only drafts can be saved. Publish creates a new version from published packages.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const row = await updatePrepDraft(detail.id, {
        content: contentToPayload(content),
        rubric: rubricToPayload(rubric),
      });
      setDetail(row);
      setContent(parseContent(row.content, { id: row.skillId, name: row.skillName }));
      setRubric(parseRubric(row.rubric));
      setMessage(row.validationErrors.length ? `Saved with ${row.validationErrors.length} validation issue(s)` : "Draft saved");
      await packages.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed — check required fields");
    } finally {
      setBusy(false);
    }
  }

  async function runValidate() {
    if (!detail) return;
    setBusy(true);
    try {
      if (detail.status === "DRAFT") {
        await updatePrepDraft(detail.id, {
          content: contentToPayload(content),
          rubric: rubricToPayload(rubric),
        });
      }
      const result = await validatePrepPackage(detail.id);
      setMessage(result.ok ? "Validation passed" : result.errors.join("; "));
      await packages.reload();
      const refreshed = await getPrepPackage(detail.id);
      setDetail(refreshed);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Validate failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPublish() {
    if (!detail) return;
    setBusy(true);
    try {
      if (detail.status === "DRAFT") {
        await updatePrepDraft(detail.id, {
          content: contentToPayload(content),
          rubric: rubricToPayload(rubric),
        });
      }
      const row = await publishPrepPackage(detail.id);
      await packages.reload();
      await openPackage(row.id);
      setMessage(`Published v${row.version}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  async function runGenerate() {
    if (!detail) return;
    setBusy(true);
    try {
      const row = await generatePrepDraft(detail.id);
      setDetail(row);
      setContent(parseContent(row.content, { id: row.skillId, name: row.skillName }));
      setRubric(parseRubric(row.rubric));
      setMessage("AI draft applied");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (!detail) return;
    setBusy(true);
    try {
      const row = await previewPrepPackage(detail.id);
      setPreview(row.package);
      setTab("preview");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  if (packages.error) return <ErrorState message={packages.error} onRetry={() => void packages.reload()} />;

  const readOnly = detail?.status !== "DRAFT";
  const editorTabs: Array<{ id: EditorTab; label: string }> = [
    { id: "meta", label: "Overview" },
    { id: "objectives", label: "Objectives" },
    { id: "lessons", label: "Lessons" },
    { id: "questions", label: "Questions" },
    { id: "tasks", label: "Tasks" },
    { id: "resources", label: "Resources" },
    { id: "rubric", label: "Grading" },
    { id: "preview", label: "Preview" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Preparation packages"
          description="Pick a role first, then a skill from that role. Edit packages with forms — no raw JSON needed."
        />
        <CardBody className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                1. Role / career <span className="text-red-600">*</span>
              </label>
              <select
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={careerId}
                onChange={(e) => {
                  setCareerId(e.target.value);
                  setSkillId("");
                }}
                aria-label="Select role"
              >
                <option value="">Select role (e.g. Backend Developer)</option>
                {(careers.data ?? []).map((career) => (
                  <option key={career.id} value={career.id}>
                    {career.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                2. Skill for this role <span className="text-red-600">*</span>
              </label>
              <select
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
                disabled={!careerId}
                aria-label="Select skill"
              >
                <option value="">{careerId ? "Select skill" : "Choose a role first"}</option>
                {roleSkills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                    {skill.category ? ` · ${skill.category}` : ""}
                  </option>
                ))}
              </select>
              {careerId && roleSkills.length === 0 && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">This role has no skills linked yet.</p>
              )}
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={conceptual} onChange={(e) => setConceptual(e.target.checked)} />
              Conceptual (no GitHub task)
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <Button disabled={busy || !skillId} onClick={() => void createDraft()}>
                New draft
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void packages.reload()}>
                Refresh
              </Button>
            </div>
          </div>
          {careerId && (
            <p className="text-xs text-slate-500">
              Showing packages for <strong>{selectedCareer?.title}</strong> skills only ({roleSkills.length} skills).
            </p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader
            title="Packages by skill"
            description={`${groups.length} skills · ${filteredPackages.length} versions`}
          />
          <CardBody className="max-h-[40rem] space-y-2 overflow-y-auto text-sm">
            {groups.length === 0 && (
              <p className="text-slate-500">{careerId ? "No packages for this role yet." : "No packages yet."}</p>
            )}
            {groups.map((group) => {
              const open = expandedSkills[group.skillId] ?? group.versions.some((v) => v.id === selectedId);
              return (
                <div key={group.skillId} className="rounded-lg border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-2 py-2 text-left font-medium hover:bg-stone-50 dark:hover:bg-stone-800"
                    onClick={() => setExpandedSkills((prev) => ({ ...prev, [group.skillId]: !open }))}
                  >
                    <span>
                      {group.skillName}
                      <span className="ml-1 text-xs font-normal text-slate-500">
                        ({group.versions.length} version{group.versions.length === 1 ? "" : "s"})
                      </span>
                    </span>
                    <span className="text-xs text-slate-400">{open ? "▾" : "▸"}</span>
                  </button>
                  {open && (
                    <div className="space-y-0.5 border-t border-slate-100 px-1 py-1 dark:border-slate-800">
                      {group.versions.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          className={`block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-stone-100 dark:hover:bg-stone-800 ${
                            selectedId === row.id ? "bg-brand-100 dark:bg-brand-900/40" : ""
                          }`}
                          onClick={() => void openPackage(row.id)}
                        >
                          <span className="font-medium">v{row.version}</span>
                          <span className="mx-1 text-slate-400">·</span>
                          <span className={row.status === "PUBLISHED" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700"}>
                            {row.status}
                          </span>
                          <span className="mx-1 text-slate-400">·</span>
                          {row.lessonCount} lessons
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={detail ? `${detail.skillName} · v${detail.version}` : "Editor"}
            description={
              detail
                ? `${detail.status}${readOnly ? " (read-only — create a new draft to edit)" : " · draft editable"}`
                : "Select a version or create a draft"
            }
          />
          <CardBody className="space-y-3">
            {detail && (
              <>
                <div className="flex flex-wrap gap-2">
                  {editorTabs.map((t) => (
                    <Button key={t.id} size="sm" variant={tab === t.id ? "primary" : "outline"} onClick={() => setTab(t.id)}>
                      {t.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy || readOnly} onClick={() => void saveDraft()}>
                    Save draft
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void runValidate()}>
                    Validate
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy || readOnly} onClick={() => void runGenerate()}>
                    AI generate
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => void runPublish()}>
                    Publish
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void runPreview()}>
                    Learner preview
                  </Button>
                </div>
                {message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}
                {detail.validationErrors.length > 0 && (
                  <ul className="list-disc pl-4 text-xs text-amber-800 dark:text-amber-200">
                    {detail.validationErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                )}

                {tab !== "rubric" && tab !== "preview" && (
                  <PrepContentForm value={content} onChange={setContent} disabled={readOnly || busy} tab={tab} />
                )}
                {tab === "rubric" && (
                  <PrepRubricForm value={rubric} content={content} onChange={setRubric} disabled={readOnly || busy} />
                )}
                {tab === "preview" && (
                  <div className="space-y-2 text-sm">
                    <p className="text-slate-500">Learner-facing package snapshot (rubric hidden).</p>
                    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <p className="font-medium">{String((preview ?? content).skillName ?? content.skillName)}</p>
                      <p className="text-xs text-slate-500">
                        {content.difficulty} · {content.estimatedMinutes} min · {content.lessons.length} lessons ·{" "}
                        {content.questions.length} questions
                      </p>
                      <ul className="mt-2 list-disc pl-4 text-xs">
                        {content.lessons.map((l) => (
                          <li key={l.key}>
                            {l.title || l.key}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-slate-500">Technical JSON (optional)</summary>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-slate-100">
                        {JSON.stringify(preview ?? contentToPayload(content), null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </>
            )}
            {!detail && (
              <p className="text-sm text-slate-500">
                Choose a role, pick a skill, create a draft — or open a version from the left list.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
