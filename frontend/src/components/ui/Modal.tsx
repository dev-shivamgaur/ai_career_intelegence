import { useEffect } from "react";
import { Button } from "./Button";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  size = "md",
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  size?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal aria-labelledby="modal-title">
      <button className="absolute inset-0 bg-slate-900/40" aria-label="Close dialog" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-slate-200 bg-white shadow-card dark:border-slate-700 dark:bg-slate-900 sm:rounded-xl",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5">
          <h2 id="modal-title" className="text-base font-semibold sm:text-lg">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm text-slate-600 dark:text-slate-300 sm:px-5">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:justify-end sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
