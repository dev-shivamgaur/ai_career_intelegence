
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

export function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

/** HMAC-SHA256 for OTP at rest (pepper from env). */
export function hmacOtp(otp: string, pepper: string) {
  return createHmac('sha256', pepper).update(otp, 'utf8').digest('hex');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
