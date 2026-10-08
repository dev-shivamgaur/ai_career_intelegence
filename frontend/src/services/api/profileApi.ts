import type { Profile, Project, UserPreferences, LearningStyle } from "@/types";
import { http } from "../http";
import { mapEnum } from "../mappers";

function mapProfile(raw: Record<string, unknown>): Profile {
  const goal = (raw.careerGoal as Record<string, unknown> | null) ?? null;
  const education = (raw.education as Array<Record<string, unknown>>) ?? [];
  const skills = (raw.skills as Array<Record<string, unknown>>) ?? [];
  const certifications = (raw.certifications as Array<Record<string, unknown>>) ?? [];
  const projects = (raw.projects as Array<Record<string, unknown>>) ?? [];
  const experience = (raw.experience as Array<Record<string, unknown>>) ?? [];

  return {
    id: String(raw.id),
    userId: String(raw.userId),
    name: String(raw.name ?? ""),
    status: mapEnum(String(raw.status), "fresher"),
    educationLevel: mapEnum(String(raw.educationLevel), "undergraduate"),
    location: String(raw.location ?? ""),
    availableHoursPerDay: Number(raw.availableHoursPerDay ?? 2),
    learningStyle: mapEnum(String(raw.learningStyle), "project") as LearningStyle,
    remotePreference: mapEnum(String(raw.remotePreference), "hybrid") as Profile["remotePreference"],
    careerTrack: mapEnum(String(raw.careerTrack ?? "private_tech"), "private_tech"),
    prepGoalText: raw.prepGoalText ? String(raw.prepGoalText) : "",
    targetExamSlug: raw.targetExamSlug ? String(raw.targetExamSlug) : "",
    targetExamName: raw.targetExamName ? String(raw.targetExamName) : null,
    profileStage: raw.profileStage
      ? {
          label: String((raw.profileStage as Record<string, unknown>).label ?? ""),
          detail: String((raw.profileStage as Record<string, unknown>).detail ?? ""),
        }
      : undefined,
    completionPercent: Number(raw.completionPercent ?? 0),
    education: education.map((e) => ({
      id: String(e.id),
      degree: String(e.degree ?? ""),
      institution: String(e.institution ?? ""),
      specialization: String(e.specialization ?? ""),
      graduationYear: Number(e.graduationYear ?? new Date().getFullYear()),
      level: mapEnum(String(e.level ?? raw.educationLevel), "undergraduate"),
      scoreLabel: e.scoreLabel ? String(e.scoreLabel) : undefined,
      aiDetected: Boolean(e.aiDetected),
    })),
    skills: skills.map((s) => ({
      id: String(s.id),
      name: String(s.name),
      category: String(s.category ?? "Tools"),
      proficiency: Number(s.proficiency ?? 0),
      source: mapEnum(String(s.source), "user"),
      status: s.status ? mapEnum(String(s.status), "good") : undefined,
    })),
    certifications: certifications.map((c) => ({
      id: String(c.id),
      name: String(c.name),
      issuer: String(c.issuer ?? ""),
      year: c.year ? Number(c.year) : undefined,
      aiDetected: Boolean(c.aiDetected),
    })),
    projects: projects.map((p) => ({
      id: String(p.id),
      name: String(p.name),
      description: String(p.description ?? ""),
      skills: Array.isArray(p.skills) ? (p.skills as string[]) : [],
      year: p.year ? Number(p.year) : undefined,
    })),
    experience: experience.map((e) => ({
      id: String(e.id),
      title: String(e.title),
      organization: String(e.organization ?? ""),
      type: mapEnum(String(e.type), "fresher"),
      summary: String(e.summary ?? ""),
    })),
    careerGoal: goal
      ? {
          id: String(goal.id),
          title: String(goal.title),
          slug: String(goal.slug),
        }
      : { id: "", title: "Not selected", slug: "" },
    primaryStack: raw.primaryStack ? String(raw.primaryStack) : null,
    evidence: raw.evidence
      ? {
          stack: (raw.evidence as Record<string, unknown>).stack
            ? String((raw.evidence as Record<string, unknown>).stack)
            : null,
          stackLabel: (raw.evidence as Record<string, unknown>).stackLabel
            ? String((raw.evidence as Record<string, unknown>).stackLabel)
            : null,
          confidence: Number((raw.evidence as Record<string, unknown>).confidence ?? 0),
          stackOptions: ((raw.evidence as Record<string, unknown>).stackOptions as Array<{
            id: string;
            label: string;
          }>) ?? [],
          seniority: (["none", "intern", "job"].includes(
            String((raw.evidence as Record<string, unknown>).seniority ?? "none"),
          )
            ? String((raw.evidence as Record<string, unknown>).seniority)
            : "none") as "none" | "intern" | "job",
          suggestedStatus: (raw.evidence as Record<string, unknown>).suggestedStatus
            ? String((raw.evidence as Record<string, unknown>).suggestedStatus)
            : null,
          needsStackConfirm: Boolean((raw.evidence as Record<string, unknown>).needsStackConfirm),
          learnerTier: (raw.evidence as Record<string, unknown>).learnerTier
            ? (String((raw.evidence as Record<string, unknown>).learnerTier) as NonNullable<
                Profile["evidence"]
              >["learnerTier"])
            : undefined,
          roleSkillMatchPercent: Number((raw.evidence as Record<string, unknown>).roleSkillMatchPercent ?? 0),
          roleSkillMatched: Number((raw.evidence as Record<string, unknown>).roleSkillMatched ?? 0),
          roleSkillTotal: Number((raw.evidence as Record<string, unknown>).roleSkillTotal ?? 0),
          pathLabel: (raw.evidence as Record<string, unknown>).pathLabel
            ? String((raw.evidence as Record<string, unknown>).pathLabel)
            : undefined,
          pathDetail: (raw.evidence as Record<string, unknown>).pathDetail
            ? String((raw.evidence as Record<string, unknown>).pathDetail)
            : undefined,
        }
      : undefined,
  };
}

function toApiProfile(patch: Partial<Profile>) {
  const body: Record<string, unknown> = {};
  if (patch.name) body.name = patch.name;
  if (patch.status) body.status = patch.status.toUpperCase();
  if (patch.educationLevel) body.educationLevel = patch.educationLevel.toUpperCase();
  if (patch.location !== undefined) body.location = patch.location;
  if (patch.availableHoursPerDay !== undefined) body.availableHoursPerDay = patch.availableHoursPerDay;
  if (patch.learningStyle) body.learningStyle = patch.learningStyle.toUpperCase();
  if (patch.remotePreference) body.remotePreference = patch.remotePreference.toUpperCase();
  if (patch.careerTrack) body.careerTrack = patch.careerTrack.toUpperCase();
  if (patch.prepGoalText !== undefined) body.prepGoalText = patch.prepGoalText;
  if (patch.targetExamSlug !== undefined) body.targetExamSlug = patch.targetExamSlug;
  if (patch.completionPercent !== undefined) body.completionPercent = patch.completionPercent;
  if (patch.careerGoal?.slug && patch.careerTrack !== "government_exam") body.careerSlug = patch.careerGoal.slug;
  if (patch.primaryStack) body.primaryStack = patch.primaryStack;
  if (patch.projects) body.projects = patch.projects.map(toApiProject);
  if (patch.education) {
    body.education = patch.education
      .filter((e) => e.degree.trim())
      .map((e) => ({
        id: e.id.startsWith("edu-") ? undefined : e.id,
        degree: e.degree.trim(),
        institution: e.institution || undefined,
        specialization: e.specialization || undefined,
        graduationYear: e.graduationYear || undefined,
        level: e.level.toUpperCase(),
      }));
  }
  return body;
}

function toApiProject(p: Pick<Project, "name" | "description" | "skills" | "year" | "link">) {
  return {
    name: p.name,
    description: p.description || undefined,
    skills: p.skills?.length ? p.skills : undefined,
    year: p.year || undefined,
    link: p.link || undefined,
  };
}

export async function getProfile(): Promise<Profile> {
  const raw = await http.get<Record<string, unknown>>("/profile");
  return mapProfile(raw);
}

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  const raw = await http.patch<Record<string, unknown>>("/profile", toApiProfile(patch));
  return mapProfile(raw);
}

export async function getPreferences(): Promise<UserPreferences> {
  const profile = await getProfile();
  return {
    targetCareerSlug: profile.careerTrack === "government_exam" ? "" : profile.careerGoal.slug,
    targetExamSlug: profile.targetExamSlug ?? "",
    targetExamName: profile.targetExamName,
    dailyHours: profile.availableHoursPerDay,
    learningStyle: profile.learningStyle,
    locationPreference: profile.location,
    remotePreference: profile.remotePreference,
    careerTrack: profile.careerTrack,
    notifications: { analysis: true, opportunities: true, progress: true },
    documentRetentionDays: 30,
  };
}

export async function updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
  const gov = patch.careerTrack === "government_exam";
  await http.patch("/profile", {
    availableHoursPerDay: patch.dailyHours,
    learningStyle: patch.learningStyle?.toUpperCase(),
    location: patch.locationPreference,
    remotePreference: patch.remotePreference?.toUpperCase(),
    careerTrack: patch.careerTrack?.toUpperCase(),
    careerSlug: gov ? undefined : patch.targetCareerSlug || undefined,
    targetExamSlug: gov ? patch.targetExamSlug || undefined : undefined,
  });
  return getPreferences();
}

export type ProjectInput = Pick<Project, "name" | "description" | "skills" | "year" | "link">;

export async function addProject(input: ProjectInput): Promise<void> {
  await http.post("/profile/projects", toApiProject(input));
}

export async function updateProject(id: string, input: ProjectInput): Promise<void> {
  await http.patch(`/profile/projects/${id}`, toApiProject(input));
}

export async function deleteProject(id: string): Promise<void> {
  await http.delete(`/profile/projects/${id}`);
}

export async function completeOnboarding(profile: Profile): Promise<Profile> {
  const raw = await http.post<Record<string, unknown>>("/profile/complete-onboarding", {
    ...toApiProfile(profile),
    completionPercent: 80,
    careerSlug: profile.careerTrack === "private_tech" ? profile.careerGoal.slug || undefined : undefined,
    customGoalTitle:
      profile.careerTrack === "private_tech"
        ? profile.prepGoalText || profile.careerGoal.title || undefined
        : undefined,
    prepGoalText: profile.prepGoalText,
    targetExamSlug: profile.careerTrack === "government_exam" ? profile.targetExamSlug || undefined : undefined,
    degree: profile.education[0]?.degree,
    institution: profile.education[0]?.institution,
    specialization: profile.education[0]?.specialization,
    graduationYear: profile.education[0]?.graduationYear,
    skills: profile.skills.map((s) => s.name),
    primaryStack: profile.primaryStack || undefined,
  });
  return mapProfile(raw);
}
