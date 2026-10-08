async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return `f${(h >>> 0).toString(16)}`;
}

export class DeviceFingerprint {
  static collect() {
    const nav = typeof navigator === "undefined" ? null : navigator;
    return {
      userAgent: nav?.userAgent ?? "",
      language: nav?.language ?? "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    };
  }

  static payload(): string {
    const c = this.collect();
    return [c.userAgent, c.language, c.timezone].join("|");
  }

  static async hash(): Promise<string> {
    return sha256Hex(this.payload());
  }

  static async headers(): Promise<Record<string, string>> {
    const c = this.collect();
    return {
      "X-Device-Fingerprint": await this.hash(),
      "X-Device-Language": c.language,
      "X-Device-Timezone": c.timezone,
    };
  }
}
