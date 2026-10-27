import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GithubAnalyzeService } from '../web/github-analyze.service';
import { SkillResolverService } from '../skill-intel/skill-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { SkillEvidenceService } from './skill-evidence.service';

const SIGNAL = 'Seen in a public repository file or dependency. This is not proof of proficiency.';

@Injectable()
export class GithubEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubAnalyzeService,
    private readonly resolver: SkillResolverService,
    private readonly evidence: SkillEvidenceService,
  ) {}

  async list(userId: string) {
    const profile = await this.profile(userId);
    return this.prisma.githubRepoLink.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, owner: true, repo: true, url: true, revokedAt: true, lastScannedAt: true },
    });
  }

  /** Records signals already read from a public repo. Does not delete older evidence. */
  async remember(profileId: string, url: string, skillNames: string[]) {
    const parsed = this.github.parseRepo(url);
    if (!parsed) return { skills: 0 };
    const existing = await this.prisma.githubRepoLink.findUnique({
      where: { profileId_owner_repo: { profileId, owner: parsed.owner, repo: parsed.repo } },
    });
    if (existing?.revokedAt) return { skills: 0 };
    await this.prisma.githubRepoLink.upsert({
      where: { profileId_owner_repo: { profileId, owner: parsed.owner, repo: parsed.repo } },
      create: { profileId, owner: parsed.owner, repo: parsed.repo, url: `https://github.com/${parsed.owner}/${parsed.repo}`, lastScannedAt: new Date() },
      update: { lastScannedAt: new Date() },
    });
    const resolved = await this.resolver.resolveMany(skillNames);
    const seen = new Set<string>();
    for (const hit of resolved) {
      if (!hit.skillId || seen.has(hit.skillId)) continue;
      seen.add(hit.skillId);
      await this.evidence.observe({
        profileId,
        skillId: hit.skillId,
        source: 'GITHUB',
        quality: 'DEMONSTRATED',
        sourceRef: url,
        signal: SIGNAL,
      });
    }
    return { skills: seen.size };
  }

  /** Public repo only. A rescan appends evidence. It does not delete older GitHub rows. */
  async scan(userId: string, url: string) {
    const parsed = this.github.parseRepo(url);
    if (!parsed) throw new BadRequestException({ error: 'NOT_A_GITHUB_REPO', message: 'Paste a public GitHub repository URL' });
    const profile = await this.profile(userId);
    const analysis = await this.github.analyzeUrl(url, { skipLlm: true });
    if (!analysis) throw new NotFoundException({ error: 'REPO_NOT_PUBLIC', message: 'That repository was not readable. Private repositories are not scanned.' });
    const link = await this.prisma.githubRepoLink.upsert({
      where: { profileId_owner_repo: { profileId: profile.id, owner: parsed.owner, repo: parsed.repo } },
      create: { profileId: profile.id, owner: parsed.owner, repo: parsed.repo, url: analysis.url, lastScannedAt: new Date() },
      update: { url: analysis.url, revokedAt: null, lastScannedAt: new Date() },
    });
    const resolved = await this.resolver.resolveMany(analysis.skills);
    const recorded: string[] = [];
    for (const hit of resolved) {
      if (!hit.skillId || recorded.includes(hit.skillId)) continue;
      recorded.push(hit.skillId);
      await this.evidence.observe({
        profileId: profile.id,
        skillId: hit.skillId,
        source: 'GITHUB',
        quality: 'DEMONSTRATED',
        sourceRef: analysis.url,
        signal: SIGNAL,
      });
    }
    return { link: { id: link.id, url: link.url, revokedAt: link.revokedAt }, skills: recorded.length, note: SIGNAL };
  }

  /** Stops future scans. Evidence rows already stored stay. */
  async disconnect(userId: string, linkId: string) {
    const profile = await this.profile(userId);
    const link = await this.prisma.githubRepoLink.findFirst({ where: { id: linkId, profileId: profile.id } });
    if (!link) throw new NotFoundException({ error: 'LINK_NOT_FOUND', message: 'GitHub link not found' });
    await this.prisma.githubRepoLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
    return { id: link.id, revokedAt: new Date().toISOString() };
  }

  private async profile(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException({ error: 'PROFILE_NOT_FOUND', message: 'Profile not found' });
    return profile;
  }
}
