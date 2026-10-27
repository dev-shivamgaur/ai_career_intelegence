import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ProgressBar, ProgressRing } from "@/components/ui/Progress";
import { ProfileSkeleton } from "@/components/ui/Skeleton";
import { SkillBadge } from "@/components/ui/StatusBadge";
import { ErrorState } from "@/components/ui/States";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/store/hooks";
import * as profileApi from "@/services/api/profileApi";
import type { Profile } from "@/types";
import { useState } from "react";
import { useAsyncData } from "@/hooks/useAsyncData";
import { disconnectGithub, listEvidence, listGithub, scanGithub } from "@/services/api/learnerApi";
import { HiOutlineLink } from "react-icons/hi";
import { useNavigate } from "react-router-dom";

export function ProfilePage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { data, loading, error, errorCode, reload, setData } = useProfile();
  const [editing, setEditing] = useState<string | null>(null);
  const evidence = useAsyncData(() => listEvidence());
  const githubLinks = useAsyncData(() => listGithub());
  const [repoUrl, setRepoUrl] = useState("");

  if (loading) return <ProfileSkeleton />;
  if (error || !data) {
    return (
      <ErrorState
        title="Your profile could not be loaded"
        message={error ?? undefined}
        code={errorCode}
        onRetry={() => void reload()}
        onDashboard={() => navigate("/dashboard")}
      />
    );
  }

  const gov = data.careerTrack === "government_exam";

  async function save(next: Profile) {
    const updated = await profileApi.updateProfile(next);
    setData(updated);
    push("Profile updated");
    setEditing(null);
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardBody className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="relative shrink-0 self-start">
            <ProgressRing value={data.completionPercent} size={84} />
            <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
              {data.completionPercent}%
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                {data.name || "Your profile"}
              </h1>
              <Badge tone="brand">{gov ? "Sarkari prep" : "Private jobs"}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {[
                data.profileStage?.label ?? data.status.replaceAll("_", " "),
                gov ? data.targetExamName : data.evidence?.stackLabel,
                data.educationLevel.replaceAll("_", " "),
                data.location,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {data.profileStage?.detail && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {data.profileStage.detail}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing("personal")}>
                Edit details
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate("/onboarding")}>
                Update goal
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {!gov && data.evidence?.suggestedStatus &&
        data.evidence.suggestedStatus.toLowerCase() !== data.status && (
          <Card>
            <CardHeader
              title="Suggested status from resume"
              description="Confirm intern vs job. We do not guess this from marksheets."
            />
            <CardBody>
              <Button
                size="sm"
                onClick={() =>
                  void save({
                    ...data,
                    status: data.evidence!.suggestedStatus!.toLowerCase() as Profile["status"],
                  })
                }
              >
                Use {data.evidence.suggestedStatus.replaceAll("_", " ").toLowerCase()}
              </Button>
            </CardBody>
          </Card>
        )}
      {editing === "personal" && (
        <Card>
          <CardHeader
            title="Personal information"
            action={
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Name"
                name="name"
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
              />
              <Input
                label="Location"
                name="location"
                placeholder="e.g. Delhi NCR"
                value={data.location}
                onChange={(e) => setData({ ...data, location: e.target.value })}
              />
            </div>
            <Button onClick={() => void save(data)}>Save changes</Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="What you are preparing"
          description={gov ? "Projects are not part of sarkari prep." : "This drives private-job recommendations."}
        />
        <CardBody className="space-y-2">
          <p className="text-sm font-semibold">{data.careerGoal.title}</p>
          {data.prepGoalText && (
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{data.prepGoalText}</p>
          )}
          {gov && data.targetExamName && (
            <p className="text-xs text-slate-500">Selected exam: {data.targetExamName}</p>
          )}
          <ProgressBar className="pt-2" value={data.completionPercent} label="Profile completion" />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Education" />
          <CardBody className="space-y-4">
            {data.education.length === 0 && (
              <p className="text-sm text-slate-500">
                No education added yet. Upload a marksheet or add it during onboarding.
              </p>
            )}
            {data.education.map((e) => (
              <div key={e.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-sm font-medium">{e.degree}</p>
                <p className="mt-0.5 text-sm text-slate-500">{e.institution}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {[e.specialization, e.graduationYear, e.scoreLabel].filter(Boolean).join(" · ")}
                </p>
                {e.aiDetected && (
                  <div className="mt-2">
                    <Badge tone="info">From documents</Badge>
                  </div>
                )}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Skills" description={`${data.skills.length} saved`} />
          <CardBody>
            {data.skills.length === 0 ? (
              <p className="text-sm text-slate-500">No skills saved yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.skills.map((s) => (
                  <SkillBadge key={s.id} name={s.name} ai={s.source !== "user"} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {!gov && (
          <Card>
            <CardHeader title="Projects" description="Pulled from your resume and GitHub links when present." />
            <CardBody className="space-y-3">
              {data.projects.length === 0 && (
                <p className="text-sm text-slate-500">No projects yet — one solid project is enough to start.</p>
              )}
              {data.projects.map((p) => (
                <div key={p.id} className="rounded-lg border border-[#C4C4C4] p-3 dark:border-[#3A3333]">
                  <p className="text-sm font-medium">{p.name}</p>
                  {p.description ? <p className="mt-1 text-sm leading-relaxed text-[#5C4E4E] dark:text-[#988686]">{p.description}</p> : null}
                  {p.link ? (
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-ink underline dark:text-[#AFEEEE]"
                    >
                      <HiOutlineLink className="h-3.5 w-3.5" />
                      {p.link.replace(/^https?:\/\//, "")}
                    </a>
                  ) : null}
                  {/GitHub analysis/i.test(p.description) ? (
                    <p className="mt-1 text-xs font-medium text-brand-700">Analyzed from GitHub</p>
                  ) : null}
                  {p.skills?.length ? (
                    <p className="mt-1 text-xs text-slate-500">{p.skills.join(" · ")}</p>
                  ) : null}
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Skill evidence" description="A new resume or GitHub scan adds a record. Older records stay." />
          <CardBody className="space-y-2 text-sm">
            <div className="flex gap-2">
              <Input placeholder="https://github.com/owner/repo" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
              <Button
                size="sm"
                onClick={() =>
                  void scanGithub(repoUrl).then(() => {
                    setRepoUrl("");
                    void evidence.reload();
                    void githubLinks.reload();
                  })
                }
              >
                Scan public repo
              </Button>
            </div>
            <ul className="space-y-2">
              {(githubLinks.data ?? []).map((link) => (
                <li key={link.id} className="rounded-lg border border-[#C4C4C4] p-3 dark:border-[#3A3333]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {link.owner}/{link.repo}
                        {link.revokedAt ? " · disconnected" : ""}
                      </p>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 break-all text-sm text-ink underline dark:text-[#AFEEEE]"
                      >
                        <HiOutlineLink className="h-3.5 w-3.5 shrink-0" />
                        {link.url}
                      </a>
                    </div>
                    {!link.revokedAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void disconnectGithub(link.id).then(() => githubLinks.reload())}
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <ul className="space-y-1">
              {(evidence.data ?? []).slice(0, 12).map((row) => (
                <li key={row.id}>
                  {row.skill} · {row.source} · {row.quality}
                  {row.current ? "" : " · earlier"} · {new Date(row.observedAt).toLocaleDateString()}
                </li>
              ))}
            </ul>
            {evidence.data && evidence.data.length === 0 && <p className="text-slate-500">No skill evidence recorded yet.</p>}
          </CardBody>
        </Card>

        {data.experience.length > 0 && (
          <Card>
            <CardHeader title="Experience" />
            <CardBody className="space-y-3">
              {data.experience.map((e) => (
                <div key={e.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-sm font-medium">{e.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">{e.summary}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
