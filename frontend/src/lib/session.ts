import type { User } from "@/types";
import { roleFromAccessToken } from "@/services/mappers";

export interface SessionSnapshot {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  expiresAt: number | null;
}

const empty: SessionSnapshot = {
  accessToken: null,
  refreshToken: null,
  user: null,
  expiresAt: null,
};

let memory: SessionSnapshot = { ...empty };

function jwtExpiresAt(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export const sessionStore = {
  load(): SessionSnapshot {
    return { ...memory };
  },
  getAccess() {
    return memory.accessToken;
  },
  getRefresh() {
    return memory.refreshToken;
  },
  getUser() {
    return memory.user;
  },
  isAccessFresh(skewMs = 20_000) {
    const token = memory.accessToken;
    if (!token) return false;
    const exp = memory.expiresAt ?? jwtExpiresAt(token);
    return Boolean(exp && exp - Date.now() > skewMs);
  },
  save(snapshot: Partial<SessionSnapshot>) {
    memory = { ...memory, ...snapshot };
  },
  setUser(user: User) {
    memory = { ...memory, user };
  },
  set(access: string, user?: User, expiresInSeconds?: number, refresh?: string) {
    const fromJwt = jwtExpiresAt(access);
    const fromTtl = typeof expiresInSeconds === "number" ? Date.now() + expiresInSeconds * 1000 : null;
    const jwtRole = roleFromAccessToken(access);
    const nextUser = user
      ? { ...user, role: jwtRole ?? user.role }
      : memory.user
        ? { ...memory.user, role: jwtRole ?? memory.user.role }
        : memory.user;
    memory = {
      accessToken: access,
      refreshToken: refresh ?? memory.refreshToken,
      user: nextUser,
      expiresAt: fromTtl ?? fromJwt ?? Date.now() + 15 * 60 * 1000,
    };
  },
  clear() {
    memory = { ...empty };
  },
};
