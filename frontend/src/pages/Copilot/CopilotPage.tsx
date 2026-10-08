import { AIMessage, ChatInput, TypingIndicator } from "@/components/copilot/Chat";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { useProfile } from "@/context/ProfileContext";
import { copilotSuggestionChips, copilotWelcome } from "@/lib/copilotSuggestions";
import * as appApi from "@/services/api/appApi";
import type { ChatMessage } from "@/types";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

export function CopilotPage() {
  const location = useLocation();
  const profile = useProfile();
  const chips = useMemo(() => copilotSuggestionChips(profile.data), [profile.data]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const context = {
    careerTitle: profile.data?.targetExamName ?? profile.data?.careerGoal?.title ?? "your goal",
    profileComplete: profile.data?.completionPercent ?? 0,
    topGap: profile.data?.skills.find((s) => s.status === "missing" || s.status === "needs_improvement")?.name
      ?? profile.data?.skills[0]?.name
      ?? "not set yet",
    availableHours: profile.data?.availableHoursPerDay ?? 2,
  };

  useEffect(() => {
    if (!profile.data) return;
    setMessages((current) => {
      if (current.length > 1) return current;
      const welcome = copilotWelcome(profile.data);
      if (current.length === 1 && current[0].id === "welcome" && current[0].content === welcome) {
        return current;
      }
      return [
        {
          id: "welcome",
          role: "assistant",
          content: welcome,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  }, [profile.data]);

  useEffect(() => {
    const q = (location.state as { q?: string } | null)?.q;
    if (q) setInput(q);
  }, [location.state]);

  async function send(text = input) {
    if (!text.trim() || sending) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    const pendingId = `a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      {
        id: pendingId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      },
    ]);
    setSending(true);
    setStatus("Thinking…");
    try {
      const result = await appApi.streamCopilotMessage(text, sessionId, (event) => {
        if (event.type === "status") setStatus(event.text);
        if (event.type === "token") {
          setStatus("");
          setMessages((m) =>
            m.map((row) => (row.id === pendingId ? { ...row, content: row.content + event.text } : row)),
          );
        }
        if (event.type === "error") {
          setMessages((m) =>
            m.map((row) => (row.id === pendingId ? { ...row, content: event.text } : row)),
          );
        }
        if (event.type === "done") {
          setSessionId(event.sessionId);
          setMessages((m) =>
            m.map((row) =>
              row.id === pendingId
                ? { ...row, id: event.messageId || pendingId, content: event.reply || row.content }
                : row,
            ),
          );
        }
      });
      if (result.sessionId) setSessionId(result.sessionId);
    } catch (err) {
      setMessages((m) =>
        m.map((row) =>
          row.id === pendingId
            ? { ...row, content: err instanceof Error ? err.message : "Could not get a reply. Try again." }
            : row,
        ),
      );
    } finally {
      setSending(false);
      setStatus("");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="flex min-h-[70vh] flex-col">
        <h1 className="text-2xl font-semibold">AI Career Copilot</h1>
        <p className="text-sm text-slate-500">Answers use your stored profile and documents.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((c) => (
            <Button key={c} size="sm" variant="outline" onClick={() => void send(c)}>
              {c}
            </Button>
          ))}
        </div>
        <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          {messages.map((m) => (
            <AIMessage
              key={m.id}
              role={m.role}
              content={m.content}
              streaming={sending && m.role === "assistant" && m.id.startsWith("a-") && Boolean(m.content)}
            />
          ))}
          {sending && !messages.some((m) => m.role === "assistant" && m.id.startsWith("a-") && m.content) && (
            <TypingIndicator />
          )}
          {status && sending && (
            <p className="text-xs text-slate-500">{status}</p>
          )}
        </div>
        <div className="mt-3">
          <ChatInput value={input} onChange={setInput} onSend={() => void send()} disabled={sending} />
        </div>
      </div>
      <Card className="h-fit">
        <CardHeader title="Context" />
        <CardBody className="space-y-3 text-sm">
          {profile.loading ? (
            <ListRowSkeleton count={4} />
          ) : (
            <>
              <p>
                {profile.data?.careerTrack === "government_exam" ? "Current exam" : "Current role"}: {context.careerTitle}
              </p>
              <p>Profile: {context.profileComplete}% complete</p>
              <p>Top gap: {context.topGap}</p>
              <p>Available time: {context.availableHours} hours/day</p>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
