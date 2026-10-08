import { Button } from "./Button";
import type { ReactNode } from "react";
import { AlertTriangle, Flag, Map, RefreshCw, TrendingUp, type LucideIcon } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
      {icon && <div className="mb-3 flex justify-center text-slate-400">{icon}</div>}
      <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "We could not load this page",
  message,
  code,
  onRetry,
  onDashboard,
}: {
  title?: string;
  message?: string;
  code?: string | null;
  onRetry?: () => void;
  onDashboard?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {message || "The server did not return data for this request."} Retry loads the latest
            data from the server.
          </p>
          {code && (
            <p className="mt-3 inline-flex rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {code}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {onRetry && (
              <Button variant="outline" onClick={onRetry}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            )}
            {onDashboard && <Button onClick={onDashboard}>Go to dashboard</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export const SETUP_CODES = new Set([
  "ANALYSIS_NOT_FOUND",
  "PROGRESS_NOT_FOUND",
  "ROADMAP_NOT_FOUND",
  "GOAL_NOT_FOUND",
  "CAREER_NOT_FOUND",
  "NO_PLAN",
]);

type SetupGuide = {
  icon: LucideIcon;
  title: string;
  description: string;
  steps: string[];
  cta: string;
  href: string;
};

export function setupGuide(code: string | null | undefined): SetupGuide {
  switch (code) {
    case "PROGRESS_NOT_FOUND":
      return {
        icon: TrendingUp,
        title: "Progress will show after you start a plan",
        description: "Nothing is broken. We only track progress once you pick a goal and generate a roadmap.",
        steps: ["Set a career or exam goal", "Generate your roadmap", "Mark tasks as you complete them"],
        cta: "Set up your goal",
        href: "/onboarding",
      };
    case "ROADMAP_NOT_FOUND":
      return {
        icon: Map,
        title: "No roadmap yet",
        description: "A plan is created after you choose a target role or exam. Then we can break work into weeks.",
        steps: ["Choose a private job path or sarkari exam", "Generate a roadmap", "Work through the first 7 days"],
        cta: "Choose a goal",
        href: "/onboarding",
      };
    case "NO_PLAN":
      return {
        icon: Flag,
        title: "Start an exam preparation plan",
        description: "You have not started a sarkari prep plan for this exam yet.",
        steps: ["Open Sarkari Naukri", "Pick an exam", "Start the preparation plan"],
        cta: "Browse exams",
        href: "/sarkari-naukri",
      };
    default:
      return {
        icon: Flag,
        title: "Pick a career goal to unlock this page",
        description: "Analysis, skill gaps, and match scores need an active career goal on your profile.",
        steps: ["Complete onboarding", "Choose a target role or exam", "Come back here to see the analysis"],
        cta: "Choose a career goal",
        href: "/onboarding",
      };
  }
}

export function NeedSetupState({
  code,
  onAction,
}: {
  code?: string | null;
  onAction: (href: string) => void;
}) {
  const guide = setupGuide(code);
  const Icon = guide.icon;
  return (
    <div className="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-b from-brand-50 to-white dark:border-brand-900 dark:from-slate-900 dark:to-slate-950">
      <div className="px-6 py-10 text-center sm:px-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
          <Icon className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-slate-900 dark:text-white">{guide.title}</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600 dark:text-slate-300">{guide.description}</p>
        <ol className="mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
          {guide.steps.map((step, i) => (
            <li
              key={step}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-200">
                {i + 1}
              </span>
              <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">{step}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8">
          <Button onClick={() => onAction(guide.href)}>{guide.cta}</Button>
        </div>
      </div>
    </div>
  );
}
