import { cn } from "@/lib/cn";

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/60">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          disabled={tab.disabled}
          aria-selected={value === tab.id}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            tab.disabled && "cursor-not-allowed opacity-40",
            value === tab.id
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-300",
          )}
          onClick={() => !tab.disabled && onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
