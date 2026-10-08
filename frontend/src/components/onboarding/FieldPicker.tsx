import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMemo, useState } from "react";

export function FieldPicker<T extends { id: string; title: string; hint?: string; slug?: string }>({
  label,
  items,
  selectedId,
  loading,
  onSelect,
  onCustom,
  placeholder = "Search a field…",
}: {
  label: string;
  items: T[];
  selectedId?: string;
  loading?: boolean;
  onSelect: (item: T) => void;
  onCustom?: (query: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) => item.title.toLowerCase().includes(q) || (item.hint ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div className="space-y-2">
      <Input label={label} name="field-search" placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">No catalog field matched “{query}”.</p>
          {onCustom && query.trim() ? (
            <button
              type="button"
              className="rounded-xl border border-brand-600 bg-brand-50 px-4 py-3 text-left text-sm dark:bg-brand-950/40"
              onClick={() => onCustom(query.trim())}
            >
              Use “{query.trim()}” as my field
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rounded-xl border px-4 py-3 text-left text-sm ${
                selectedId === item.id
                  ? "border-brand-600 bg-brand-50 dark:bg-brand-950/40"
                  : "border-slate-200 dark:border-slate-700"
              }`}
              onClick={() => onSelect(item)}
            >
              <span className="font-medium">{item.title}</span>
              {item.hint && <span className="mt-1 block text-xs text-slate-500">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
