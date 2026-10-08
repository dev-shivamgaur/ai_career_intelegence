import type { User } from "@/types";
import { http, tokenStore } from "../http";
import { sessionStore } from "@/lib/session";
import { mapAuthUser, normalizePhone } from "../mappers";

interface AuthPayload {
  user: {
    id: string;
    phone: string;
    name?: string | null;
    email?: string | null;
    avatarInitials?: string | null;
    role?: string | null;
    isDemo: boolean;
    onboardingComplete: boolean;
  };
  accessToken: string;
  expiresIn?: number;
}

function persistMemory(payload: AuthPayload): User {
  const user = mapAuthUser(payload.user);
  sessionStore.set(payload.accessToken, user, payload.expiresIn);
  return user;
}

export interface SendOtpResult {
  phone: string;
  message: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  sendsUsed: number;
  sendsRemaining: number;
  sendWindowSeconds: number;
  sendWindowRemainingSeconds: number;
  verifyAttemptsMax: number;
}

export async function sendOtp(phone: string) {
  return http.post<SendOtpResult>("/auth/send-otp", {
    phone: normalizePhone(phone),
  });
}

export async function verifyOtp(phone: string, code: string, name?: string): Promise<User> {
  const payload = await http.post<AuthPayload>("/auth/verify-otp", {
    phone: normalizePhone(phone),
    code,
    name,
  });
  return persistMemory(payload);
}

export async function getSessionUser(): Promise<User | null> {
  try {
    const u = await http.get<AuthPayload["user"]>("/auth/me");
    const user = mapAuthUser(u);
    const access = sessionStore.getAccess();
    if (access) sessionStore.set(access, user);
    else sessionStore.setUser(user);
    return user;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await http.post("/auth/logout", {});
  } catch {
    /* still clear memory */
  }
  sessionStore.clear();
  tokenStore.clear();
}
