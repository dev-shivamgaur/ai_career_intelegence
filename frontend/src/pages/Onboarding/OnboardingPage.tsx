import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ProgressBar } from "@/components/ui/Progress";
import { ProfileSkeleton } from "@/components/ui/Skeleton";
import * as careerApi from "@/services/api/careerApi";
import * as documentApi from "@/services/api/documentApi";
import * as profileApi from "@/services/api/profileApi";
import * as sarkariApi from "@/services/api/sarkariApi";
import { DocumentUploadSlots } from "@/components/documents/DocumentUploadSlots";
import { FieldPicker } from "@/components/onboarding/FieldPicker";
import { documentNeeds, classifyMarksheetPaper, requiredMarksheets } from "@/lib/documentRequirements";
import { mapEnum, toApiEnum } from "@/services/mappers";
import { useAppDispatch, useAuth, useToast } from "@/store/hooks";
import { restoreSession } from "@/store/slices/authSlice";
import type { Career, CareerTrack, DocumentType, Education, EducationLevel, Profile, UploadedDocument, UserStatus } from "@/types";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const emptyEducation = (): Education => ({
  id: `edu-${Date.now()}`,
  degree: "",
  institution: "",
  specialization: "",
  graduationYear: new Date().getFullYear(),
  level: "undergraduate",
});

const STEP_KEY = (userId: string) => `aci:onboarding-step:${userId}`;

function readOnboardingStep(userId?: string) {
  if (!userId) return 1;
  const n = Number(localStorage.getItem(STEP_KEY(userId)));
  return n === 2 || n === 3 ? n : 1;
}

function writeOnboardingStep(userId: string | undefined, step: number) {
  if (!userId) return;
  localStorage.setItem(STEP_KEY(userId), String(step));
}

function clearOnboardingStep(userId: string | undefined) {
  if (!userId) return;
  localStorage.removeItem(STEP_KEY(userId));
}

function stepOneIsSaved(profile: Profile) {
  const slug = profile.careerGoal?.slug?.trim();
  const title = profile.careerGoal?.title?.trim();
  return Boolean(
    profile.targetExamSlug?.trim() ||
      profile.prepGoalText?.trim() ||
      slug ||
      (title && title !== "Not selected"),
  );
}

const emptyProfile = (): Profile => ({
  id: "",
  userId: "",
  name: "",
  status: "fresher",
  educationLevel: "undergraduate",
  location: "",
  availableHoursPerDay: 2,
  learningStyle: "mixed",
  remotePreference: "any",
  careerTrack: "private_tech",
  prepGoalText: "",
  targetExamSlug: "",
  completionPercent: 0,
  education: [
    {
      id: "edu-new",
      degree: "",
      institution: "",
      specialization: "",
      graduationYear: new Date().getFullYear(),
      level: "undergraduate",
    },
  ],
  skills: [],
  certifications: [],
  projects: [],
  experience: [],
  careerGoal: { id: "", title: "", slug: "" },
  primaryStack: null,
});

export function OnboardingPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const [step, setStep] = useState(() => readOnboardingStep(user?.id));
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [hydrating, setHydrating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [docs, setDocs] = useState<UploadedDocument[]>([]);
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [careers, setCareers] = useState<Career[]>([]);
  const [exams, setExams] = useState<Awaited<ReturnType<typeof sarkariApi.listExams>>>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const gov = profile.careerTrack === "government_exam";
  const maxStep = 3;

  useEffect(() => {
    let active = true;
    setFieldsLoading(true);
    if (gov) {
      void sarkariApi
        .listExams()
        .then((rows) => {
          if (active) setExams(rows);
        })
        .catch(() => {
          if (active) setExams([]);
        })
        .finally(() => {
          if (active) setFieldsLoading(false);
        });
    } else {
      void careerApi
        .listCareers()
        .then((rows) => {
          if (active) setCareers(rows);
        })
        .catch(() => {
          if (active) setCareers([]);
        })
        .finally(() => {
          if (active) setFieldsLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [gov]);

  useEffect(() => {
    if (step !== 2) return;
    void documentApi.listDocuments().then(setDocs).catch(() => setDocs([]));
  }, [step]);

  useEffect(() => {
    let active = true;
    void profileApi
      .getProfile()
      .then((saved) => {
        if (!active) return;
        setProfile((current) => ({
          ...current,
          ...saved,
          education: saved.education.length ? saved.education : current.education,
        }));
        setStep((current) => {
          if (current > 1) return current;
          if (stepOneIsSaved(saved)) {
            writeOnboardingStep(user?.id, 2);
            return 2;
          }
          return current;
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setHydrating(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function uploadSlot(type: DocumentType, files: File[], label?: string) {
    setUploadingType(type);
    setError("");
    try {
      for (const file of files) {
        const created = await documentApi.uploadDocument(file, type, {
          label,
          status: profile.status,
          educationLevel: profile.educationLevel,
        });
        setDocs((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
        const done = await documentApi.waitForDocument(created.id);
        setDocs((prev) => prev.map((d) => (d.id === done.id ? done : d)));
        if (done.status === "failed") {
          throw new Error(`${file.name} saved but extraction failed. Try a clearer photo or a smaller PDF.`);
        }
        if (type === "resume") {
          const extracted = await documentApi.getExtractedData(done.id);
          const found = extracted.skillsDetected ?? [];
          setProfile((current) => {
            const have = new Set(current.skills.map((skill) => skill.name.toLowerCase()));
            const extra = found
              .map((name) => name.trim())
              .filter((name) => name && !have.has(name.toLowerCase()))
              .map((name) => ({
                id: `sk-${name.toLowerCase()}`,
                name,
                category: "Resume",
                proficiency: 50,
                source: "document" as const,
              }));
            return extra.length ? { ...current, skills: [...current.skills, ...extra] } : current;
          });
        }
      }
      setDocs(await documentApi.listDocuments());
      const saved = await profileApi.getProfile();
      setProfile((current) => {
        const serverNames = new Set(saved.skills.map((skill) => skill.name.toLowerCase()));
        const localOnly = current.skills.filter((skill) => !serverNames.has(skill.name.toLowerCase()));
        return {
          ...current,
          ...saved,
          education: saved.education.length ? saved.education : current.education,
          skills: [...saved.skills, ...localOnly],
        };
      });
      push("Document uploaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      throw err;
    } finally {
      setUploadingType(null);
    }
  }

  async function deleteSlot(id: string) {
    try {
      await documentApi.deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      push("Document removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete document");
      throw err;
    }
  }

  async function replaceSlot(doc: UploadedDocument, file: File, label?: string) {
    setReplacingId(doc.id);
    setError("");
    try {
      const updated = await documentApi.replaceDocument(doc.id, file, doc.type, {
        label,
        status: profile.status,
        educationLevel: profile.educationLevel,
      });
      setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      const done = await documentApi.waitForDocument(updated.id);
      setDocs((prev) => prev.map((d) => (d.id === done.id ? done : d)));
      if (done.status === "failed") {
        throw new Error(`${file.name} saved but extraction failed. Try a clearer photo or a smaller PDF.`);
      }
      setDocs(await documentApi.listDocuments());
      const saved = await profileApi.getProfile();
      setProfile((p) => ({ ...p, ...saved, education: saved.education.length ? saved.education : p.education }));
      push("Document updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not replace document");
      throw err;
    } finally {
      setReplacingId(null);
    }
  }

  async function goNext() {
    if (step === 1) {
      try {
        await profileApi.updateProfile(profile);
      } catch {
        /* extraction still receives status on the upload form */
      }
    }
    if (step === 2) {
      if (uploadingType || replacingId) {
        setError("Stay on this step while the file is being read.");
        return;
      }
      const resume = docs.filter((doc) => doc.type === "resume");
      const resumeBusy = resume.some(
        (doc) => doc.status === "uploading" || doc.status === "processing" || doc.status === "extracting",
      );
      if (resumeBusy) {
        setError("Resume skills are still being read. The next step opens after that finishes.");
        return;
      }
      const resumeFailed = resume.find((doc) => doc.status === "failed");
      if (resumeFailed) {
        setError("The resume could not be read. Replace the PDF or remove it, then continue.");
        return;
      }
      const needs = documentNeeds(profile.status, profile.educationLevel, profile.careerTrack);
      const missing: string[] = [];
      const papers = requiredMarksheets(profile.educationLevel, profile.careerTrack);
      for (const paper of papers) {
        const have = docs.some(
          (d) =>
            d.type === "marksheet" &&
            classifyMarksheetPaper(d.filename) === paper,
        );
        if (!have) missing.push(paper === "tenth" ? "Class 10 marksheet" : "Class 12 marksheet");
      }
      if (needs.marksheet === "required" && !papers.length && !docs.some((d) => d.type === "marksheet")) {
        missing.push("marksheet");
      }
      if (needs.degree === "required" && !docs.some((d) => d.type === "degree")) missing.push("degree");
      if (missing.length) {
        setError(`Upload required: ${missing.join(" and ")}.`);
        return;
      }
    }
    setError("");
    const next = step + 1;
    setStep(next);
    writeOnboardingStep(user?.id, next);
  }

  async function finish() {
    setSaving(true);
    setError("");
    try {
      await profileApi.completeOnboarding({ ...profile, completionPercent: 80 });
      clearOnboardingStep(user?.id);
      await dispatch(restoreSession());
      push("Profile saved. Your learning plan is ready.");
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile. Please retry.");
    } finally {
      setSaving(false);
    }
  }

  if (hydrating) return <ProfileSkeleton />;

  return (
    <div className={`mx-auto ${step === 2 ? "max-w-6xl" : "max-w-2xl"}`}>
      <p className="text-sm font-medium text-slate-500">
        Setup · Step {step} of {maxStep}
      </p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
        {step === 1 && "What do you want to become?"}
        {step === 2 && "Upload proof of what you already have"}
        {step === 3 && (gov ? "Which papers are you starting?" : "What are you learning right now?")}
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
        {step === 1 &&
          "Pick Student if your degree is still in progress (1st / 2nd / 3rd year). Then search a private field or a sarkari exam."}
        {step === 2 &&
          (gov
            ? "Class 10 (age), then 12th, then graduation if the exam asks. Board marks are not a score."
            : "10th, 12th, and semester marksheets are all optional. You can add more than one degree. We judge from whatever you upload.")}
        {step === 3 &&
          (gov
            ? "Optional. Name papers you already revise (Quant, Reasoning…). Knowledge is judged later from mocks, not this list."
            : "Skills you are studying now. Combined with documents and the role, this is the gap we close.")}
      </p>
      <ProgressBar className="mt-5" value={Math.round((step / maxStep) * 100)} label="Setup" />

      <Card className="mt-6">
        <CardBody className="space-y-4">
          {step === 1 && (
            <>
              <Input
                label="Name"
                name="name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              />
              <Select
                label="Current status"
                name="status"
                value={toApiEnum(profile.status)}
                options={[
                  { value: "STUDENT", label: "Student (degree not finished yet)" },
                  { value: "FRESHER", label: "Fresher / graduate (degree complete)" },
                  { value: "WORKING_PROFESSIONAL", label: "Working professional" },
                ]}
                onChange={(e) => setProfile({ ...profile, status: mapEnum(e.target.value, "fresher") as UserStatus })}
              />
              {profile.status === "student" ? (
                <p className="text-xs leading-relaxed text-slate-500">
                  Choose this if you are in 1st, 2nd, or 3rd year and the degree is not complete. Next step will not
                  force a degree certificate. Marksheets stay optional.
                </p>
              ) : profile.status === "fresher" ? (
                <p className="text-xs leading-relaxed text-slate-500">
                  Choose this after you have finished at least one degree. That degree certificate is required.
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-slate-500">
                  Choose this if you already have a job. Upload the degrees you hold; extra marksheets stay optional.
                </p>
              )}
              <Select
                label="Highest education level you are in / have finished"
                name="educationLevel"
                value={toApiEnum(profile.educationLevel)}
                options={[
                  { value: "HIGH_SCHOOL", label: "Class 10 / High school" },
                  { value: "INTERMEDIATE", label: "Class 12 / Intermediate" },
                  { value: "DIPLOMA", label: "Diploma" },
                  { value: "UNDERGRADUATE", label: "Undergraduate (BCA / B.Tech / BA…)" },
                  { value: "POSTGRADUATE", label: "Postgraduate (MCA / M.Tech / MA…)" },
                ]}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    educationLevel: mapEnum(e.target.value, "undergraduate") as EducationLevel,
                  })
                }
              />
              <div className="space-y-3">
                {profile.education.map((edu, index) => (
                  <div key={edu.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">Qualification {index + 1}</p>
                      {profile.education.length > 1 && (
                        <button
                          type="button"
                          className="text-xs text-slate-500"
                          onClick={() =>
                            setProfile({
                              ...profile,
                              education: profile.education.filter((row) => row.id !== edu.id),
                            })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <Select
                      label="Level"
                      name={`edu-level-${edu.id}`}
                      value={toApiEnum(edu.level)}
                      options={[
                        { value: "HIGH_SCHOOL", label: "Class 10" },
                        { value: "INTERMEDIATE", label: "Class 12" },
                        { value: "DIPLOMA", label: "Diploma" },
                        { value: "UNDERGRADUATE", label: "Undergraduate" },
                        { value: "POSTGRADUATE", label: "Postgraduate" },
                      ]}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          education: profile.education.map((row) =>
                            row.id === edu.id
                              ? { ...row, level: mapEnum(e.target.value, "undergraduate") as EducationLevel }
                              : row,
                          ),
                        })
                      }
                    />
                    <Input
                      label="Course / board name"
                      name={`degree-${edu.id}`}
                      placeholder="e.g. Class 12, BCA"
                      value={edu.degree}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          education: profile.education.map((row) =>
                            row.id === edu.id ? { ...row, degree: e.target.value } : row,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setProfile({ ...profile, education: [...profile.education, emptyEducation()] })}
                >
                  Add another qualification
                </Button>
              </div>
              <Select
                label="Track"
                name="careerTrack"
                value={toApiEnum(profile.careerTrack)}
                options={[
                  { value: "PRIVATE_TECH", label: "Private / tech jobs" },
                  { value: "GOVERNMENT_EXAM", label: "Sarkari naukri exams" },
                ]}
                onChange={(e) =>
                  setProfile({ ...profile, careerTrack: mapEnum(e.target.value, "private_tech") as CareerTrack })
                }
              />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  In one line, what do you want to achieve?
                </span>
                <textarea
                  className="min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  placeholder="I want to become a backend developer."
                  value={profile.prepGoalText}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      prepGoalText: e.target.value,
                      careerGoal: { ...profile.careerGoal, title: e.target.value || profile.careerGoal.title },
                    })
                  }
                />
              </label>
              {gov ? (
                <FieldPicker
                  label="Search a sarkari exam"
                  placeholder="Type SSC, UPSC, banking…"
                  loading={fieldsLoading}
                  selectedId={profile.careerGoal.slug || profile.targetExamSlug}
                  items={exams.map((exam) => ({
                    id: exam.slug,
                    title: exam.shortName,
                    hint: exam.name,
                    slug: exam.slug,
                  }))}
                  onSelect={(item) =>
                    setProfile({
                      ...profile,
                      targetExamSlug: item.slug ?? item.id,
                      careerGoal: { id: item.id, title: item.title, slug: item.slug ?? item.id },
                    })
                  }
                />
              ) : (
                <FieldPicker
                  label="Search a private-sector field"
                  placeholder="Type backend, AWS, Android, cyber security…"
                  loading={fieldsLoading}
                  selectedId={profile.careerGoal.slug || profile.careerGoal.title}
                  items={careers
                    .filter((c) => c.slug !== "custom-goal")
                    .map((g) => ({
                      id: g.slug,
                      title: g.title,
                      hint: "We judge this field from your skills, resume, and documents",
                      slug: g.slug,
                    }))}
                  onSelect={(item) =>
                    setProfile({
                      ...profile,
                      careerGoal: { id: item.id, title: item.title, slug: item.slug ?? item.id },
                    })
                  }
                  onCustom={(q) =>
                    setProfile({
                      ...profile,
                      careerGoal: { id: "", title: q, slug: "" },
                      prepGoalText: profile.prepGoalText || q,
                    })
                  }
                />
              )}
              {!gov && profile.careerGoal.title && !profile.careerGoal.slug && (
                <p className="text-sm text-brand-700">Selected field: {profile.careerGoal.title} (saved as your own field)</p>
              )}
              {!gov && profile.careerGoal.slug && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Main language / framework / tool?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(careers.find((c) => c.slug === profile.careerGoal.slug)?.stackLanes ?? []).map((lane) => (
                      <button
                        key={lane.id}
                        type="button"
                        className={`rounded-full border px-3 py-1 text-sm ${
                          profile.primaryStack === lane.id
                            ? "border-brand-600 bg-brand-50 text-brand-800"
                            : "border-slate-300 dark:border-slate-600"
                        }`}
                        onClick={() => setProfile({ ...profile, primaryStack: lane.id })}
                      >
                        {lane.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Confirm this if we cannot tell from skills and resume. College papers do not pick the stack.
                  </p>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Status: {profile.status.replaceAll("_", " ")}. Pick 10th / 12th / semester chips and upload as many
                marksheets as you want. Add each degree by name. Nothing extra is forced if you are still studying.
              </p>
              <DocumentUploadSlots
                status={profile.status}
                educationLevel={profile.educationLevel}
                careerTrack={profile.careerTrack}
                documents={docs}
                uploadingType={uploadingType}
                replacingId={replacingId}
                onUpload={(type, files, label) => uploadSlot(type, files, label)}
                onDelete={(id) => deleteSlot(id)}
                onReplace={(doc, file, label) => replaceSlot(doc, file, label)}
              />
            </>
          )}

          {step === 3 && (
            <>
              {gov && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Sarkari users do not add Node.js or coding stacks here. Age and education come from 10th / 12th /
                  degree. Knowledge comes from mocks on your exam plan. You can skip this list or tag papers you already
                  study.
                </p>
              )}
              {gov && (
                <div className="flex flex-wrap gap-2">
                  {["Quantitative Aptitude", "Reasoning", "English", "General Awareness"].map((paper) => (
                    <button
                      key={paper}
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs dark:border-slate-700"
                      onClick={() => {
                        if (profile.skills.some((s) => s.name.toLowerCase() === paper.toLowerCase())) return;
                        setProfile({
                          ...profile,
                          skills: [
                            ...profile.skills,
                            {
                              id: `sk-${Date.now()}`,
                              name: paper,
                              category: "Exam paper",
                              proficiency: 40,
                              source: "user",
                            },
                          ],
                        });
                      }}
                    >
                      + {paper}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <Input
                  label={gov ? "Exam paper or topic (optional)" : "Currently learning / already know"}
                  name="skill"
                  className="flex-1"
                  placeholder={gov ? "e.g. Polity, Quant" : "e.g. Node.js"}
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (!skillInput.trim()) return;
                    setProfile({
                      ...profile,
                      skills: [
                        ...profile.skills,
                        {
                          id: `sk-${Date.now()}`,
                          name: skillInput.trim(),
                          category: gov ? "Exam paper" : "General",
                          proficiency: 50,
                          source: "user",
                        },
                      ],
                    });
                    setSkillInput("");
                  }}
                />
                <Button
                  className="shrink-0"
                  onClick={() => {
                    if (!skillInput.trim()) return;
                    setProfile({
                      ...profile,
                      skills: [
                        ...profile.skills,
                        {
                          id: `sk-${Date.now()}`,
                          name: skillInput.trim(),
                          category: gov ? "Exam paper" : "General",
                          proficiency: 50,
                          source: "user",
                        },
                      ],
                    });
                    setSkillInput("");
                  }}
                >
                  Add
                </Button>
              </div>
              {profile.skills.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {gov
                    ? "Nothing required here. Save and open the exam dashboard to upload papers and log mocks."
                    : "No skills yet. Documents may already have added some."}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {profile.skills.map((s) => (
                    <li key={s.id}>
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700"
                        onClick={() =>
                          setProfile({ ...profile, skills: profile.skills.filter((x) => x.id !== s.id) })
                        }
                      >
                        {s.name}
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardBody>
      </Card>

      <div className="mt-6 flex justify-between gap-3">
        <Button
          variant="outline"
          disabled={step === 1 || saving}
          onClick={() => {
            const next = Math.max(1, step - 1);
            setStep(next);
            writeOnboardingStep(user?.id, next);
          }}
        >
          Back
        </Button>
        {step < maxStep ? (
          <Button disabled={Boolean(uploadingType || replacingId)} onClick={() => void goNext()}>
            {uploadingType || replacingId ? "Reading document…" : "Continue"}
          </Button>
        ) : (
          <Button disabled={saving} onClick={() => void finish()}>
            {saving ? (gov ? "Saving…" : "Building your gap plan…") : "Save and open dashboard"}
          </Button>
        )}
      </div>
    </div>
  );
}
