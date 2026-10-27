import { useProfile } from "@/context/ProfileContext";
import { copilotSuggestionChips, copilotWelcome } from "@/lib/copilotSuggestions";
import * as appApi from "@/services/api/appApi";
import type { ChatMessage } from "@/types";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useCopilotChat() {
  const profile = useProfile();
  const chips = useMemo(() => copilotSuggestionChips(profile.data), [profile.data]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const context = useMemo(() => {
    const data = profile.data;
    return {
      careerTitle: data?.targetExamName ?? data?.careerGoal?.title ?? "your goal",
      profileComplete: data?.completionPercent ?? 0,
      isGov: data?.careerTrack === "government_exam",
      topGap:
        data?.skills.find((s) => s.status === "missing" || s.status === "needs_improvement")?.name ??
        data?.skills[0]?.name ??
        "not set yet",
      availableHours: data?.availableHoursPerDay ?? 2,
    };
  }, [profile.data]);

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

  const send = useCallback(
    async (text = input) => {
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
    },
    [input, sending, sessionId],
  );

  const prefills = useCallback((q: string) => {
    setInput(q);
  }, []);

  const showChips = messages.length <= 1;

  return {
    profile,
    chips,
    context,
    input,
    setInput,
    sending,
    status,
    messages,
    showChips,
    send,
    prefills,
  };
}
