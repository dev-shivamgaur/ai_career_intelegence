import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { skillsFromText } from './skill-lexicon';

@Injectable()
export class SkillLexiconService {
  constructor(private readonly prisma: PrismaService) {}

  private names: string[] | null = null;

  async catalogNames(): Promise<string[]> {
    if (this.names) return this.names;
    const rows = await this.prisma.skill.findMany({ select: { name: true } });
    this.names = rows.map((r) => r.name);
    return this.names;
  }

  async match(text: string): Promise<string[]> {
    return skillsFromText(text, await this.catalogNames());
  }

  invalidate() {
    this.names = null;
  }
}
