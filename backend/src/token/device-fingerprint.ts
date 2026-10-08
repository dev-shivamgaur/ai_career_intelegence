import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

function header(req: Request, name: string): string {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] ?? '' : value ?? '').trim();
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export class DeviceFingerprint {
  readonly clientDeviceId: string;
  readonly userAgent: string;
  readonly language: string;
  readonly timezone: string;
  readonly hash: string;

  constructor(input: { userAgent: string; language: string; timezone: string }) {
    this.clientDeviceId = '';
    this.userAgent = input.userAgent.trim();
    this.language = input.language.trim();
    this.timezone = input.timezone.trim();
    this.hash = sha256([this.userAgent, this.language, this.timezone].join('|'));
  }

  static fromRequest(req: Request): DeviceFingerprint {
    const language =
      header(req, 'x-device-language') ||
      (header(req, 'accept-language').split(',')[0] ?? '').trim();
    return new DeviceFingerprint({
      userAgent: header(req, 'user-agent'),
      language,
      timezone: header(req, 'x-device-timezone'),
    });
  }

  signature(secret: string, typ: string, jti: string, familyId: string): string {
    return createHmac('sha256', secret)
      .update(`${typ}:${this.hash}:${jti}:${familyId}`)
      .digest('hex');
  }

  matches(storedHash: string): boolean {
    if (!storedHash || storedHash.length !== this.hash.length) return false;
    try {
      return timingSafeEqual(Buffer.from(storedHash), Buffer.from(this.hash));
    } catch {
      return false;
    }
  }
}
