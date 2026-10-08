import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";

export function BrandLogo({
  to = "/",
  collapsed = false,
  className,
}: {
  to?: string;
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <Link to={to} className={cn("flex min-w-0 items-center gap-2.5", className)} aria-label="Career Intelligence home">
      <LogoMark />
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight tracking-tight text-ink dark:text-stone-50">
            Career Intelligence
          </span>
          <span className="hidden text-[11px] text-stone-500 sm:block dark:text-stone-400">Jobs and exam prep</span>
        </span>
      )}
    </Link>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white shadow-sm dark:bg-brand-500",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
        <path
          d="M7 23.5h4.2V18h4.4v-5.2h4.4V8H25"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="25" cy="8" r="1.7" fill="currentColor" />
      </svg>
    </span>
  );
}
