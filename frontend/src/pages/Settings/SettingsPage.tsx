import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { ProfileSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useAuth, useToast } from "@/store/hooks";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as careerApi from "@/services/api/careerApi";
import * as documentApi from "@/services/api/documentApi";
import * as profileApi from "@/services/api/profileApi";
import * as sarkariApi from "@/services/api/sarkariApi";
import type { CareerTrack, LearningStyle, Profile, UserPreferences } from "@/types";
import { mapEnum, toApiEnum } from "@/services/mappers";
import { LogOut, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile } from "@/context/ProfileContext";
import { PlanCard } from "@/paid";

export function SettingsPage() {
  const { logout } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const profile = useProfile();
  const prefs = useAsyncData(() => profileApi.getPreferences());
  const careers = useAsyncData(() => careerApi.listCareers());
  const exams = useAsyncData(() => sarkariApi.listExams());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  if (prefs.loading) return <ProfileSkeleton />;
  if (prefs.error || !prefs.data) {
    return (
      <ErrorState
        title="Settings could not be loaded"
        message={prefs.error ?? undefined}
        code={prefs.errorCode}
        onRetry={() => void prefs.reload()}
        onDashboard={() => navigate("/dashboard")}
      />
    );
  }

  const p = prefs.data;

  function patch(next: Partial<UserPreferences>) {
    prefs.setData({ ...p, ...next });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const next = await profileApi.updatePreferences(p);
      prefs.setData(next);
      setDirty(false);
      await profile.reload();
      push(
        "Settings saved. Skill gap, roadmap, dashboard scores, progress, and research are rebuilding for this role.",
      );
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  const gov = p.careerTrack === "government_exam";
  const careerOptions = (careers.data ?? [])
    .filter((c) => c.slug !== "custom-goal")
    .map((c) => ({ value: c.slug, label: c.title }));
  const examOptions = (exams.data ?? []).map((e) => ({
    value: e.slug,
    label: `${e.shortName} — ${e.name}`,
  }));
  if (gov && p.targetExamSlug && !examOptions.some((o) => o.value === p.targetExamSlug)) {
    examOptions.unshift({
      value: p.targetExamSlug,
      label: p.targetExamName || p.targetExamSlug,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Preferences that drive your recommendations. Name and education are edited on the Profile page."
        action={
          <Button onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        }
      />

      <PlanCard plan={profile.data?.plan} />

      <Card>
        <CardHeader
          title="Career preferences"
          description={
            gov
              ? "Track and exam decide sarkari flags and Copilot. Private roles stay off this path."
              : "Track and career decide FitScore and the private-sector syllabus we compare you against."
          }
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Preparation track"
            name="careerTrack"
            value={toApiEnum(p.careerTrack)}
            options={[
              { value: "PRIVATE_TECH", label: "Private / tech jobs" },
              { value: "GOVERNMENT_EXAM", label: "Sarkari naukri exams" },
            ]}
            onChange={(e) => {
              const careerTrack = mapEnum(e.target.value, "private_tech") as CareerTrack;
              patch({
                careerTrack,
                targetCareerSlug: careerTrack === "government_exam" ? "" : p.targetCareerSlug,
                targetExamSlug: careerTrack === "government_exam" ? p.targetExamSlug : p.targetExamSlug,
              });
            }}
          />
          {gov ? (
            <Select
              label="Target exam"
              name="targetExamSlug"
              value={p.targetExamSlug}
              options={
                examOptions.length
                  ? examOptions
                  : [{ value: p.targetExamSlug || "", label: p.targetExamName || "No exams in catalog" }]
              }
              onChange={(e) => patch({ targetExamSlug: e.target.value, targetCareerSlug: "" })}
            />
          ) : (
            <Select
              label="Target career"
              name="targetCareerSlug"
              value={p.targetCareerSlug}
              options={
                careerOptions.length
                  ? careerOptions
                  : [{ value: p.targetCareerSlug, label: p.targetCareerSlug || "No careers available" }]
              }
              onChange={(e) => patch({ targetCareerSlug: e.target.value, targetExamSlug: "" })}
            />
          )}
          <Select
            label="Preferred learning style"
            name="learningStyle"
            value={toApiEnum(p.learningStyle)}
            options={[
              { value: "PROJECT", label: "Project-based" },
              { value: "COURSE", label: "Courses" },
              { value: "MIXED", label: "Mixed" },
              { value: "READING", label: "Reading" },
            ]}
            onChange={(e) => patch({ learningStyle: mapEnum(e.target.value, "project") as LearningStyle })}
          />
          <Input
            label="Daily available time (hours)"
            name="dailyHours"
            type="number"
            min={1}
            max={16}
            value={p.dailyHours}
            onChange={(e) => patch({ dailyHours: Number(e.target.value) })}
          />
          <Input
            label="Location preference"
            name="locationPreference"
            placeholder="e.g. Delhi NCR"
            value={p.locationPreference}
            onChange={(e) => patch({ locationPreference: e.target.value })}
          />
          {!gov && (
          <Select
            label="Remote preference"
            name="remotePreference"
            value={toApiEnum(p.remotePreference)}
            options={[
              { value: "ANY", label: "Any" },
              { value: "REMOTE", label: "Remote" },
              { value: "HYBRID", label: "Hybrid" },
              { value: "ONSITE", label: "On-site" },
            ]}
            onChange={(e) => patch({ remotePreference: mapEnum(e.target.value, "hybrid") as Profile["remotePreference"] })}
          />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notifications" description="Choose what we alert you about in the app." />
        <CardBody className="divide-y divide-slate-100 dark:divide-slate-800">
          {(
            [
              ["analysis", "Career analysis", "New match scores and analysis updates."],
              ["opportunities", "Opportunities", "Matching jobs and sarkari vacancies."],
              ["progress", "Progress", "Roadmap reminders and completed milestones."],
            ] as const
          ).map(([key, label, hint]) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 py-3 first:pt-0 last:pb-0">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                checked={p.notifications[key]}
                onChange={(e) => patch({ notifications: { ...p.notifications, [key]: e.target.checked } })}
              />
              <span>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Privacy" description="Documents are stored on the server for your account, never in the browser." />
        <CardBody className="space-y-4">
          <Input
            label="Document retention (days)"
            name="documentRetentionDays"
            type="number"
            min={1}
            value={p.documentRetentionDays}
            onChange={(e) => patch({ documentRetentionDays: Number(e.target.value) })}
          />
          <Button
            variant="outline"
            onClick={() => void documentApi.deleteAllDocuments().then(() => push("Documents deleted"))}
          >
            <Trash2 className="h-4 w-4" />
            Delete all documents
          </Button>
        </CardBody>
      </Card>

      <Card className="border-red-200 dark:border-red-900/60">
        <CardHeader title="Account" description="You will need a new OTP to sign back in." />
        <CardBody>
          <Button variant="danger" onClick={() => void logout().then(() => navigate("/login"))}>
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
