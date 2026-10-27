import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  createPrepDraft,
  generatePrepDraft,
  getPrepPackage,
  listPrepPackages,
  listSkills,
  previewPrepPackage,
  publishPrepPackage,
  updatePrepDraft,
  validatePrepPackage,
  type AdminPrepPackageDetail,
} from "@/services/api/adminApi";
import { useState } from "react";

type Tab = "meta" | "lessons" | "questions" | "tasks" | "rubric" | "preview";

export function AdminPrepPackagesPage() {
  const packages = useAsyncData(() => listPrepPackages());
  const skills = useAsyncData(() => listSkills());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminPrepPackageDetail | null>(null);
  const [contentJson, setContentJson] = useState("");
  const [rubricJson, setRubricJson] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState<Tab>("meta");
  const [skillId, setSkillId] = useState("");
  const [conceptual, setConceptual] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function openPackage(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const row = await getPrepPackage(id);
      setSelectedId(id);
      setDetail(row);
      setContentJson(JSON.stringify(row.content, null, 2));
      setRubricJson(JSON.stringify(row.rubric, null, 2));
      setPreview(null);
      setTab("meta");
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
      setMessage("Only drafts can be saved in place. Publish creates a new version from published packages.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const content = JSON.parse(contentJson) as Record<string, unknown>;
      const rubric = JSON.parse(rubricJson) as Record<string, unknown>;
      const row = await updatePrepDraft(detail.id, { content, rubric });
      setDetail(row);
      setContentJson(JSON.stringify(row.content, null, 2));
      setRubricJson(JSON.stringify(row.rubric, null, 2));
      setMessage(row.validationErrors.length ? `Saved with ${row.validationErrors.length} validation issue(s)` : "Draft saved");
      await packages.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed — check JSON");
    } finally {
      setBusy(false);
    }
  }

  async function runValidate() {
    if (!detail) return;
    setBusy(true);
    try {
      const result = await validatePrepPackage(detail.id);
      setMessage(result.ok ? "Validation passed" : result.errors.join("; "));
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
      setContentJson(JSON.stringify(row.content, null, 2));
      setMessage("AI draft applied to first lesson");
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

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "meta", label: "Metadata" },
    { id: "lessons", label: "Lessons JSON" },
    { id: "questions", label: "Full content" },
    { id: "tasks", label: "Rubric" },
    { id: "rubric", label: "Validate" },
    { id: "preview", label: "Preview" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Preparation packages"
          description="Shared skill packages. Learners get published content; rubrics stay admin-only."
        />
        <CardBody className="grid gap-2 md:grid-cols-4">
          <select
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900"
            value={skillId}
            onChange={(e) => setSkillId(e.target.value)}
            aria-label="Skill"
          >
            <option value="">Select skill</option>
            {(skills.data ?? []).map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={conceptual} onChange={(e) => setConceptual(e.target.checked)} />
            Conceptual (no GitHub task)
          </label>
          <Button disabled={busy || !skillId} onClick={() => void createDraft()}>
            New draft
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void packages.reload()}>
            Refresh list
          </Button>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader title="Packages" description={`${(packages.data ?? []).length} rows`} />
          <CardBody className="max-h-[32rem] space-y-1 overflow-y-auto text-sm">
            {(packages.data ?? []).map((row) => (
              <button
                key={row.id}
                type="button"
                className={`block w-full rounded-lg px-2 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 ${
                  selectedId === row.id ? "bg-brand-100 dark:bg-brand-900/40" : ""
                }`}
                onClick={() => void openPackage(row.id)}
              >
                <span className="font-medium">{row.skillName}</span>
                <span className="block text-xs text-slate-500">
                  v{row.version} · {row.status} · {row.lessonCount} lessons
                </span>
              </button>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={detail ? `${detail.skillName} · v${detail.version}` : "Editor"}
            description={detail ? `${detail.status} · ${detail.id}` : "Select or create a package"}
          />
          <CardBody className="space-y-3">
            {detail && (
              <>
                <div className="flex flex-wrap gap-2">
                  {tabs.map((t) => (
                    <Button key={t.id} size="sm" variant={tab === t.id ? "primary" : "outline"} onClick={() => setTab(t.id)}>
                      {t.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy || detail.status !== "DRAFT"} onClick={() => void saveDraft()}>
                    Save draft
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void runValidate()}>
                    Validate
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy || detail.status !== "DRAFT"} onClick={() => void runGenerate()}>
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
                {(tab === "meta" || tab === "lessons" || tab === "questions") && (
                  <textarea
                    className="h-80 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-900"
                    value={contentJson}
                    onChange={(e) => setContentJson(e.target.value)}
                    aria-label="Package content JSON"
                    disabled={detail.status !== "DRAFT"}
                  />
                )}
                {(tab === "tasks" || tab === "rubric") && (
                  <textarea
                    className="h-80 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-900"
                    value={rubricJson}
                    onChange={(e) => setRubricJson(e.target.value)}
                    aria-label="Package rubric JSON"
                    disabled={detail.status !== "DRAFT"}
                  />
                )}
                {tab === "preview" && (
                  <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                    {JSON.stringify(preview ?? detail.content, null, 2)}
                  </pre>
                )}
              </>
            )}
            {!detail && <p className="text-sm text-slate-500">Choose a package from the list.</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
