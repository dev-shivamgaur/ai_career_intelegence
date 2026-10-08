import { cn } from "@/lib/cn";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Dropdown({
  trigger,
  children,
  align = "right",
  onOpen,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) onOpen?.();
            return next;
          });
        }}
      >
        {trigger}
      </div>
      {open && (
        <div
          className={cn(
            "absolute z-40 mt-2 min-w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-card dark:border-slate-700 dark:bg-slate-900",
            align === "right" ? "right-0" : "left-0",
          )}
          role="menu"
        >
          <div onClick={() => setOpen(false)}>{children}</div>
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      role="menuitem"
      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
