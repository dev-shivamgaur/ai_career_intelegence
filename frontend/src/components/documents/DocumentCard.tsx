import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RemoteFilePreview } from "@/components/documents/FilePreview";
import type { DocumentProcessingStatus, DocumentType, UploadedDocument } from "@/types";
import { HiOutlineRefresh, HiOutlineTrash } from "react-icons/hi";
import { useRef } from "react";

const labels: Record<DocumentProcessingStatus, string> = {
  uploading: "Uploading",
  processing: "Processing",
  extracting: "Extracting information",
  completed: "Completed",
  failed: "Failed",
};

function acceptFor(type: DocumentType) {
  return type === "resume" ? "application/pdf,.pdf" : "image/*,.pdf,application/pdf";
}

export function DocumentActions({
  doc,
  busy,
  onDelete,
  onReplace,
}: {
  doc: UploadedDocument;
  busy?: boolean;
  onDelete: (id: string) => void;
  onReplace: (doc: UploadedDocument, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={acceptFor(doc.type)}
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onReplace(doc, file);
        }}
      />
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        disabled={busy}
        aria-label={busy ? "Updating document" : "Replace document"}
        onClick={() => inputRef.current?.click()}
      >
        <HiOutlineRefresh className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      </button>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950/40"
        disabled={busy}
        aria-label="Delete document"
        onClick={() => {
          if (window.confirm("Remove this document?")) onDelete(doc.id);
        }}
      >
        <HiOutlineTrash className="h-4 w-4" />
      </button>
    </div>
  );
}

export function DocumentCard({
  doc,
  busy,
  onSelect,
  onDelete,
  onReplace,
}: {
  doc: UploadedDocument;
  busy?: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onReplace: (doc: UploadedDocument, file: File) => void;
}) {
  return (
    <Card>
      <CardBody className="flex flex-wrap items-start justify-between gap-3">
        <div className="w-full shrink-0 sm:w-56">
          <RemoteFilePreview key={`${doc.id}-${doc.uploadedAt}`} id={doc.id} mime={doc.mimeType} name={doc.filename} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{doc.filename}</p>
          <p className="text-xs text-slate-500">
            {doc.type} · {doc.sizeLabel}
          </p>
          <div className="mt-2">
            <DocumentActions doc={doc} busy={busy} onDelete={onDelete} onReplace={onReplace} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={doc.status === "completed" ? "success" : "warning"}>{labels[doc.status]}</Badge>
          {doc.status === "completed" && (
            <button className="text-sm text-brand-700" onClick={() => onSelect(doc.id)}>
              View extraction
            </button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
