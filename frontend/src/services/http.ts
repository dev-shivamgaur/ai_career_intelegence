import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { DeviceFingerprint } from "@/lib/fingerprint";
import { beginQuery, endQuery } from "@/lib/queryProgress";
import { sessionStore } from "@/lib/session";
import { mapAuthUser } from "@/services/mappers";

export const tokenStore = {
  getAccess() {
    return sessionStore.getAccess();
  },
  getRefresh() {
    return sessionStore.getRefresh();
  },
  set(access: string, refresh?: string, expiresInSeconds?: number) {
    sessionStore.set(access, sessionStore.getUser() ?? undefined, expiresInSeconds, refresh);
  },
  clear() {
    sessionStore.clear();
  },
};

export class ApiError extends Error {
  retryAfterSeconds?: number;
  remainingAttempts?: number;
  sendsRemaining?: number;

  constructor(
    public code: string,
    message: string,
    public status: number,
    extras?: { retryAfterSeconds?: number; remainingAttempts?: number; sendsRemaining?: number },
  ) {
    super(message);
    this.retryAfterSeconds = extras?.retryAfterSeconds;
    this.remainingAttempts = extras?.remainingAttempts;
    this.sendsRemaining = extras?.sendsRemaining;
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryAfterSeconds?: number;
    remainingAttempts?: number;
    sendsRemaining?: number;
  };
}

function asOptionalInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

const client = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
  timeout: 60_000,
});

const refreshClient = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
});

let refreshInFlight: Promise<boolean> | null = null;

function unwrap<T>(payload: Envelope<T> | T | undefined, status: number): T {
  if (typeof Blob !== "undefined" && payload instanceof Blob) {
    return payload as T;
  }
  const json = payload as Envelope<T> | undefined;
  if (json && typeof json === "object" && "success" in json) {
    if (json.success === false) {
      throw new ApiError(json.error?.code ?? "REQUEST_FAILED", json.error?.message ?? `Request failed (${status})`, status);
    }
    return ("data" in json ? json.data : json) as T;
  }
  return payload as T;
}

function emitSessionExpired() {
  window.dispatchEvent(new CustomEvent("aci:session-expired"));
}

function emitSessionUpdated() {
  window.dispatchEvent(new CustomEvent("aci:session-updated"));
}

function shouldSkipLoader(config?: InternalAxiosRequestConfig) {
  const raw = config?.headers as { get?: (name: string) => string | undefined } | Record<string, unknown> | undefined;
  if (!raw) return false;
  if (typeof raw.get === "function") return raw.get("X-Skip-Loader") === "1";
  return String((raw as Record<string, unknown>)["X-Skip-Loader"] ?? "") === "1";
}

async function attachDeviceHeaders(config: InternalAxiosRequestConfig) {
  config.headers = config.headers ?? {};
  const deviceHeaders = await DeviceFingerprint.headers();
  for (const [key, value] of Object.entries(deviceHeaders)) {
    config.headers[key] = value;
  }
  config.withCredentials = true;
  return config;
}

client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (!shouldSkipLoader(config)) beginQuery();
  try {
    await attachDeviceHeaders(config);
    const access = sessionStore.getAccess();
    if (access) {
      config.headers.Authorization = `Bearer ${access}`;
    }
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }
    return config;
  } catch (err) {
    if (!shouldSkipLoader(config)) endQuery();
    throw err;
  }
});

refreshClient.interceptors.request.use(async (config) => {
  beginQuery();
  return attachDeviceHeaders(config);
});

refreshClient.interceptors.response.use(
  (response) => {
    endQuery();
    response.data = unwrap(response.data, response.status);
    return response;
  },
  (error) => {
    endQuery();
    return Promise.reject(error);
  },
);

client.interceptors.response.use(
  (response) => {
    if (!shouldSkipLoader(response.config)) endQuery();
    response.data = unwrap(response.data, response.status);
    return response;
  },
  async (error: AxiosError<Envelope<unknown>>) => {
    if (!shouldSkipLoader(error.config as InternalAxiosRequestConfig | undefined)) endQuery();
    const status = error.response?.status ?? 0;
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const body = error.response?.data;
    const url = original?.url ?? "";
    const isAuthRefresh = url.includes("/auth/refresh");
    const isAuthLogout = url.includes("/auth/logout");
    const isAuthOtp = url.includes("/auth/send-otp") || url.includes("/auth/verify-otp");

    if (status === 401 && original && !original._retry && !isAuthRefresh && !isAuthLogout && !isAuthOtp) {
      original._retry = true;
      const ok = await queueRefresh();
      if (ok) {
        const access = sessionStore.getAccess();
        original.headers = original.headers ?? {};
        if (access) original.headers.Authorization = `Bearer ${access}`;
        return client(original);
      }
      emitSessionExpired();
    }

    throw new ApiError(
      body?.error?.code ?? (status === 401 ? "SESSION_EXPIRED" : "REQUEST_FAILED"),
      body?.error?.message ?? error.message ?? `Request failed (${status})`,
      status,
      {
        retryAfterSeconds: asOptionalInt(body?.error?.retryAfterSeconds),
        remainingAttempts: asOptionalInt(body?.error?.remainingAttempts),
        sendsRemaining: asOptionalInt(body?.error?.sendsRemaining),
      },
    );
  },
);

async function queueRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshTokens().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function refreshTokens(): Promise<boolean> {
  try {
    const res = await refreshClient.post<{
      accessToken: string;
      expiresIn?: number;
      user?: Parameters<typeof mapAuthUser>[0];
    }>("/auth/refresh", {});
    const data = res.data as {
      accessToken?: string;
      expiresIn?: number;
      user?: Parameters<typeof mapAuthUser>[0];
    };
    if (!data?.accessToken) return false;
    const user = data.user ? mapAuthUser(data.user) : sessionStore.getUser() ?? undefined;
    sessionStore.set(data.accessToken, user, data.expiresIn);
    emitSessionUpdated();
    return true;
  } catch {
    return false;
  }
}

type RequestOpts = { silent?: boolean; timeoutMs?: number };

function optsHeaders(opts?: RequestOpts) {
  return opts?.silent ? { "X-Skip-Loader": "1" } : undefined;
}

function optsConfig(opts?: RequestOpts) {
  const config: { headers?: Record<string, string>; timeout?: number } = {};
  const headers = optsHeaders(opts);
  if (headers) config.headers = headers;
  if (opts?.timeoutMs) config.timeout = opts.timeoutMs;
  return config;
}

// React StrictMode runs each effect twice in development. Sharing one in-flight
// GET keeps that second run from sending another identical request.
const inflightGets = new Map<string, Promise<unknown>>();

function getOnce<T>(path: string, opts?: RequestOpts): Promise<T> {
  const key = `${opts?.silent ? "1" : "0"}:${path}`;
  const existing = inflightGets.get(key);
  if (existing) return existing as Promise<T>;
  const promise = client
    .get<T>(path, optsConfig(opts))
    .then((response) => response.data as T)
    .finally(() => {
      if (inflightGets.get(key) === promise) inflightGets.delete(key);
    });
  inflightGets.set(key, promise);
  return promise;
}

export const http = {
  get: async <T>(path: string, opts?: RequestOpts) => getOnce<T>(path, opts),
  post: async <T>(path: string, body?: unknown, opts?: RequestOpts) =>
    (await client.post<T>(path, body, optsConfig(opts))).data,
  patch: async <T>(path: string, body?: unknown, opts?: RequestOpts) =>
    (await client.patch<T>(path, body, optsConfig(opts))).data,
  put: async <T>(path: string, body?: unknown, opts?: RequestOpts) =>
    (await client.put<T>(path, body, optsConfig(opts))).data,
  delete: async <T>(path: string, opts?: RequestOpts) =>
    (await client.delete<T>(path, optsConfig(opts))).data,
  upload: async <T>(path: string, form: FormData, opts?: RequestOpts) =>
    (await client.post<T>(path, form, optsConfig(opts))).data,
  file: async (path: string) =>
    (await client.get<Blob>(path, { responseType: "blob", headers: optsHeaders({ silent: true }) })).data,
};
