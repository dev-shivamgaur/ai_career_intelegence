export type ParsedProject = {
  name: string;
  description: string;
  skills: string[];
  link?: string;
  year?: number;
};

const GITHUB_RE = /https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/gi;

export function githubUrlsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(GITHUB_RE)) {
    const url = match[0].replace(/[),.;]+$/g, '');
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

export function projectsFromResumeText(text: string): ParsedProject[] {
  const urls = githubUrlsFromText(text);
  const section = splitProjectsSection(text);
  const named = namedProjects(section);
  if (named.length) {
    return named.map((p, i) => ({
      ...p,
      link: p.link || urls[i],
    }));
  }
  return urls.map((link, i) => {
    const repo = link.split('/').filter(Boolean).slice(-1)[0] ?? `Project ${i + 1}`;
    return {
      name: repo.replace(/[-_]/g, ' '),
      description: `GitHub repository extracted from the resume: ${link}`,
      skills: [],
      link,
    };
  });
}

function splitProjectsSection(text: string) {
  const parts = text.split(/\bprojects?\b\s*[:\-]?\s*\n/i);
  if (parts.length < 2) return text.slice(0, 6000);
  return parts.slice(1).join('\n').slice(0, 8000);
}

function namedProjects(section: string): ParsedProject[] {
  const blocks = section
    .split(/\n(?=[A-Z][^\n]{2,80}(?:\n|$))/)
    .map((b) => b.trim())
    .filter((b) => b.length > 12);
  const out: ParsedProject[] = [];
  for (const block of blocks.slice(0, 8)) {
    const first = block.split('\n')[0]?.trim() ?? '';
    if (/^(education|experience|skills|certification|intern)/i.test(first)) continue;
    if (first.length > 90) continue;
    const links = githubUrlsFromText(block);
    out.push({
      name: first.replace(/[-•*]/g, '').trim().slice(0, 80) || 'Project',
      description: block.replace(/\s+/g, ' ').slice(0, 600),
      skills: [],
      link: links[0],
    });
  }
  return out.filter((p) => !/^(skills|education|experience)$/i.test(p.name));
}

export async function githubReadmeSummary(url: string): Promise<string> {
  const m = url.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!m) return '';
  const [, owner, repo] = m;
  const raw = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`;
  try {
    const res = await fetch(raw, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return '';
    const body = (await res.text()).replace(/[#*`]/g, ' ').replace(/\s+/g, ' ').trim();
    return body.slice(0, 700);
  } catch {
    return '';
  }
}
