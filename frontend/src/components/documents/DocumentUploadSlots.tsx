import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LocalFilePreview, RemoteFilePreview } from "@/components/documents/FilePreview";
import { DocumentActions } from "@/components/documents/DocumentCard";
import { DOCUMENT_SLOTS, classifyMarksheetPaper, documentNeeds, requiredMarksheets, type DocumentNeed } from "@/lib/documentRequirements";
import type { CareerTrack, DocumentType, EducationLevel, UploadedDocument, UserStatus } from "@/types";
import { HiOutlineCheckCircle, HiOutlineCloudUpload, HiOutlineTrash } from "react-icons/hi";
import { useState } from "react";

const tone: Record<DocumentNeed, "danger" | "warning" | "neutral"> = {
  required: "danger",
  recommended: "warning",
  optional: "neutral",
};

export function DocumentUploadSlots({
  status,
  educationLevel,
  careerTrack = "private_tech",
  documents,
  uploadingType,
  replacingId,
  onUpload,
  onDelete,
  onReplace,
}: {
  status: UserStatus;
  educationLevel: EducationLevel;
  careerTrack?: CareerTrack;
  documents: UploadedDocument[];
  uploadingType: DocumentType | null;
  replacingId?: string | null;
  onUpload: (type: DocumentType, files: File[], label?: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onReplace: (doc: UploadedDocument, file: File, label?: string) => void | Promise<void>;
}) {
  const needs = documentNeeds(status, educationLevel, careerTrack);
  const sarkari = careerTrack === "government_exam";
  const [degreeName, setDegreeName] = useState("");
  const [marksheetKind, setMarksheetKind] = useState("Class 10");
  const [pending, setPending] = useState<Partial<Record<DocumentType, File[]>>>({});
  const pursuing = status === "student";
  const papers = requiredMarksheets(educationLevel, careerTrack);
  const hasPaper = (paper: "tenth" | "twelfth") =>
    documents.some((doc) => doc.type === "marksheet" && classifyMarksheetPaper(doc.filename) === paper);
  const resumeReading = documents.some(
    (doc) =>
      doc.type === "resume" &&
      (doc.status === "uploading" || doc.status === "processing" || doc.status === "extracting"),
  );
  const checklist = [
    {
      id: "tenth",
      label: `Class 10 marksheet${papers.includes("tenth") ? "" : " (optional)"}`,
      done: hasPaper("tenth"),
      reading: false,
    },
    {
      id: "twelfth",
      label: `Class 12 marksheet${papers.includes("twelfth") ? "" : " (optional)"}`,
      done: hasPaper("twelfth"),
      reading: false,
    },
    {
      id: "degree",
      label: `Degree certificate${needs.degree === "required" ? "" : " (optional)"}`,
      done: documents.some((doc) => doc.type === "degree"),
      reading: false,
    },
    {
      id: "resume",
      label: "Resume PDF (optional)",
      done: documents.some((doc) => doc.type === "resume" && doc.status === "completed"),
      reading: resumeReading,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-900">
        <p className="text-sm font-medium">What to upload</p>
        <ul className="mt-2 space-y-1.5">
          {checklist.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <HiOutlineCheckCircle
                className={`h-4 w-4 shrink-0 ${item.done ? "text-emerald-600" : "text-stone-300 dark:text-stone-600"}`}
              />
              <span className={item.done ? "text-stone-500 line-through" : ""}>{item.label}</span>
              {item.reading && <span className="text-xs text-brand-700">Reading skills…</span>}
              {!item.done && !item.reading && <span className="text-xs text-stone-400">Not uploaded yet</span>}
            </li>
          ))}
        </ul>
        {documents.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-stone-500">
            Already uploaded: {documents.map((doc) => doc.filename).join(" · ")}
          </p>
        )}
      </div>
      {sarkari && (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-slate-700 dark:bg-brand-950/40 dark:text-slate-200">
          Sarkari ladder: upload Class 10 and Class 12 as separate files. We read date of birth from both. Graduation
          is extra if the exam asks for it. We do not score board percentages.
        </p>
      )}
      {pursuing && !sarkari && (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-slate-700 dark:bg-brand-950/40 dark:text-slate-200">
          You are still studying, so a degree certificate is not required. Upload Class 10 and Class 12 marksheets if
          you have them — we store both.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {DOCUMENT_SLOTS.map((slot) => {
          const need = needs[slot.type as keyof typeof needs];
          const uploaded = documents.filter((d) => d.type === slot.type);
          const queued = pending[slot.type] ?? [];
          const busy = uploadingType === slot.type;
          return (
            <div
              key={slot.type}
              className="relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
            >
              {busy && (
                <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-xl bg-white/70 dark:bg-slate-950/70">
                  <div className="doc-scan h-8 w-full bg-gradient-to-b from-transparent via-brand-400/70 to-transparent" />
                  <p className="px-3 pt-6 text-center text-sm font-medium">Reading this file…</p>
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{slot.title}</p>
                <Badge tone={tone[need]}>{need}</Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{slot.formats}</p>
              {slot.kinds && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {slot.kinds.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${
                        marksheetKind === kind
                          ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-950/50"
                          : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                      }`}
                      onClick={() => setMarksheetKind(kind)}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
              )}
              {slot.named && (
                <Input
                  className="mt-2"
                  name={`${slot.type}-name`}
                  placeholder="Degree name, e.g. BCA"
                  value={degreeName}
                  onChange={(e) => setDegreeName(e.target.value)}
                  hint="Upload one file, then change the name for the next degree."
                />
              )}
              <label className="mt-3 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-3 py-4 text-center text-sm dark:border-slate-600">
                <HiOutlineCloudUpload className="h-6 w-6 text-brand-700" />
                <input
                  type="file"
                  className="sr-only"
                  accept={slot.accept}
                  multiple={slot.multiple}
                  disabled={busy}
                  onChange={(e) => {
                    const next = e.target.files ? Array.from(e.target.files) : [];
                    e.target.value = "";
                    if (!next.length) return;
                    setPending((prev) => ({
                      ...prev,
                      [slot.type]: slot.multiple ? [...(prev[slot.type] ?? []), ...next] : next.slice(0, 1),
                    }));
                  }}
                />
                <span className="font-medium">{queued.length ? "Add more files" : "Choose files"}</span>
              </label>
              {queued.length > 0 && (
                <div className="mt-2 space-y-2">
                  {queued.map((file, index) => (
                    <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <LocalFilePreview file={file} />
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600"
                        aria-label={`Remove ${file.name}`}
                        onClick={() =>
                          setPending((prev) => ({
                            ...prev,
                            [slot.type]: (prev[slot.type] ?? []).filter((_, i) => i !== index),
                          }))
                        }
                      >
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                className="mt-3"
                disabled={busy || queued.length === 0}
                onClick={() => {
                  const files = pending[slot.type] ?? [];
                  if (!files.length) return;
                  const label = slot.kinds ? marksheetKind : slot.named ? degreeName : undefined;
                  void Promise.resolve(onUpload(slot.type, files, label))
                    .then(() => setPending((prev) => ({ ...prev, [slot.type]: [] })))
                    .catch(() => undefined);
                }}
              >
                {busy ? "Reading…" : "Upload"}
              </Button>
              {uploaded.length > 0 && (
                <div className="mt-2 space-y-2">
                  {uploaded.map((d) => (
                    <div key={`${d.id}-${d.uploadedAt}`} className="space-y-1.5">
                      <RemoteFilePreview id={d.id} mime={d.mimeType} name={d.filename} />
                      <DocumentActions
                        doc={d}
                        busy={replacingId === d.id || uploadingType === slot.type}
                        onDelete={(id) => void onDelete(id)}
                        onReplace={(doc, file) =>
                          void onReplace(doc, file, slot.kinds ? marksheetKind : slot.named ? degreeName : undefined)
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
