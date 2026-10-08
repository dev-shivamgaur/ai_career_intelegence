export type CountryDial = {
  iso: string;
  name: string;
  dial: string;
};

export const COUNTRIES: CountryDial[] = [
  { iso: "IN", name: "India", dial: "91" },
  { iso: "US", name: "United States", dial: "1" },
  { iso: "GB", name: "United Kingdom", dial: "44" },
  { iso: "AE", name: "United Arab Emirates", dial: "971" },
  { iso: "SA", name: "Saudi Arabia", dial: "966" },
  { iso: "SG", name: "Singapore", dial: "65" },
  { iso: "AU", name: "Australia", dial: "61" },
  { iso: "CA", name: "Canada", dial: "1" },
  { iso: "DE", name: "Germany", dial: "49" },
  { iso: "FR", name: "France", dial: "33" },
  { iso: "NP", name: "Nepal", dial: "977" },
  { iso: "BD", name: "Bangladesh", dial: "880" },
  { iso: "PK", name: "Pakistan", dial: "92" },
  { iso: "LK", name: "Sri Lanka", dial: "94" },
  { iso: "MY", name: "Malaysia", dial: "60" },
  { iso: "ID", name: "Indonesia", dial: "62" },
  { iso: "PH", name: "Philippines", dial: "63" },
  { iso: "QA", name: "Qatar", dial: "974" },
  { iso: "KW", name: "Kuwait", dial: "965" },
  { iso: "OM", name: "Oman", dial: "968" },
  { iso: "ZA", name: "South Africa", dial: "27" },
  { iso: "NG", name: "Nigeria", dial: "234" },
  { iso: "KE", name: "Kenya", dial: "254" },
  { iso: "BR", name: "Brazil", dial: "55" },
  { iso: "JP", name: "Japan", dial: "81" },
];

export function guessCountryIso(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  if (tz === "Asia/Kolkata" || tz === "Asia/Calcutta") return "IN";
  const lang = typeof navigator === "undefined" ? "" : navigator.language.toLowerCase();
  const match = COUNTRIES.find((c) => lang.endsWith(`-${c.iso.toLowerCase()}`) || lang.startsWith(c.iso.toLowerCase()));
  return match?.iso ?? "IN";
}

export function countryByIso(iso: string): CountryDial {
  return COUNTRIES.find((c) => c.iso === iso) ?? COUNTRIES[0];
}

export function toE164(dial: string, national: string): string {
  const digits = national.replace(/\D/g, "").replace(/^0+/, "");
  return `+${dial}${digits}`;
}
