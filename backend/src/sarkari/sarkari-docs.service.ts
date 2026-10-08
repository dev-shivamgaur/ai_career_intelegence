import { Injectable } from '@nestjs/common';
import { DocumentType, EducationLevel } from '../prisma/client';

export type SarkariPaper = 'tenth' | 'twelfth' | 'grad';
export type SarkariDocNeed = 'required' | 'recommended' | 'optional';

export type ClassifiedDoc = {
  id: string;
  type: DocumentType;
  filename: string;
  originalName: string;
  paper: SarkariPaper | 'other';
  dateOfBirth?: string | null;
  summary?: string | null;
};

@Injectable()
export class SarkariDocsService {
  ladder(educationLevel: EducationLevel): Record<SarkariPaper, SarkariDocNeed> {
    if (educationLevel === EducationLevel.POSTGRADUATE || educationLevel === EducationLevel.UNDERGRADUATE) {
      return { tenth: 'required', twelfth: 'required', grad: 'required' };
    }
    if (educationLevel === EducationLevel.DIPLOMA || educationLevel === EducationLevel.INTERMEDIATE) {
      return { tenth: 'required', twelfth: 'required', grad: 'optional' };
    }
    return { tenth: 'required', twelfth: 'optional', grad: 'optional' };
  }

  classify(docs: Array<{
    id: string;
    type: DocumentType;
    filename: string;
    originalName: string;
    extraction?: {
      summary?: string | null;
      degree?: string | null;
      subjects?: unknown;
      suggestedFields?: unknown;
      rawPayload?: unknown;
    } | null;
  }>): ClassifiedDoc[] {
    return docs.map((d) => {
      const blob = `${d.filename} ${d.originalName} ${d.extraction?.degree ?? ''} ${d.extraction?.summary ?? ''}`;
      return {
        id: d.id,
        type: d.type,
        filename: d.filename,
        originalName: d.originalName,
        paper: this.paperFromText(blob, d.type),
        dateOfBirth: this.pickDob(d.extraction),
        summary: d.extraction?.summary ?? null,
      };
    });
  }

  highestPaper(rows: ClassifiedDoc[], educationLevel: EducationLevel): SarkariPaper | 'none' {
    if (rows.some((r) => r.paper === 'grad') || educationLevel === EducationLevel.UNDERGRADUATE || educationLevel === EducationLevel.POSTGRADUATE) {
      if (rows.some((r) => r.paper === 'grad') || educationLevel === EducationLevel.POSTGRADUATE) return 'grad';
      if (rows.some((r) => r.type === DocumentType.DEGREE)) return 'grad';
    }
    if (
      rows.some((r) => r.paper === 'twelfth') ||
      educationLevel === EducationLevel.DIPLOMA ||
      educationLevel === EducationLevel.INTERMEDIATE
    ) {
      return 'twelfth';
    }
    if (rows.some((r) => r.paper === 'tenth')) return 'tenth';
    if (educationLevel === EducationLevel.HIGH_SCHOOL) return 'tenth';
    return 'none';
  }

  missingPapers(educationLevel: EducationLevel, rows: ClassifiedDoc[], student: boolean): SarkariPaper[] {
    const need = this.ladder(educationLevel);
    const have = new Set(rows.map((r) => r.paper));
    const missing: SarkariPaper[] = [];
    (['tenth', 'twelfth', 'grad'] as SarkariPaper[]).forEach((p) => {
      if (need[p] !== 'required') return;
      if (p === 'grad' && student) return;
      if (!have.has(p) && !(p === 'grad' && rows.some((r) => r.type === DocumentType.DEGREE))) {
        missing.push(p);
      }
    });
    return missing;
  }

  paperFromText(text: string, type: DocumentType): SarkariPaper | 'other' {
    const t = text.toLowerCase();
    if (/\b(class\s*12|12th|xii|intermediate|inter\b|higher secondary|hsc|10\s*\+\s*2|\+2)\b/.test(t)) {
      return 'twelfth';
    }
    if (/\b(class\s*10|10th|xth|matric|sslc|high school)\b/.test(t)) return 'tenth';
    if (type === DocumentType.DEGREE || /\b(b\.?\s*tech|bca|bsc|ba\b|b\.?\s*com|graduation|bachelor|degree)\b/.test(t)) {
      return 'grad';
    }
    if (type === DocumentType.MARKSHEET && /\b12\b/.test(t)) return 'twelfth';
    if (type === DocumentType.MARKSHEET && /\b10\b/.test(t)) return 'tenth';
    return 'other';
  }

  pickDob(extraction?: {
    suggestedFields?: unknown;
    rawPayload?: unknown;
    summary?: string | null;
    subjects?: unknown;
    degree?: string | null;
  } | null): string | null {
    if (!extraction) return null;
    const fields = asRecord(extraction.suggestedFields);
    const raw = asRecord(extraction.rawPayload);
    const blob = [
      fields?.dateOfBirth,
      fields?.dob,
      fields?.date_of_birth,
      raw?.dateOfBirth,
      asRecord(raw?.suggestedFields)?.dateOfBirth,
      extraction.degree,
      extraction.summary,
      JSON.stringify(extraction.subjects ?? ''),
      JSON.stringify(extraction.suggestedFields ?? ''),
      JSON.stringify(extraction.rawPayload ?? ''),
    ]
      .map((c) => String(c ?? ''))
      .join(' ');
    return this.parseDob(blob);
  }

  parseDob(text: string): string | null {
    if (!text) return null;
    const labeled = text.match(
      /(?:date\s*of\s*birth|d\.?\s*o\.?\s*b\.?|जन्म(?:\s*तिथि)?)[^\d]{0,24}(\d{1,2})[\/.\-](\d{1,2})[\/.\-]((?:19|20)\d{2})/i,
    );
    if (labeled) {
      return `${labeled[3]}-${labeled[2].padStart(2, '0')}-${labeled[1].padStart(2, '0')}`;
    }
    const iso = text.match(/\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = text.match(/\b(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ]((?:19|20)\d{2}|\d{2})\b/);
    if (dmy) {
      const day = dmy[1].padStart(2, '0');
      const month = dmy[2].padStart(2, '0');
      let year = dmy[3];
      if (year.length === 2) year = Number(year) > 30 ? `19${year}` : `20${year}`;
      return `${year}-${month}-${day}`;
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
      return `${named[3]}-${String(monthNum).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
    }
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
