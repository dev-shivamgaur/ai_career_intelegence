import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[#C4C4C4] bg-surface-card shadow-card dark:border-[#3A3333] dark:bg-surface-dark-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#E4E4E4] px-5 py-4 dark:border-[#3A3333]">
      <div>
        <h2 className="text-base font-semibold text-ink dark:text-[#D1D0D0]">{title}</h2>
        {description && <p className="mt-1 text-sm text-[#5C4E4E] dark:text-[#988686]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
