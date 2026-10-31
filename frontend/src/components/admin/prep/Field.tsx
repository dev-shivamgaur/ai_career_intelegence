import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const box =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";

export function FieldLabel({
  children,
  required,
  htmlFor,
  hint,
}: {
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
      {children}
      {required && <span className="ml-0.5 text-red-600">*</span>}
      {hint && <span className="ml-1 font-normal text-slate-400">— {hint}</span>}
    </label>
  );
}

export function FieldInput({
  label,
  required,
  hint,
  id,
  ...props
}: { label: string; required?: boolean; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const inputId = id ?? label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div>
      <FieldLabel htmlFor={inputId} required={required} hint={hint}>
        {label}
      </FieldLabel>
      <input id={inputId} className={box} required={required} {...props} />
    </div>
  );
}

export function FieldTextarea({
  label,
  required,
  hint,
  id,
  rows = 3,
  ...props
}: { label: string; required?: boolean; hint?: string; rows?: number } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const inputId = id ?? label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div>
      <FieldLabel htmlFor={inputId} required={required} hint={hint}>
        {label}
      </FieldLabel>
      <textarea id={inputId} className={box} rows={rows} required={required} {...props} />
    </div>
  );
}

export function FieldSelect({
  label,
  required,
  hint,
  id,
  children,
  ...props
}: { label: string; required?: boolean; hint?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  const inputId = id ?? label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div>
      <FieldLabel htmlFor={inputId} required={required} hint={hint}>
        {label}
      </FieldLabel>
      <select id={inputId} className={`h-10 ${box}`} required={required} {...props}>
        {children}
      </select>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
