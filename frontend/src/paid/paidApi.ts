import { http } from "@/services/http";
import type { ResumeQuota } from "@/paid/types";

/** Preferred paid endpoint. */
export async function getResumeQuota(): Promise<ResumeQuota> {
  return http.get<ResumeQuota>("/paid/resume-quota");
}

/** Legacy alias used by Documents page during migration. */
export async function getDocumentQuota(): Promise<ResumeQuota> {
  try {
    return await getResumeQuota();
  } catch {
    return http.get<ResumeQuota>("/documents/quota");
  }
}
