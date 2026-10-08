import { Injectable, Logger } from '@nestjs/common';
import { DocumentType } from '../prisma/client';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService, messageText } from './llm.service';
import { documentExtractionSchema, type DocumentExtractionResult } from './agent.schemas';
import { DocumentParseService } from './document-parse.service';
import { SkillLexiconService } from './skill-lexicon.service';
import { projectsFromResumeText } from './resume-projects';
import { keepSkillName } from './skill-lexicon';

export type ExtractionContext = {
  status?: string;
  educationLevel?: string;
  label?: string;
};

@Injectable()
export class DocumentIntelligenceService {
  private readonly logger = new Logger(DocumentIntelligenceService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly parser: DocumentParseService,
    private readonly lexicon: SkillLexiconService,
  ) {}

  async extract(
    filename: string,
    type: DocumentType,
    file?: { buffer: Buffer; mimeType: string },
    context: ExtractionContext = {},
  ): Promise<DocumentExtractionResult> {
    if (!file) {
      return this.fromModel(filename, type, context, `No file bytes for ${filename}.`);
    }

    const mime = file.mimeType || 'application/octet-stream';
    if (this.parser.isImage(mime)) {
      return this.fromVision(filename, type, mime, file.buffer, context, 'image');
    }

    if (this.parser.isPdf(mime, filename)) {
      return this.fromPdf(filename, type, file.buffer, context);
    }

    if (this.isTextLike(mime, filename)) {
      return this.fromModel(
        filename,
        type,
        context,
        file.buffer.toString('utf8').slice(0, 14000),
      );
    }

    return this.fromModel(
      filename,
      type,
      context,
      `Unsupported binary (${mime}). Infer only from filename and the user-supplied label "${context.label ?? ''}". Do not invent marks.`,
    );
  }

  private async fromPdf(
    filename: string,
    type: DocumentType,
    buffer: Buffer,
    context: ExtractionContext,
  ): Promise<DocumentExtractionResult> {
    const docs = await this.parser.loadPdfDocuments(buffer, filename);
    const pages = this.parser.pagesFromDocs(docs);
    const scanned = this.parser.needsOcr(pages);

    if (scanned) {
      this.logger.log(`PDF ${filename} looks scanned — rasterizing pages for vision OCR`);
      try {
        const images = await this.parser.rasterizePdf(buffer, 1);
        const parts: DocumentExtractionResult[] = [];
        for (const img of images) {
          parts.push(
            await this.fromVision(
              `${filename}#p${img.page}`,
              type,
              img.mimeType,
              img.buffer,
              context,
              `scanned PDF page ${img.page}`,
            ),
          );
        }
        return this.merge(parts, context, { source: 'vision-ocr', pages: images.length });
      } catch (err) {
        this.logger.warn(`Raster OCR failed: ${(err as Error).message}`);
      }
    }

    const chunks = await this.parser.splitDocuments(docs);
    const text = (chunks.length ? chunks : docs)
      .slice(0, 8)
      .map((d, i) => `--- chunk ${i + 1} ---\n${d.pageContent}`)
      .join('\n\n')
      .slice(0, 18000);

    if (text.replace(/\s/g, '').length > 250) {
      try {
        const extracted = await this.withLexicon(await this.fromModel(filename, type, context, text), text);
        return {
          ...extracted,
          suggestedFields: {
            ...(extracted.suggestedFields ?? {}),
            source: scanned ? 'pdf-text-fallback' : 'pdf-loader',
            pages: pages.length,
            label: context.label,
          },
        };
      } catch {
        return this.heuristicFromText(filename, type, context, text);
      }
    }

    return this.heuristicFromText(filename, type, context, text || 'PDF contained no extractable text.');
  }

  private async withLexicon(result: DocumentExtractionResult, text: string): Promise<DocumentExtractionResult> {
    const extra = text.trim() ? await this.lexicon.match(text) : [];
    const seen = new Set<string>();
    const skillsDetected: string[] = [];
    for (const raw of [...(result.skillsDetected ?? []), ...extra]) {
      const kept = keepSkillName(raw);
      if (!kept) continue;
      const key = kept.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      skillsDetected.push(kept);
    }
    const summary = result.summary?.trim() || text.replace(/\s+/g, ' ').trim().slice(0, 800);
    return { ...result, skillsDetected, summary };
  }

  private async fromVision(
    filename: string,
    type: DocumentType,
    mime: string,
    buffer: Buffer,
    context: ExtractionContext,
    kind: string,
  ) {
    const system = this.systemPrompt(type, context);
    const human = new HumanMessage({
      content: [
        {
          type: 'text',
          text: `OCR and extract career facts from this ${kind} (${filename}). Return JSON only. If several marksheets appear, list every subject/marks you can read.`,
        },
        {
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${buffer.toString('base64')}` },
        },
      ],
    });
    try {
      const raw = await this.invokeLlm([system, human]);
      return this.finalizeExtraction(this.parseJson(messageText(raw.content)), context, {
        source: 'vision',
        kind,
      });
    } catch {
      return this.heuristicFromText(filename, type, context, `${filename} ${kind}`);
    }
  }

  private async fromModel(
    filename: string,
    type: DocumentType,
    context: ExtractionContext,
    body: string,
  ) {
    const system = this.systemPrompt(type, context);
    const human = new HumanMessage(
      `Extract facts from this ${type} named ${filename}${context.label ? ` (user label: ${context.label})` : ''}:\n\n${body}`,
    );
    try {
      const raw = await this.invokeLlm([system, human]);
      return this.finalizeExtraction(this.parseJson(messageText(raw.content)), context, {
        source: 'text',
      });
    } catch {
      return this.heuristicFromText(filename, type, context, body);
    }
  }

  private systemPrompt(type: DocumentType, context: ExtractionContext) {
    return new SystemMessage(
      `You extract career facts from any profession (software, marketing, HR, sales, design, operations, teaching, finance, government).
Return only JSON with these keys:
degree, dateOfBirth, subjects[{name,marks}], skillsDetected[], summary, suggestedFields,
jobs[{title,organization,type:INTERNSHIP|JOB|FREELANCE,startYear,endYear,isPresent,summary}],
projects[{name,description,skills[],link,year}],
education[{degree,institution,year}],
certifications[{name,issuer,year}].
dateOfBirth is mandatory when the paper prints it (Indian boards often use DD/MM/YYYY). Copy that exact date.
marks must be strings. Do not invent employers, degrees, marks, or dates.
skillsDetected: copy named tools, languages, methods, and platforms from the skills or tools section. Any profession, not only software. Keep the phrase the resume uses (for example "Tailwind CSS", "Google Ads", "Payroll"). Do not emit generic English words such as app, client, server, public, custom, stack, interface, classes, components, rendering, database, testing, design, or development.
jobs: only real employers. If the resume has no job or internship, return jobs as [].
projects: only named projects. If there are none, return projects as []. Copy every named project. If a GitHub, Behance, Dribbble, LinkedIn, or portfolio URL appears, put it in projects[].link.
summary must mention education, work, projects, and links that are actually printed. Do not invent any of them.
Document type: ${type}.
User status: ${context.status ?? 'unknown'}.
Education level: ${context.educationLevel ?? 'unknown'}.
User label: ${context.label || 'none'}.`,
    );
  }

  private merge(
    parts: DocumentExtractionResult[],
    context: ExtractionContext,
    meta: Record<string, unknown>,
  ): DocumentExtractionResult {
    const subjects = new Map<string, { name: string; marks: string }>();
    const skills = new Set<string>();
    const summaries: string[] = [];
    const jobs: DocumentExtractionResult['jobs'] = [];
    const projects: DocumentExtractionResult['projects'] = [];
    const education: DocumentExtractionResult['education'] = [];
    const certifications: DocumentExtractionResult['certifications'] = [];
    let degree = context.label || '';
    for (const p of parts) {
      if (p.degree && !degree) degree = p.degree;
      for (const s of p.subjects ?? []) {
        const key = s.name.trim().toLowerCase();
        if (key && !subjects.has(key)) subjects.set(key, { name: s.name.trim(), marks: s.marks });
      }
      for (const sk of p.skillsDetected ?? []) skills.add(sk);
      if (p.summary) summaries.push(p.summary);
      jobs.push(...(p.jobs ?? []));
      projects.push(...(p.projects ?? []));
      education.push(...(p.education ?? []));
      certifications.push(...(p.certifications ?? []));
    }
    let dateOfBirth = this.parseDobFromText(summaries.join(' ')) ?? undefined;
    for (const p of parts) {
      if (!dateOfBirth && p.dateOfBirth) dateOfBirth = p.dateOfBirth;
    }
    return this.finalizeExtraction(
      {
        degree: degree || undefined,
        dateOfBirth,
        subjects: [...subjects.values()],
        skillsDetected: [...skills],
        summary: summaries.join(' ').slice(0, 2000) || 'Scanned pages processed.',
        jobs,
        projects,
        education,
        certifications,
        suggestedFields: { ...meta, label: context.label, pageCount: parts.length },
      },
      context,
      meta,
    );
  }

  private async invokeLlm(messages: Array<SystemMessage | HumanMessage>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.llm.chat({ temperature: 0 }).invoke(messages),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('LLM extraction timed out')), 18_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async heuristicFromText(
    filename: string,
    type: DocumentType,
    context: ExtractionContext,
    body: string,
  ): Promise<DocumentExtractionResult> {
    const skills = await this.lexicon.match(`${filename} ${body} ${context.label ?? ''}`);
    const degreeMatch = body.match(/\b(B\.?Tech|BCA|MCA|B\.?Sc|M\.?Tech|MBA|BBA|Diploma|B\.?E)\b/i);
    const jobs: DocumentExtractionResult['jobs'] = [];
    const projects = projectsFromResumeText(body);
    const dob = this.parseDobFromText(`${filename} ${body} ${JSON.stringify(context)}`);
    return this.finalizeExtraction(
      {
        degree: context.label || degreeMatch?.[0],
        dateOfBirth: dob ?? undefined,
        subjects: [],
        skillsDetected: skills,
        summary: body.replace(/\s+/g, ' ').slice(0, 800) || `Read ${filename} without a long model pass.`,
        suggestedFields: { source: 'heuristic', type, label: context.label, dateOfBirth: dob },
        jobs,
        projects,
      },
      context,
      { source: 'heuristic', type },
    );
  }

  private finalizeExtraction(
    raw: unknown,
    context: ExtractionContext,
    meta: Record<string, unknown>,
  ): DocumentExtractionResult {
    const parsed = documentExtractionSchema.parse(this.normalizeExtraction(raw));
    const blob = [
      parsed.dateOfBirth,
      parsed.dob,
      parsed.date_of_birth,
      parsed.summary,
      parsed.degree,
      JSON.stringify(raw ?? ''),
      JSON.stringify(parsed.suggestedFields ?? ''),
      context.label ?? '',
    ].join(' ');
    const dateOfBirth =
      this.parseDobFromText(String(parsed.dateOfBirth ?? '')) ||
      this.parseDobFromText(String(parsed.dob ?? '')) ||
      this.parseDobFromText(String(parsed.date_of_birth ?? '')) ||
      this.parseDobFromText(blob) ||
      undefined;
    const fallbackProjects = projectsFromResumeText(blob);
    const projects = parsed.projects?.length ? parsed.projects : fallbackProjects;
    return {
      ...parsed,
      dateOfBirth,
      projects,
      suggestedFields: {
        ...(parsed.suggestedFields && typeof parsed.suggestedFields === 'object'
          ? parsed.suggestedFields
          : {}),
        ...meta,
        label: context.label,
        dateOfBirth,
      },
    };
  }

  private normalizeExtraction(raw: unknown): Record<string, unknown> {
    const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
    const nested = obj.suggestedFields;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const n = nested as Record<string, unknown>;
      obj.dateOfBirth = obj.dateOfBirth ?? n.dateOfBirth ?? n.dob ?? n.date_of_birth;
    }
    if (Array.isArray(obj.subjects)) {
      obj.subjects = obj.subjects.map((row) => {
        if (!row || typeof row !== 'object') return { name: String(row), marks: '' };
        const s = row as Record<string, unknown>;
        return {
          name: s.name ?? s.subject ?? s.SUBJECT ?? '',
          marks: s.marks ?? s.total ?? s.TOTAL ?? s.grade ?? '',
        };
      });
    }
    if (typeof obj.summary !== 'string') {
      obj.summary = obj.summary != null ? String(obj.summary) : '';
    }
    return obj;
  }

  private isTextLike(mime: string, filename: string) {
    const lower = filename.toLowerCase();
    return (
      mime.startsWith('text/') ||
      mime.includes('json') ||
      lower.endsWith('.txt') ||
      lower.endsWith('.md') ||
      lower.endsWith('.csv')
    );
  }

  private parseJson(text: string): unknown {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = (fenced?.[1] ?? text).trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error('Document extraction did not return JSON');
  }

  private parseDobFromText(text: string): string | null {
    if (!text) return null;
    const labeled = text.match(
      /(?:date\s*of\s*birth|d\.?\s*o\.?\s*b\.?|जन्म(?:\s*तिथि)?)[^\d]{0,24}(\d{1,2})[\/.\-](\d{1,2})[\/.\-]((?:19|20)\d{2})/i,
    );
    if (labeled) {
      return this.ymd(labeled[3], labeled[2], labeled[1]);
    }
    const iso = text.match(/\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = text.match(/\b(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ]((?:19|20)\d{2}|\d{2})\b/);
    if (dmy) {
      return this.ymd(dmy[3], dmy[2], dmy[1]);
    }
    const months =
      'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
    const named = text.match(
      new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months})\\s+((?:19|20)\\d{2})\\b`, 'i'),
    );
    if (named) {
      const monthNum = [
        'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
      ].findIndex((m) => named[2].toLowerCase().startsWith(m)) + 1;
      return this.ymd(named[3], String(monthNum), named[1]);
    }
    return null;
  }

  private ymd(yearRaw: string, monthRaw: string, dayRaw: string) {
    let year = yearRaw;
    if (year.length === 2) year = Number(year) > 30 ? `19${year}` : `20${year}`;
    const month = monthRaw.padStart(2, '0');
    const day = dayRaw.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
