import { z } from 'zod';

export const careerAnalysisSchema = z.object({
  skillScore: z.number().min(0).max(100),
  projectScore: z.number().min(0).max(100),
  educationScore: z.number().min(0).max(100),
  experienceScore: z.number().min(0).max(100),
  marketScore: z.number().min(0).max(100),
  whyItMayFit: z.array(z.string()).min(1).max(6),
  strongAreas: z.array(z.string()).min(1).max(12),
  missingAreas: z.array(z.string()).min(1).max(12),
  potentialChallenges: z.array(z.string()).min(1).max(6),
  evidence: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(['profile', 'document', 'market', 'research', 'exam']),
        title: z.string(),
        detail: z.string(),
      }),
    )
    .min(1)
    .max(10),
});

export const researchReportSchema = z.object({
  summary: z.string().min(40),
  skillPatterns: z.number().int().min(0),
  sources: z
    .array(
      z.object({
        title: z.string(),
        type: z.enum(['JOB', 'LEARNING', 'GOVERNMENT', 'CAREER_GUIDE', 'COMMUNITY']),
        domain: z.string(),
        quality: z.enum(['OFFICIAL', 'TRUSTED', 'ESTABLISHED', 'COMMUNITY', 'UNVERIFIED']),
        keyFinding: z.string(),
        usedInRecommendation: z.boolean(),
        confidence: z.number().int().min(0).max(100),
        url: z.string().optional(),
      }),
    )
    .min(1)
    .max(12),
  findings: z
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
        tags: z.array(z.string()).default([]),
      }),
    )
    .min(1)
    .max(8),
});

export const roadmapPlanSchema = z.object({
  title: z.string(),
  tasks: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        why: z.string(),
        priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
        estimatedEffort: z.string(),
        relatedSkill: z.string(),
        suggestedResource: z.string(),
        phase: z.enum(['D7', 'D30', 'D60', 'D90', 'D180']),
      }),
    )
    .min(5)
    .max(12),
});

const marksField = z
  .union([z.string(), z.number()])
  .transform((value) => String(value));

export const documentExtractionSchema = z.object({
  degree: z.string().optional(),
  dateOfBirth: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v == null || v === '' ? undefined : String(v))),
  dob: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v == null || v === '' ? undefined : String(v))),
  date_of_birth: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v == null || v === '' ? undefined : String(v))),
  subjects: z
    .array(
      z.object({
        name: z.union([z.string(), z.number()]).transform((v) => String(v)),
        marks: marksField.optional().default(''),
      }),
    )
    .optional(),
  skillsDetected: z.array(z.string()).default([]),
  summary: z.string().default(''),
  suggestedFields: z.any().default({}),
  jobs: z
    .array(
      z.object({
        title: z.string(),
        organization: z.string().optional().default(''),
        type: z.enum(['INTERNSHIP', 'JOB', 'FREELANCE', 'FRESHER']).optional(),
        startYear: z.number().optional(),
        endYear: z.number().optional(),
        isPresent: z.boolean().optional(),
        summary: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
  projects: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional().default(''),
        skills: z.array(z.string()).optional().default([]),
        link: z.string().optional(),
        year: z.number().optional(),
      }),
    )
    .optional()
    .default([]),
  education: z
    .array(
      z.object({
        degree: z.string(),
        institution: z.string().optional().default(''),
        year: z.number().optional(),
      }),
    )
    .optional()
    .default([]),
  certifications: z
    .array(
      z.object({
        name: z.string(),
        issuer: z.string().optional().default(''),
        year: z.number().optional(),
      }),
    )
    .optional()
    .default([]),
});

export type CareerAnalysisResult = z.infer<typeof careerAnalysisSchema>;
export type ResearchReportResult = z.infer<typeof researchReportSchema>;
export type RoadmapPlanResult = z.infer<typeof roadmapPlanSchema>;
export type DocumentExtractionResult = z.infer<typeof documentExtractionSchema>;
