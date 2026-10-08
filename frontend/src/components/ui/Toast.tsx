import { useAppSelector } from "@/store/hooks";

export function ToastHost() {
  const toasts = useAppSelector((s) => s.toast.items);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 space-y-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-card dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
