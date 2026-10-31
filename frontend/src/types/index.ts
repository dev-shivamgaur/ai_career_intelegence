export type UserStatus = "student" | "fresher" | "working_professional";
export type EducationLevel = "high_school" | "intermediate" | "diploma" | "undergraduate" | "postgraduate";
export type SkillSource = "user" | "ai_detected" | "document";
export type SkillStatus = "strong" | "good" | "needs_improvement" | "missing";
export type Priority = "high" | "medium" | "low";
export type TaskStatus = "not_started" | "in_progress" | "completed" | "skipped";
export type DocumentType = "degree" | "marksheet" | "certificate" | "resume" | "other";
export type DocumentProcessingStatus =
  | "uploading"
  | "processing"
  | "extracting"
  | "completed"
  | "failed";
export type JobMatchLabel = "strong" | "potential" | "low";
export type EligibilityStatus = "eligible" | "possibly_eligible" | "not_eligible" | "needs_verification";
export type SourceQuality = "official" | "trusted" | "established" | "community" | "unverified";
export type SourceType = "job" | "learning" | "government" | "career_guide" | "community";
export type EvidenceKind = "profile" | "market" | "document" | "research";
export type LearningStyle = "project" | "course" | "mixed" | "reading";
export type CareerTrack = "private_tech" | "government_exam";
export type NotificationType = "analysis" | "opportunity" | "progress" | "profile";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarInitials: string;
  role: UserRole;
  isDemo: boolean;
  onboardingComplete: boolean;
}

export type UserRole = "user" | "admin";

export interface AuthSession {
  userId: string;
  email: string;
  name: string;
  isDemo: boolean;
  createdAt: string;
}

export interface Education {
  id: string;
  degree: string;
  institution: string;
  specialization: string;
  graduationYear: number;
  level: EducationLevel;
  scoreLabel?: string;
  aiDetected?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  proficiency: number;
  source: SkillSource;
  status?: SkillStatus;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  year?: number;
  aiDetected?: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  skills: string[];
  year?: number;
  link?: string;
}

export interface Experience {
  id: string;
  title: string;
  organization: string;
  type: "internship" | "job" | "freelance" | "fresher";
  summary: string;
  startYear?: number;
  endYear?: number | "present";
}

export interface CareerGoal {
  id: string;
  title: string;
  slug: string;
  custom?: boolean;
}

export interface Profile {
  id: string;
  userId: string;
  /** FREE | PAID account plan (prep + resume limits). */
  plan?: "FREE" | "PAID" | string;
  resumeUploadCount?: number;
  name: string;
  status: UserStatus;
  educationLevel: EducationLevel;
  location: string;
  availableHoursPerDay: number;
  learningStyle: LearningStyle;
  remotePreference: "remote" | "hybrid" | "onsite" | "any";
  careerTrack: CareerTrack;
  prepGoalText?: string;
  targetExamSlug?: string;
  targetExamName?: string | null;
  profileStage?: { label: string; detail: string };
  completionPercent: number;
  education: Education[];
  skills: Skill[];
  certifications: Certification[];
  projects: Project[];
  experience: Experience[];
  careerGoal: CareerGoal;
  primaryStack?: string | null;
  evidence?: {
    stack: string | null;
    stackLabel: string | null;
    confidence: number;
    stackOptions: Array<{ id: string; label: string }>;
    seniority: "none" | "intern" | "job";
    learnerTier?: "early" | "aspiring" | "unverified_professional" | "verified_working";
    roleSkillMatchPercent?: number;
    roleSkillMatched?: number;
    roleSkillTotal?: number;
    pathLabel?: string;
    pathDetail?: string;
    suggestedStatus: string | null;
    needsStackConfirm: boolean;
  };
}

export type LearnerTier = "early" | "aspiring" | "unverified_professional" | "verified_working";

export interface CareerRequirement {
  skill: string;
  category: string;
  importance: Priority;
  type: "required" | "recommended" | "nice_to_have";
}

export interface Career {
  id: string;
  title: string;
  slug: string;
  overview: string;
  marketExpectations: string;
  entryLevelExpectations: string;
  requirements: CareerRequirement[];
  stackLanes?: Array<{ id: string; label: string }>;
}

export interface MatchBreakdown {
  skills: number;
  projects: number;
  education: number;
  experience: number;
  marketAlignment: number;
}

export interface CareerAnalysis {
  careerTitle: string;
  /** False when the goal exists but analysis has never been generated. */
  analyzed: boolean;
  estimatedMatch: number;
  breakdown: MatchBreakdown;
  whyItMayFit: string[];
  strongAreas: string[];
  missingAreas: string[];
  potentialChallenges: string[];
  evidenceIds: string[];
}

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  title: string;
  detail: string;
  sourceLabel: string;
}

export interface WhyExplanation {
  recommendation: string;
  currentProfile: string;
  targetCareer: string;
  marketEvidence: string;
  reason: string;
  practice?: string;
  example?: string;
  solution?: string;
  learnWhere?: string[];
}

export interface SkillGapItem {
  id: string;
  skillId?: string;
  skill: string;
  category: string;
  currentStatus: SkillStatus;
  required: boolean;
  priority: Priority;
  estimatedHours: number;
  proficiency: number;
  stretch?: boolean;
  why: WhyExplanation;
  market?: {
    demandPct: number | null;
    jobCount: number | null;
    companies: number | null;
    n: number | null;
    wilsonLower: number | null;
    trend: string | null;
  };
  resources?: Array<{ title: string; url: string; kind: string }>;
}

export interface RoadmapTask {
  id: string;
  title: string;
  description: string;
  why: string;
  priority: Priority;
  estimatedEffort: string;
  status: TaskStatus;
  relatedSkill: string;
  suggestedResource: string;
  phase: "7d" | "30d" | "60d" | "90d" | "180d";
  note?: string;
}

export interface Roadmap {
  careerTitle: string;
  sourceUrl?: string;
  syllabusPercent?: number;
  stackLabel?: string | null;
  seniority?: "none" | "intern" | "job";
  learnerTier?: LearnerTier;
  roleSkillMatchPercent?: number;
  pathLabel?: string;
  pathDetail?: string;
  studyNext?: string[];
  optional?: string[];
  alternatives?: string[];
  unlockedPhases?: string[];
  phaseCounts?: Partial<Record<RoadmapTask["phase"], number>>;
  preparation?: { completed: number; total: number; percent: number };
  tasks: RoadmapTask[];
}

export interface Job {
  id: string;
  company: string;
  role: string;
  location: string;
  workType: "remote" | "hybrid" | "onsite";
  experience: string;
  matchPercent: number;
  matchLabel: JobMatchLabel;
  matchedSkills: string[];
  missingSkills: string[];
  whyMatches: string;
  priority: Priority;
  isMock: true;
}

export interface GovernmentOpportunity {
  id: string;
  organization: string;
  opportunity: string;
  eligibility: string;
  ageRequirement: string;
  educationRequirement: string;
  location: string;
  deadline: string;
  eligibilityStatus: EligibilityStatus;
  sourceVerification: "verified_placeholder" | "needs_verification" | "unverified";
  officialNote: string;
  isMock: true;
}

export interface ResearchSource {
  id: string;
  title: string;
  type: SourceType;
  domain: string;
  quality: SourceQuality;
  keyFinding: string;
  usedInRecommendation: boolean;
  confidence: number;
  url?: string;
}

export interface ResearchTimelineEvent {
  id: string;
  label: string;
  timestamp: string;
  status: "done" | "skipped";
}

export interface ResearchReport {
  status: "idle" | "running" | "completed" | "failed";
  sourcesAnalyzed: number;
  jobDescriptions: number;
  learningResources: number;
  governmentSources: number;
  skillPatterns: number;
  verificationStatus: "completed" | "pending";
  sources: ResearchSource[];
  timeline: ResearchTimelineEvent[];
  summary: string;
  query?: string;
  findings: Array<{ id: string; title: string; content: string; tags: string[] }>;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface UploadedDocument {
  id: string;
  filename: string;
  type: DocumentType;
  sizeLabel: string;
  mimeType?: string;
  uploadedAt: string;
  status: DocumentProcessingStatus;
}

export interface ExtractedDocumentData {
  documentId: string;
  degree?: string;
  subjects?: { name: string; marks: string }[];
  skillsDetected?: string[];
  summary: string;
}

export interface ProgressSnapshot {
  skillsCompleted: number;
  skillsTotal: number;
  roadmapPercent: number;
  learningHours: number;
  projectsCompleted: number;
  applications: number;
  interviewPrepPercent: number;
  skillProgressOverTime: { month: string; skills: number }[];
  applicationsOverTime: { month: string; count: number }[];
  roadmapCompletionOverTime: { month: string; percent: number }[];
}

export interface SearchResult {
  id: string;
  category: "skill" | "task" | "job" | "resource" | "source";
  title: string;
  subtitle: string;
  href: string;
}

export interface UserPreferences {
  targetCareerSlug: string;
  targetExamSlug: string;
  targetExamName?: string | null;
  dailyHours: number;
  learningStyle: LearningStyle;
  locationPreference: string;
  remotePreference: Profile["remotePreference"];
  careerTrack: CareerTrack;
  notifications: {
    analysis: boolean;
    opportunities: boolean;
    progress: boolean;
  };
  documentRetentionDays: number;
}

export interface CopilotContext {
  careerTitle: string;
  profileComplete: number;
  topGap: string;
  availableHours: number;
}

export interface GovernmentExamSummary {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  conductingBody: string;
  category: string;
  overview: string;
  ageLimit?: string | null;
  educationRequirement?: string | null;
  stages: string[];
  subjectCount: number;
  officialNote?: string | null;
}

export interface GovernmentExamTopic {
  name: string;
  status: TaskStatus;
  revisedCount: number;
}

export interface GovernmentExamDetail {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  conductingBody: string;
  category: string;
  overview: string;
  eligibility: string;
  ageLimit?: string | null;
  educationRequirement?: string | null;
  examPattern: unknown;
  stages: string[];
  officialNote?: string | null;
  subjects: Array<{
    id: string;
    name: string;
    weightage?: string | null;
    topics: GovernmentExamTopic[];
  }>;
  plan: {
    id: string;
    isActive: boolean;
    targetYear?: number | null;
    dailyMinutes: number;
    completionPercent: number;
    roadmap: Array<{ phase: string; focus: string; tasks: string[] }>;
  } | null;
}

export type SarkariFlagStatus = "match" | "not_yet" | "outside" | "unknown";

export interface SarkariJudge {
  exam: {
    id: string;
    slug: string;
    shortName: string;
    name: string;
    ageLimit?: string | null;
    educationRequirement?: string | null;
  } | null;
  age: { status: SarkariFlagStatus; detail: string; years?: number | null };
  education: { status: SarkariFlagStatus; detail: string; have?: string; want?: string | null };
  knowledge: {
    status: SarkariFlagStatus;
    detail: string;
    papers?: Array<{ subjectId: string; name: string; mockPercent: number | null; tickPercent: number }>;
  };
  documents: {
    missing: string[];
    have: Array<{ id: string; paper: string; filename: string }>;
  };
  studyNext?: string[];
  studied?: string[];
  capability?: string;
  snapshots: Array<{
    id: string;
    url: string;
    site: string;
    title: string;
    excerpt: string;
    kind: string;
    fetchedAt: string;
  }>;
  disclaimer: string;
}
