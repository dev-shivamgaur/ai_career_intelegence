import type { DocumentProcessingStatus, DocumentType, ExtractedDocumentData, UploadedDocument } from "@/types";
import { http } from "../http";
import { mapEnum } from "../mappers";

function mapDoc(raw: Record<string, unknown>): UploadedDocument {
  const size = Number(raw.sizeBytes ?? 0);
  return {
    id: String(raw.id),
    filename: String(raw.filename ?? raw.originalName ?? "file"),
    type: mapEnum(String(raw.type), "other"),
    sizeLabel: size ? `${Math.max(1, Math.round(size / 1024))} KB` : "—",
    uploadedAt: String(raw.updatedAt ?? raw.createdAt ?? new Date().toISOString()),
    mimeType: raw.mimeType ? String(raw.mimeType) : "",
    status: mapEnum(String(raw.status), "completed") as DocumentProcessingStatus,
  };
}

export async function listDocuments(): Promise<UploadedDocument[]> {
  const rows = await http.get<Record<string, unknown>[]>("/documents");
  return rows.map(mapDoc);
}

export async function uploadDocument(
  file: File,
  type: DocumentType,
  extra?: { label?: string; status?: string; educationLevel?: string },
): Promise<UploadedDocument> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type.toUpperCase());
  if (extra?.label?.trim()) form.append("label", extra.label.trim());
  if (extra?.status) form.append("status", extra.status.toUpperCase());
  if (extra?.educationLevel) form.append("educationLevel", extra.educationLevel.toUpperCase());
  const raw = await http.upload<Record<string, unknown>>("/documents", form);
  return mapDoc(raw);
}

export async function waitForDocument(id: string): Promise<UploadedDocument> {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const raw = await http.get<Record<string, unknown>>(`/documents/${id}`, { silent: true });
    const doc = mapDoc(raw);
    if (doc.status === "completed" || doc.status === "failed") return doc;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Document is still being read. Open Documents in a moment.");
}

export async function getDocumentFile(id: string): Promise<Blob> {
  return http.file(`/documents/${id}/file`);
}

export async function getExtractedData(id: string): Promise<ExtractedDocumentData> {
  const raw = await http.get<Record<string, unknown>>(`/documents/${id}/extraction`);
  const subjects = Array.isArray(raw.subjects) ? (raw.subjects as { name: string; marks: string }[]) : undefined;
  return {
    documentId: id,
    degree: raw.degree ? String(raw.degree) : undefined,
    subjects,
    skillsDetected: Array.isArray(raw.skillsDetected) ? (raw.skillsDetected as string[]) : undefined,
    summary: String(raw.summary ?? "Extracted on the server."),
  };
}

export async function deleteDocument(id: string): Promise<void> {
  await http.delete(`/documents/${id}`);
}

export async function replaceDocument(
  id: string,
  file: File,
  type: DocumentType,
  extra?: { label?: string; status?: string; educationLevel?: string },
): Promise<UploadedDocument> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type.toUpperCase());
  if (extra?.label?.trim()) form.append("label", extra.label.trim());
  if (extra?.status) form.append("status", extra.status.toUpperCase());
  if (extra?.educationLevel) form.append("educationLevel", extra.educationLevel.toUpperCase());
  const raw = await http.upload<Record<string, unknown>>(`/documents/${id}/replace`, form);
  return mapDoc(raw);
}

export async function deleteAllDocuments(): Promise<void> {
  await http.delete("/documents");
}
