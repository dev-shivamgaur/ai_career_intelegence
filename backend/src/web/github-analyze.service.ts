import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../ai/llm.service';
import { githubUrlsFromText } from '../ai/resume-projects';

export type GithubAnalysis = {
  url: string;
  languages: Record<string, number>;
  skills: string[];
  summary: string;
  hasTests: boolean;
  manifests: string[];
};

const SKIP = /(^|\/)(node_modules|dist|build|\.git|vendor|coverage|__pycache__)(\/|$)/i;
const MANIFEST = /^(package\.json|go\.mod|pom\.xml|requirements\.txt|pyproject\.toml|dockerfile|composer\.json|cargo\.toml|build\.gradle)$/i;

@Injectable()
export class GithubAnalyzeService {
  private readonly logger = new Logger(GithubAnalyzeService.name);

  constructor(private readonly llm: LlmService) {}

  isGithubRepo(url?: string | null) {
    return Boolean(url && /github\.com\/[^/]+\/[^/#?]+/i.test(url));
  }

  parseRepo(url: string) {
    const m = url.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (!m) return null;
    return { owner: m[1], repo: m[2].replace(/\.git$/i, '') };
  }

  async analyzeUrl(url: string, opts?: { skipLlm?: boolean }): Promise<GithubAnalysis | null> {
    const parsed = this.parseRepo(url);
    if (!parsed) return null;
    const { owner, repo } = parsed;
    const headers = { 'User-Agent': 'ai-career-intelligence', Accept: 'application/vnd.github+json' };

    const languages = await this.getJson<Record<string, number>>(
      `https://api.github.com/repos/${owner}/${repo}/languages`,
      headers,
    );
    const tree = await this.getJson<{ tree?: Array<{ path: string; type: string; size?: number }> }>(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      headers,
    );
    const paths = (tree?.tree ?? [])
      .filter((n) => n.type === 'blob' && n.path && !SKIP.test(n.path) && (n.size ?? 0) < 80_000)
      .map((n) => n.path);

    const manifests = paths.filter((p) => MANIFEST.test(p.split('/').pop() ?? ''));
    const hasTests = paths.some((p) => /test|spec|__tests__/i.test(p));
    const jsTests = paths.some((p) => /\.(test|spec)\.(js|jsx|ts|tsx)$/i.test(p) || /__tests__\//i.test(p));
    const langSkills = Object.keys(languages ?? {}).map((k) => k.toLowerCase());
    const fromManifests = this.skillsFromPaths(manifests);

    const samplePaths = this.pickSample(paths, manifests, Object.keys(languages ?? {}));
    const chunks: string[] = [];
    let used = 0;
    for (const p of samplePaths) {
      const raw = await this.getText(
        `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${p}`,
      );
      if (!raw) continue;
      const slice = raw.slice(0, 1600);
      chunks.push(`FILE ${p}\n${slice}`);
      used += slice.length;
      if (used >= 12000) break;
    }

    const depSkills = this.skillsFromFileText(chunks);
    const skills = [
      ...new Set([
        ...depSkills,
        ...(jsTests ? ['jest', 'testing'] : hasTests ? ['testing'] : []),
        ...fromManifests,
        ...langSkills,
      ]),
    ].slice(0, 40);
    let summary = `Languages: ${langSkills.join(', ') || 'unknown'}. Libraries: ${depSkills.slice(0, 12).join(', ') || 'none read'}. Files sampled: ${samplePaths.length}. Tests: ${hasTests ? 'yes' : 'unclear'}.`;

    if (this.llm.isConfigured() && chunks.length && !opts?.skipLlm) {
      try {
        summary = (
          await this.llm.complete(
            [
              {
                role: 'system',
                content:
                  'Summarize what this public repo shows the author can do. 6-10 lines. List evidenced skills as comma names at the end after SKILLS:. No full file dumps.',
              },
              { role: 'user', content: chunks.join('\n\n').slice(0, 12000) },
            ],
            { temperature: 0.2 },
          )
        ).slice(0, 1800);
        const skillLine = summary.split(/SKILLS:/i)[1];
        if (skillLine) {
          for (const s of skillLine.split(',').map((x) => x.trim()).filter(Boolean)) {
            skills.push(s.slice(0, 40));
          }
        }
      } catch (err) {
        this.logger.warn(`github llm skip: ${(err as Error).message}`);
      }
    }

    return {
      url: `https://github.com/${owner}/${repo}`,
      languages: languages ?? {},
      skills: [...new Set(skills)].slice(0, 40),
      summary,
      hasTests,
      manifests,
    };
  }

  urlsFromText(text: string) {
    return githubUrlsFromText(text);
  }

  /** Read library names out of package.json / requirements so Jest, Express, React, Next count as work. */
  private skillsFromFileText(chunks: string[]) {
    const out: string[] = [];
    for (const chunk of chunks) {
      const body = chunk.replace(/^FILE .+\n/, '');
      const pkg = body.match(/"(?:dependencies|devDependencies)"\s*:\s*\{([^}]*)\}/g);
      if (pkg) {
        for (const block of pkg) {
          for (const name of block.matchAll(/"([^"]+)"\s*:/g)) {
            const dep = name[1];
            if (dep === 'dependencies' || dep === 'devDependencies') continue;
            out.push(dep.replace(/^@/, '').split('/')[0]);
          }
        }
      }
      if (/^(jest|express|react|next|vue|django|flask|pytest|fastapi)\b/im.test(body)) {
        const hit = body.match(/\b(jest|express|react|next|vue|django|flask|pytest|fastapi)\b/i);
        if (hit) out.push(hit[1]);
      }
    }
    return out;
  }

  private skillsFromPaths(manifests: string[]) {
    const out: string[] = [];
    for (const p of manifests) {
      const f = p.split('/').pop()?.toLowerCase() ?? '';
      if (f === 'package.json') out.push('javascript', 'node');
      if (f === 'go.mod') out.push('go');
      if (f === 'pom.xml' || f.includes('gradle')) out.push('java');
      if (f.includes('requirements') || f === 'pyproject.toml') out.push('python');
      if (f === 'dockerfile') out.push('docker');
      if (f === 'cargo.toml') out.push('rust');
    }
    return out;
  }

  private pickSample(paths: string[], manifests: string[], langs: string[]) {
    const picked: string[] = [];
    const readme = paths.find((p) => /^readme(\.md)?$/i.test(p.split('/').pop() ?? ''));
    if (readme) picked.push(readme);
    for (const m of manifests.slice(0, 4)) picked.push(m);
    const extFor = (lang: string) => {
      const l = lang.toLowerCase();
      if (l.includes('javascript') || l.includes('typescript')) return ['.ts', '.js', '.tsx'];
      if (l.includes('python')) return ['.py'];
      if (l.includes('java')) return ['.java'];
      if (l.includes('go')) return ['.go'];
      return ['.ts', '.js', '.py'];
    };
    for (const lang of langs.slice(0, 3)) {
      const exts = extFor(lang);
      const hits = paths.filter((p) => exts.some((e) => p.endsWith(e)) && !MANIFEST.test(p.split('/').pop() ?? ''));
      picked.push(...hits.slice(0, 2));
    }
    return [...new Set(picked)].slice(0, 12);
  }

  private async getJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch (err) {
      this.logger.warn(`github json ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  private async getText(url: string): Promise<string> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ai-career-intelligence' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return '';
      return await res.text();
    } catch {
      return '';
    }
  }
}
