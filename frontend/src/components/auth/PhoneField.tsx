import { countryByIso, COUNTRIES, guessCountryIso, toE164 } from "@/lib/countries";
import { useMemo, useState } from "react";

export function PhoneField({
  id = "phone",
  disabled,
  onChangeE164,
}: {
  id?: string;
  disabled?: boolean;
  onChangeE164: (e164: string) => void;
}) {
  const [iso, setIso] = useState(guessCountryIso);
  const [national, setNational] = useState("");
  const country = useMemo(() => countryByIso(iso), [iso]);

  function emit(nextIso: string, nextNational: string) {
    const next = countryByIso(nextIso);
    onChangeE164(toE164(next.dial, nextNational));
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Mobile number
      </label>
      <div className="grid gap-2 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
        <select
          aria-label="Country code"
          disabled={disabled}
          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          value={iso}
          onChange={(e) => {
            const next = e.target.value;
            setIso(next);
            emit(next, national);
          }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              +{c.dial} · {c.name}
            </option>
          ))}
        </select>
        <div className="flex h-10 w-full min-w-0 items-center rounded-lg border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 dark:border-slate-600 dark:bg-slate-900 dark:focus-within:ring-brand-900/40">
          <span className="shrink-0 pl-3 text-sm tabular-nums text-slate-500">+{country.dial}</span>
          <input
            id={id}
            name={id}
            type="tel"
            inputMode="numeric"
            disabled={disabled}
            autoComplete="tel-national"
            placeholder="9876543210"
            maxLength={15}
            className="h-10 w-full min-w-0 flex-1 bg-transparent px-2 text-sm tabular-nums outline-none"
            value={national}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, "");
              setNational(next);
              emit(iso, next);
            }}
          />
        </div>
      </div>
    </div>
  );
}
