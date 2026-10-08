import type { User, UserRole } from "@/types";

function snake(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

export function mapEnum<T extends string>(value: string | null | undefined, fallback: T): T {
  const s = snake(value);
  if (!s || s === "undefined" || s === "null") return fallback;
  return s as T;
}

export function toApiEnum(value: string): string {
  return value.toUpperCase();
}

export function mapPhase(phase: string): "7d" | "30d" | "60d" | "90d" | "180d" {
  const table: Record<string, "7d" | "30d" | "60d" | "90d" | "180d"> = {
    d7: "7d",
    d30: "30d",
    d60: "60d",
    d90: "90d",
    d180: "180d",
  };
  return table[snake(phase)] ?? "30d";
}

export function mapTaskStatus(status: string): string {
  return snake(status) === "todo" ? "not_started" : snake(status);
}

export function toTaskStatusApi(status: string): string {
  if (status === "not_started") return "NOT_STARTED";
  return status.toUpperCase();
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return digits.startsWith("+") ? digits : `+91${digits}`;
}

export function mapAuthRole(role: string | null | undefined): UserRole {
  return String(role ?? "USER").toUpperCase() === "ADMIN" ? "admin" : "user";
}

export function mapAuthUser(u: {
  id: string;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  avatarInitials?: string | null;
  role?: string | null;
  isDemo?: boolean;
  onboardingComplete?: boolean;
}): User {
  return {
    id: u.id,
    name: u.name ?? "User",
    email: u.email ?? u.phone ?? "",
    phone: u.phone ?? undefined,
    avatarInitials: u.avatarInitials ?? "U",
    role: mapAuthRole(u.role),
    isDemo: Boolean(u.isDemo),
    onboardingComplete: Boolean(u.onboardingComplete),
  };
}

export function roleFromAccessToken(token: string): UserRole | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string };
    if (!json.role) return null;
    return mapAuthRole(json.role);
  } catch {
    return null;
  }
}
