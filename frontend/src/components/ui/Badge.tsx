import { cn } from "@/lib/cn";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    brand: "bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200",
    success: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    warning: "bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    danger: "bg-red-50 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    info: "bg-violet-50 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  };
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}
