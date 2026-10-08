import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader, StatTile } from "@/components/ui/PageHeader";
import { DashboardSkeleton, ListRowSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as adminApi from "@/services/api/adminApi";
import { useAuth, useToast } from "@/store/hooks";
import { BookOpen, Briefcase, Layers, Target, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

export function AdminPage() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/admin/careers")) return <CareersTab />;
  if (pathname.startsWith("/admin/skills")) return <SkillsTab />;
  if (pathname.startsWith("/admin/users")) return <UsersTab />;
  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      <PageHeader title="Overview" description="Shared catalog and learner accounts." />
      <Overview />
    </div>
  );
}

function Overview() {
  const { data, loading, error, errorCode, reload } = useAsyncData(() => adminApi.getStats());

  if (loading) return <DashboardSkeleton />;
  if (error || !data) {
    return <ErrorState message={error ?? undefined} code={errorCode} onRetry={() => void reload()} />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Users" value={String(data.users.total)} icon={<Users className="h-4 w-4" />} />
        <StatTile label="Admins" value={String(data.users.admins)} icon={<UserRound className="h-4 w-4" />} />
        <StatTile label="Active goals" value={String(data.goals.active)} icon={<Target className="h-4 w-4" />} />
        <StatTile
          label="Pending analysis"
          value={String(data.goals.pendingAnalysis)}
          icon={<Layers className="h-4 w-4" />}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Careers" value={String(data.catalog.careers)} icon={<Briefcase className="h-4 w-4" />} />
        <StatTile label="Skills" value={String(data.catalog.skills)} icon={<Layers className="h-4 w-4" />} />
        <StatTile label="Jobs" value={String(data.catalog.jobs)} icon={<Briefcase className="h-4 w-4" />} />
        <StatTile
          label="Government exams"
          value={String(data.catalog.governmentExams)}
          icon={<BookOpen className="h-4 w-4" />}
        />
      </div>
      <Card>
        <CardHeader title="Data health" />
        <CardBody className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <p>
            {data.users.withProfile} of {data.users.total} users have a profile row.
          </p>
          <p>
            {data.goals.analysed} goals have a generated analysis, {data.goals.pendingAnalysis} are still waiting.
          </p>
          <p>{data.goals.skillGapRows} skill gap rows and {data.documents} uploaded documents stored.</p>
        </CardBody>
      </Card>
    </div>
  );
}

function UsersTab() {
  const { user } = useAuth();
  const currentUserId = user?.id ?? "";
  const { push } = useToast();
  const [search, setSearch] = useState("");
  const { data, loading, error, errorCode, reload } = useAsyncData(() => adminApi.listUsers({ search, take: 50 }), [
    search,
  ]);

  async function toggleRole(row: adminApi.AdminUserRow) {
    try {
      await adminApi.setUserRole(row.id, row.role === "ADMIN" ? "user" : "admin");
      push("Role updated");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not update role");
    }
  }

  async function remove(row: adminApi.AdminUserRow) {
    if (!window.confirm(`Delete ${row.phone}? All their data is removed permanently.`)) return;
    try {
      await adminApi.deleteUser(row.id);
      push("User deleted");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not delete user");
    }
  }

  return (
    <Card>
      <CardHeader title={`Users${data ? ` (${data.total})` : ""}`} />
      <CardBody className="space-y-4">
        <Input
          label="Search"
          name="search"
          placeholder="Phone, name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {loading && !data && <ListRowSkeleton count={5} />}
        {error && <ErrorState message={error} code={errorCode} onRetry={() => void reload()} />}
        {data && data.items.length === 0 && <p className="text-sm text-slate-500">No users match this search.</p>}
        <ul className="space-y-2">
          {data?.items.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-700"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {row.name || "Unnamed"} · {row.phone}
                  {row.role === "ADMIN" && (
                    <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-xs text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
                      admin
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {row.onboardingComplete ? "Onboarded" : "Onboarding pending"} ·{" "}
                  {row.profile ? `${row.profile.completionPercent}% profile` : "no profile"} ·{" "}
                  {row._count.careerGoals} goals · {row._count.skillGaps} gaps · {row._count.documents} docs
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link to={`/admin/users/${row.id}`} className="inline-flex items-center text-sm font-medium text-brand-700">
                  Open
                </Link>
                <Button size="sm" variant="outline" onClick={() => void toggleRole(row)}>
                  {row.role === "ADMIN" ? "Make user" : "Make admin"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={row.id === currentUserId}
                  onClick={() => void remove(row)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

const emptyCareer = { title: "", slug: "", overview: "", marketExpectations: "", entryLevelExpectations: "" };

function CareersTab() {
  const { push } = useToast();
  const { data, loading, error, errorCode, reload } = useAsyncData(() => adminApi.listCareers());
  const [form, setForm] = useState(emptyCareer);
  const [requirements, setRequirements] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    try {
      await adminApi.createCareer({
        ...form,
        requirements: requirements
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((skillName) => ({ skillName, importance: "HIGH", type: "REQUIRED" as const })),
      });
      setForm(emptyCareer);
      setRequirements("");
      push("Career created. Topic import queued — see Ingest runs.");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not create career");
    } finally {
      setSaving(false);
    }
  }

  async function remove(career: adminApi.AdminCareer) {
    if (!window.confirm(`Delete "${career.title}"?`)) return;
    try {
      await adminApi.deleteCareer(career.id);
      push("Career deleted");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not delete career");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Add a career" />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Title"
              name="title"
              value={form.title}
              onChange={(e) =>
                setForm({
                  ...form,
                  title: e.target.value,
                  slug: form.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                })
              }
            />
            <Input
              label="Slug"
              name="slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </div>
          <Input
            label="Overview"
            name="overview"
            value={form.overview}
            onChange={(e) => setForm({ ...form, overview: e.target.value })}
          />
          <Input
            label="Market expectations"
            name="marketExpectations"
            value={form.marketExpectations}
            onChange={(e) => setForm({ ...form, marketExpectations: e.target.value })}
          />
          <Input
            label="Entry-level expectations"
            name="entryLevelExpectations"
            value={form.entryLevelExpectations}
            onChange={(e) => setForm({ ...form, entryLevelExpectations: e.target.value })}
          />
          <Input
            label="Required skills"
            name="requirements"
            placeholder="Node.js, PostgreSQL, Git"
            hint="Comma separated. Skills that do not exist yet are created automatically."
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
          />
          <Button
            disabled={saving || !form.title.trim() || !form.slug.trim()}
            onClick={() => void create()}
          >
            {saving ? "Saving…" : "Create career"}
          </Button>
        </CardBody>
      </Card>

      {data && data.length > 0 && <LaneEditor careers={data} />}

      <Card>
        <CardHeader title={`Careers${data ? ` (${data.length})` : ""}`} />
        <CardBody className="space-y-3">
          {loading && !data && <ListRowSkeleton count={4} />}
          {error && <ErrorState message={error} code={errorCode} onRetry={() => void reload()} />}
          {data?.map((career) => (
            <div
              key={career.id}
              className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 text-sm sm:flex-row sm:items-start sm:justify-between dark:border-slate-700"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {career.title} <span className="font-normal text-slate-500">· {career.slug}</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {career.requirements.length} requirements · {career._count?.goals ?? 0} user goals
                </p>
                {career.requirements.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {career.requirements.map((r) => r.skill.name).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void adminApi
                      .refreshCareerTopics(career.id)
                      .then((result) => {
                        push(
                          result.status === "queued"
                            ? `Topic refresh queued for ${career.title}. See Ingest runs below for progress.`
                            : result.note || `Could not queue ${career.title}`,
                        );
                      })
                      .catch((err) => push(err instanceof Error ? err.message : "Could not refresh topics"));
                  }}
                >
                  Latest topics
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(career)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <IngestRunsPanel onSettled={() => void reload()} />
    </div>
  );
}

function IngestRunsPanel({ onSettled }: { onSettled: () => void }) {
  const { data, loading, error, errorCode, reload } = useAsyncData(() => adminApi.listIngestRuns());
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useAsyncData(
    () => (openId ? adminApi.getIngestRun(openId) : Promise.resolve(null)),
    [openId],
  );

  function refresh() {
    void reload();
    if (openId) void detail.reload();
    onSettled();
  }

  return (
    <Card>
      <CardHeader
        title="Ingest runs"
        action={
          <Button size="sm" variant="outline" onClick={refresh}>
            Refresh
          </Button>
        }
      />
      <CardBody className="space-y-3 text-sm">
        {loading && !data && <ListRowSkeleton count={3} />}
        {error && <ErrorState message={error} code={errorCode} onRetry={() => void reload()} />}
        {data && data.length === 0 && <p className="text-slate-500">No runs yet.</p>}
        {data?.map((run) => (
          <div key={run.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <button
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
              onClick={() => setOpenId(openId === run.id ? null : run.id)}
            >
              <span className="font-medium">
                {run.trigger} · {run.status}
              </span>
              <span className="text-xs text-slate-500">
                {run.completedJobs}/{run.totalJobs} done
                {run.failedJobs ? ` · ${run.failedJobs} failed` : ""} · {new Date(run.createdAt).toLocaleString()}
              </span>
            </button>
            {openId === run.id && detail.data && (
              <ul className="mt-3 space-y-2">
                {detail.data.jobs.map((job) => (
                  <li key={job.id} className="rounded border border-slate-100 p-2 dark:border-slate-800">
                    <p className="font-medium">
                      {job.career.title} · {job.status}
                      {job.durationMs != null ? ` · ${(job.durationMs / 1000).toFixed(1)}s` : ""}
                    </p>
                    {job.result && (
                      <p className="text-xs text-slate-500">
                        +{job.result.added?.length ?? 0} topics · {job.result.usersUpdated ?? 0} learners
                        {job.result.note ? ` · ${job.result.note}` : ""}
                      </p>
                    )}
                    {job.error && <p className="text-xs text-red-600">{job.error}</p>}
                    <p className="mt-1 text-xs text-slate-500">
                      {job.steps.map((step) => `${step.stepKey}:${step.status}`).join(" → ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function LaneEditor({ careers }: { careers: adminApi.AdminCareer[] }) {
  const { push } = useToast();
  const [careerId, setCareerId] = useState(careers[0]?.id ?? "");
  const [laneId, setLaneId] = useState("core");
  const [paste, setPaste] = useState("");
  const [addName, setAddName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const { data, loading, error, errorCode, reload } = useAsyncData(
    () => (careerId ? adminApi.listLanes(careerId) : Promise.resolve(null)),
    [careerId],
  );
  const lane = data?.lanes.find((item) => item.id === laneId) ?? data?.lanes[0];

  async function saveList(skills: string[]) {
    if (!careerId || !lane) return;
    try {
      await adminApi.replaceLaneSkills(careerId, lane.id, skills);
      setPaste("");
      setAddName("");
      push("Lane skills saved");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not save lane skills");
    }
  }

  async function removeSkill(id: string) {
    try {
      await adminApi.deleteRequirement(id);
      push("Skill removed from this lane");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not delete skill");
    }
  }

  async function saveEdit(id: string) {
    try {
      await adminApi.updateRequirement(id, { skillName: editName.trim() });
      setEditId(null);
      push("Skill updated");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not update skill");
    }
  }

  return (
    <Card>
      <CardHeader title="Skills for one field and stack" />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Field</span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              value={careerId}
              onChange={(e) => {
                setCareerId(e.target.value);
                setLaneId("core");
              }}
            >
              {careers.map((career) => (
                <option key={career.id} value={career.id}>
                  {career.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Stack</span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              value={lane?.id ?? laneId}
              onChange={(e) => setLaneId(e.target.value)}
            >
              {(data?.lanes ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} ({item.skills.length})
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading && <ListRowSkeleton count={2} />}
        {error && <ErrorState message={error} code={errorCode} onRetry={() => void reload()} />}
        {lane && (
          <>
            <ul className="space-y-2">
              {lane.skills.length === 0 && <li className="text-sm text-slate-500">No skills on this stack yet.</li>}
              {lane.skills.map((skill) => (
                <li
                  key={skill.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                >
                  {editId === skill.id ? (
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  ) : (
                    <span className="min-w-0 truncate text-slate-900 dark:text-slate-100">
                      {skill.name} <span className="text-slate-500">· {skill.layer}</span>
                    </span>
                  )}
                  <span className="flex shrink-0 items-center gap-2">
                    {editId === skill.id ? (
                      <Button size="sm" onClick={() => void saveEdit(skill.id)}>
                        Save
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditId(skill.id);
                          setEditName(skill.name);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => void removeSkill(skill.id)}>
                      Delete
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-end gap-2">
              <Input label="Add one skill" name="addSkill" value={addName} onChange={(e) => setAddName(e.target.value)} />
              <Button
                disabled={!addName.trim()}
                onClick={() => void saveList([...lane.skills.map((skill) => skill.name), addName.trim()])}
              >
                Add
              </Button>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Upload or paste this stack</span>
              <textarea
                className="h-24 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                placeholder="Node.js, Express, PostgreSQL"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
            </label>
            <Button
              variant="outline"
              disabled={!paste.trim()}
              onClick={() =>
                void saveList(
                  paste
                    .split(",")
                    .map((name) => name.trim())
                    .filter(Boolean),
                )
              }
            >
              Replace this stack
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function SkillsTab() {
  const { push } = useToast();
  const { data, loading, error, errorCode, reload } = useAsyncData(() => adminApi.listSkills());
  const [form, setForm] = useState({ name: "", category: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", category: "" });

  async function create() {
    try {
      await adminApi.createSkill({ name: form.name.trim(), category: form.category.trim() || "General" });
      setForm({ name: "", category: "" });
      push("Skill created");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not create skill");
    }
  }

  async function saveEdit(id: string) {
    try {
      await adminApi.updateSkill(id, { name: edit.name.trim(), category: edit.category.trim() || "General" });
      setEditId(null);
      push("Skill updated");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not update skill");
    }
  }

  async function remove(skill: adminApi.AdminSkill) {
    if (!window.confirm(`Delete "${skill.name}"? It is removed from every career and profile.`)) return;
    try {
      await adminApi.deleteSkill(skill.id);
      push("Skill deleted");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not delete skill");
    }
  }

  return (
    <Card>
      <CardHeader title={`Skills${data ? ` (${data.length})` : ""}`} />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Input
            label="Name"
            name="skillName"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Category"
            name="skillCategory"
            placeholder="Backend"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <Button disabled={!form.name.trim()} onClick={() => void create()}>
            Add
          </Button>
        </div>
        {loading && !data && <ListRowSkeleton count={3} />}
        {error && <ErrorState message={error} code={errorCode} onRetry={() => void reload()} />}
        <ul className="flex flex-wrap gap-2">
          {data?.map((skill) => (
            <li
              key={skill.id}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700"
            >
              {editId === skill.id ? (
                <>
                  <input className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  <input className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
                  <button className="text-brand-700" onClick={() => void saveEdit(skill.id)}>
                    Save
                  </button>
                </>
              ) : (
                <span>
                  {skill.name}
                  <span className="ml-1 text-slate-500">· {skill.category}</span>
                </span>
              )}
              <button
                className="text-slate-500 hover:text-slate-800"
                onClick={() => {
                  setEditId(skill.id);
                  setEdit({ name: skill.name, category: skill.category });
                }}
              >
                Edit
              </button>
              <button
                className="text-slate-400 hover:text-red-600"
                aria-label={`Delete ${skill.name}`}
                onClick={() => void remove(skill)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
