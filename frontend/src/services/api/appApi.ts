import type { ChatMessage, CopilotContext, NotificationItem, ProgressSnapshot, SearchResult } from "@/types";
import { http } from "../http";
import { mapEnum } from "../mappers";

export async function getNotifications(): Promise<NotificationItem[]> {
  const rows = await http.get<Array<Record<string, unknown>>>("/notifications");
  return rows.map((n) => ({
    id: String(n.id),
    type: mapEnum(String(n.type), "profile"),
    title: String(n.title),
    body: String(n.body ?? ""),
    createdAt: String(n.createdAt),
    read: Boolean(n.read),
  }));
}

export async function markRead(id: string): Promise<NotificationItem[]> {
  await http.patch(`/notifications/${id}/read`);
  return getNotifications();
}

export async function markAllRead(): Promise<NotificationItem[]> {
  const rows = await http.patch<Array<Record<string, unknown>>>("/notifications/read-all");
  return rows.map((n) => ({
    id: String(n.id),
    type: mapEnum(String(n.type), "profile"),
    title: String(n.title),
    body: String(n.body ?? ""),
    createdAt: String(n.createdAt),
    read: Boolean(n.read),
  }));
}

export async function getProgress(): Promise<ProgressSnapshot> {
  const raw = await http.get<{ snapshot: Record<string, unknown> }>("/progress");
  const s = raw.snapshot ?? (raw as unknown as Record<string, unknown>);
  return {
    skillsCompleted: Number(s.skillsCompleted ?? 0),
    skillsTotal: Number(s.skillsTotal ?? 0),
    roadmapPercent: Number(s.roadmapPercent ?? 0),
    learningHours: Number(s.learningHours ?? 0),
    projectsCompleted: Number(s.projectsCompleted ?? 0),
    applications: Number(s.applications ?? 0),
    interviewPrepPercent: Number(s.interviewPrepPercent ?? 0),
    skillProgressOverTime: (s.skillProgressOverTime as ProgressSnapshot["skillProgressOverTime"]) ?? [],
    applicationsOverTime: (s.applicationsOverTime as ProgressSnapshot["applicationsOverTime"]) ?? [],
    roadmapCompletionOverTime:
      (s.roadmapCompletionOverTime as ProgressSnapshot["roadmapCompletionOverTime"]) ?? [],
  };
}

export async function sendCopilotMessage(content: string, _context: CopilotContext): Promise<ChatMessage> {
  const raw = await http.post<{ sessionId: string; reply: string; message: Record<string, unknown> }>(
    "/copilot/chat",
    { message: content },
    { silent: true },
  );
  return {
    id: String(raw.message?.id ?? crypto.randomUUID()),
    role: "assistant",
    content: String(raw.reply ?? raw.message?.content ?? ""),
    createdAt: String(raw.message?.createdAt ?? new Date().toISOString()),
  };
}

export type CopilotStreamEvent =
  | { type: "status"; text: string }
  | { type: "token"; text: string }
  | { type: "error"; text: string }
  | { type: "done"; sessionId: string; messageId: string; reply: string };

export async function streamCopilotMessage(
  content: string,
  sessionId: string | undefined,
  onEvent: (event: CopilotStreamEvent) => void,
): Promise<{ sessionId?: string; messageId?: string; reply: string }> {
  const { DeviceFingerprint } = await import("@/lib/fingerprint");
  const { sessionStore } = await import("@/lib/session");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    ...(await DeviceFingerprint.headers()),
  };
  const access = sessionStore.getAccess();
  if (access) headers.Authorization = `Bearer ${access}`;

  const response = await fetch("/api/v1/copilot/chat/stream", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ message: content, sessionId }),
  });

  if (!response.ok || !response.body) {
    const raw = await response.text();
    let msg = raw || `Stream failed (${response.status})`;
    try {
      const parsed = JSON.parse(raw) as { message?: string | string[]; error?: string };
      const m = parsed.message;
      msg = (Array.isArray(m) ? m.join(" ") : m) || parsed.error || msg;
    } catch {
      /* keep raw */
    }
    throw new Error(msg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let doneMeta: { sessionId?: string; messageId?: string } = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!line || line === "[DONE]") continue;
      const event = JSON.parse(line) as CopilotStreamEvent;
      if (event.type === "token") reply += event.text;
      if (event.type === "done") {
        doneMeta = { sessionId: event.sessionId, messageId: event.messageId };
        reply = event.reply || reply;
      }
      onEvent(event);
    }
  }

  return { ...doneMeta, reply };
}

export async function searchCatalog(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const [jobs, gaps, roadmap] = await Promise.all([
    http.get<Array<Record<string, unknown>>>("/jobs").catch(() => []),
    http.get<Array<Record<string, unknown>>>("/skill-gaps").catch(() => []),
    http.get<Record<string, unknown>>("/roadmap").catch(() => ({ tasks: [] })),
  ]);
  const results: SearchResult[] = [];
  for (const job of jobs) {
    const title = `${job.role} at ${job.company}`;
    if (title.toLowerCase().includes(q)) {
      results.push({ id: String(job.id), category: "job", title, subtitle: "Job match", href: "/jobs" });
    }
  }
  for (const gap of gaps) {
    const title = String(gap.skill ?? "");
    if (title.toLowerCase().includes(q)) {
      results.push({ id: title, category: "skill", title, subtitle: "Skill gap", href: "/skill-gap" });
    }
  }
  for (const task of (roadmap.tasks as Array<Record<string, unknown>>) ?? []) {
    const title = String(task.title ?? "");
    if (title.toLowerCase().includes(q)) {
      results.push({ id: String(task.id), category: "task", title, subtitle: "Roadmap", href: "/roadmap" });
    }
  }
  return results.slice(0, 8);
}
