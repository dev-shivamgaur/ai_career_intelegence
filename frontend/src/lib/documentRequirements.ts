import type { CareerTrack, DocumentType, EducationLevel, UserStatus } from "@/types";

export type DocumentNeed = "required" | "recommended" | "optional";
export type MarksheetPaper = "tenth" | "twelfth";

export function classifyMarksheetPaper(text: string): MarksheetPaper | "other" {
  const t = text.toLowerCase();
  if (/\b(class\s*12|12th|xii|intermediate|inter\b|higher secondary|hsc|10\s*\+\s*2|\+2)\b/.test(t)) {
    return "twelfth";
  }
  if (/\b(class\s*10|10th|xth|matric|sslc|high school)\b/.test(t)) return "tenth";
  if (/\b12\b/.test(t)) return "twelfth";
  if (/\b10\b/.test(t)) return "tenth";
  return "other";
}

export function requiredMarksheets(
  educationLevel: EducationLevel,
  careerTrack: CareerTrack = "private_tech",
): MarksheetPaper[] {
  if (educationLevel === "high_school") return ["tenth"];
  if (
    educationLevel === "intermediate" ||
    educationLevel === "diploma" ||
    careerTrack === "government_exam"
  ) {
    return ["tenth", "twelfth"];
  }
  return [];
}

export function documentNeeds(
  status: UserStatus,
  educationLevel: EducationLevel,
  careerTrack: CareerTrack = "private_tech",
): Record<"marksheet" | "degree" | "certificate" | "resume", DocumentNeed> {
  const pursuing = status === "student";
  const school =
    educationLevel === "high_school" || educationLevel === "intermediate" || educationLevel === "diploma";

  if (careerTrack === "government_exam") {
    const gradNeeded = educationLevel === "undergraduate" || educationLevel === "postgraduate";
    return {
      marksheet: "required",
      degree: pursuing ? "optional" : gradNeeded ? "required" : "optional",
      certificate: "optional",
      resume: "optional",
    };
  }

  const marksheet: DocumentNeed = pursuing ? "recommended" : school ? "required" : "optional";

  let degree: DocumentNeed = "optional";
  if (pursuing) {
    degree = "optional";
  } else if (educationLevel === "undergraduate" || educationLevel === "postgraduate") {
    degree = "required";
  }

  return {
    marksheet,
    degree,
    certificate: "optional",
    resume: "optional",
  };
}

export const MARKSHEET_KINDS = [
  "Class 10",
  "Class 12",
  "Semester 1",
  "Semester 2",
  "Semester 3",
  "Semester 4",
  "Semester 5",
  "Semester 6",
  "Diploma year",
  "Other marksheet",
] as const;

export const DOCUMENT_SLOTS: Array<{
  type: DocumentType;
  title: string;
  accept: string;
  multiple: boolean;
  named?: boolean;
  kinds?: readonly string[];
  formats: string;
}> = [
  {
    type: "marksheet",
    title: "Marksheets",
    accept: "image/*,.pdf,application/pdf",
    multiple: true,
    kinds: MARKSHEET_KINDS,
    formats: "Upload Class 10 and Class 12 separately. We read date of birth from both papers.",
  },
  {
    type: "degree",
    title: "Degrees",
    accept: "image/*,.pdf,application/pdf",
    multiple: true,
    named: true,
    formats: "One file per degree (BCA, B.Tech, MCA…). Skip if you are still studying.",
  },
  {
    type: "certificate",
    title: "Certificate",
    accept: "image/*,.pdf,application/pdf",
    multiple: true,
    formats: "Course or exam certificates. Image or PDF.",
  },
  {
    type: "resume",
    title: "Resume",
    accept: "application/pdf,.pdf",
    multiple: false,
    formats: "PDF only.",
  },
];
