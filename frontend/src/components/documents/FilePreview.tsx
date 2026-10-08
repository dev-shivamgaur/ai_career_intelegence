import { useEffect, useMemo, useState } from "react";
import * as documentApi from "@/services/api/documentApi";

function isImage(mime: string, name: string) {
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
}

function isPdf(mime: string, name: string) {
  return mime === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

function PreviewFrame({
  url,
  mime,
  name,
  large,
}: {
  url: string;
  mime: string;
  name: string;
  large?: boolean;
}) {
  const imageBox = large ? "h-[min(75vh,720px)] w-full" : "h-40 w-full sm:h-48";
  const pdfBox = large ? "h-[min(75vh,720px)] w-full" : "h-64 w-full sm:h-72";
  if (isImage(mime, name)) {
    return <img src={url} alt={name} className={`${imageBox} rounded-md object-contain bg-slate-100 dark:bg-slate-800`} />;
  }
  if (isPdf(mime, name)) {
    return (
      <iframe
        title={name}
        src={`${url}#toolbar=0&navpanes=0`}
        className={`${pdfBox} rounded-md border border-slate-200 bg-white dark:border-slate-700`}
      />
    );
  }
  return (
    <div className="flex h-24 w-full items-center justify-center rounded-md bg-slate-100 text-xs text-slate-500 dark:bg-slate-800">
      {name.split(".").pop()?.toUpperCase() || "FILE"}
    </div>
  );
}

export function LocalFilePreview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  if (isImage(file.type, file.name)) {
    return <ExpandablePreview url={url} mime={file.type} name={file.name} />;
  }
  return (
    <p className="truncate rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {file.name}
    </p>
  );
}

export function RemoteFilePreview({
  id,
  mime,
  name,
}: {
  id: string;
  mime?: string;
  name: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void documentApi
      .getDocumentFile(id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, enabled]);

  if (!enabled) {
    return (
      <button
        type="button"
        className="w-full rounded-md border border-slate-200 px-2 py-2 text-left dark:border-slate-700"
        onClick={() => setEnabled(true)}
      >
        <span className="block truncate text-xs font-medium">{name}</span>
        <span className="text-xs text-brand-700">Show preview</span>
      </button>
    );
  }
  if (failed) {
    return <p className="text-xs text-slate-500">{name}</p>;
  }
  if (!url) {
    return (
      <div className="h-16 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" aria-label="Loading preview" />
    );
  }
  return <ExpandablePreview url={url} mime={mime || ""} name={name} />;
}

function ExpandablePreview({ url, mime, name }: { url: string; mime: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="block w-full text-left" onClick={() => setOpen(true)}>
        <PreviewFrame url={url} mime={mime} name={name} />
        <span className="mt-1 block truncate text-xs text-slate-500">{name}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-slate-900/60" aria-label="Close preview" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-4xl rounded-xl bg-white p-4 shadow-card dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium">{name}</p>
              <button type="button" className="text-sm text-brand-700" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <PreviewFrame url={url} mime={mime} name={name} large />
          </div>
        </div>
      )}
    </>
  );
}
