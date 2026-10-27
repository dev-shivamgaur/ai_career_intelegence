const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

export function LinkedText({ text, className }: { text: string; className?: string }) {
  const cleaned = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(URL_RE);
  const urls = cleaned.match(URL_RE) ?? [];
  return (
    <span className={className}>
      {parts.map((part, index) => (
        <span key={`${index}-${part.slice(0, 12)}`}>
          {part}
          {urls[index] ? (
            <a
              href={urls[index]}
              target="_blank"
              rel="noreferrer"
              className="break-all font-medium text-brand-800 underline decoration-brand-300 underline-offset-2 dark:text-[#AFEEEE]"
            >
              {labelForUrl(urls[index])}
            </a>
          ) : null}
        </span>
      ))}
    </span>
  );
}

export function summaryPoints(text: string): string[] {
  const cleaned = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const pieces = cleaned
    .split(/(?=https?:\/\/)|(?<=[.!?])\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter((part) => part.length > 24);
  const unique = [...new Set(pieces)];
  return (unique.length ? unique : [cleaned]).slice(0, 6);
}

function labelForUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || url;
  } catch {
    return url;
  }
}
