const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: '...',
  bull: '-',
  middot: '-',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return NAMED[code.toLowerCase()] ?? match;
  });
}

/** Keeps headings and list items on their own lines so section detection (Requirements / Nice to have) works. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/li>/gi, '')
      .replace(/<\/(p|div|ul|ol|h[1-6]|tr|section|header)>/gi, '\n')
      .replace(/<(p|div|h[1-6]|ul|ol|tr|section|header)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n+(?=- )/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
