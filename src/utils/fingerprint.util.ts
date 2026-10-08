import { sha256 } from "./hasn.util";


export type FingerprintInput = {
    userAgent?: string;
    os?: string;
    browser?: string;
    timezone?: string;
    screenResolution?: string;
    clientDeviceId: string; // random identifier stored client-side
  };

  export function computeFingerprint(input: FingerprintInput) {
    const parts = [
      input.userAgent ?? '',
      input.os ?? '',
      input.browser ?? '',
      input.timezone ?? '',
      input.screenResolution ?? '',
      input.clientDeviceId,
    ];
    return sha256(parts.join('|'));
  }