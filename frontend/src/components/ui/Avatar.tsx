import { cn } from "@/lib/cn";

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white",
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}
