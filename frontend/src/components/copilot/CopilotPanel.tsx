import { AIMessage, ChatInput, TypingIndicator } from "@/components/copilot/Chat";
import type { useCopilotChat } from "@/components/copilot/useCopilotChat";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

type ChatApi = ReturnType<typeof useCopilotChat>;
type ResizeEdge = "left" | "top" | "top-left";

type Props = {
  chat: ChatApi;
  onClose: () => void;
  pendingQuery?: string | null;
  onPendingConsumed?: () => void;
  active: boolean;
  onResizeStart: (edge: ResizeEdge) => (e: ReactPointerEvent) => void;
  resizing?: boolean;
};

export function CopilotPanel({
  chat,
  onClose,
  pendingQuery,
  onPendingConsumed,
  active,
  onResizeStart,
  resizing,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const prefills = chat.prefills;

  useEffect(() => {
    if (!pendingQuery) return;
    prefills(pendingQuery);
    onPendingConsumed?.();
  }, [pendingQuery, prefills, onPendingConsumed]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.status, chat.sending]);

  useEffect(() => {
    if (!active) return;
    const input = document.getElementById("copilot-input");
    input?.focus();
  }, [active]);

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950 ${
        resizing ? "select-none" : ""
      }`}
      role="dialog"
      aria-label="AI Career Copilot"
      aria-hidden={!active}
    >
      {/* Resize: left (width) */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize width"
        title="Drag to resize width"
        onPointerDown={onResizeStart("left")}
        className="absolute inset-y-3 left-0 z-20 w-1.5 cursor-ew-resize rounded-full bg-transparent hover:bg-brand-500/40 active:bg-brand-500/60"
      />
      {/* Resize: top (height) */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize height"
        title="Drag to resize height"
        onPointerDown={onResizeStart("top")}
        className="absolute inset-x-3 top-0 z-20 h-1.5 cursor-ns-resize rounded-full bg-transparent hover:bg-brand-500/40 active:bg-brand-500/60"
      />
      {/* Resize: top-left corner */}
      <div
        role="separator"
        aria-label="Resize width and height"
        title="Drag to resize"
        onPointerDown={onResizeStart("top-left")}
        className="absolute left-0 top-0 z-30 h-4 w-4 cursor-nwse-resize"
      >
        <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-sm border-l-2 border-t-2 border-slate-400 dark:border-slate-500" />
      </div>

      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">AI Career Copilot</h2>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {chat.context.isGov ? "Exam" : "Role"}: {chat.context.careerTitle}
            {" · "}
            Profile {chat.context.profileComplete}%
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          aria-label="Close copilot"
          tabIndex={active ? 0 : -1}
        >
          <X size={18} />
        </button>
      </header>

      {chat.showChips && chat.chips.length > 0 && (
        <div className="shrink-0 space-y-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Suggestions</p>
          <div className="flex flex-wrap gap-1.5">
            {chat.chips.slice(0, 4).map((c) => (
              <Button
                key={c}
                size="sm"
                variant="outline"
                className="h-auto max-w-full whitespace-normal py-1.5 text-left text-xs"
                onClick={() => void chat.send(c)}
                tabIndex={active ? 0 : -1}
              >
                {c}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {chat.messages.map((m) => (
          <AIMessage
            key={m.id}
            role={m.role}
            content={m.content}
            streaming={chat.sending && m.role === "assistant" && m.id.startsWith("a-") && Boolean(m.content)}
          />
        ))}
        {chat.sending &&
          !chat.messages.some((m) => m.role === "assistant" && m.id.startsWith("a-") && m.content) && (
            <TypingIndicator />
          )}
        {chat.status && chat.sending && <p className="text-xs text-slate-500">{chat.status}</p>}
      </div>

      <div className="shrink-0 border-t border-slate-200 px-3 py-3 dark:border-slate-800">
        <ChatInput
          value={chat.input}
          onChange={chat.setInput}
          onSend={() => void chat.send()}
          disabled={chat.sending || !active}
        />
      </div>
    </div>
  );
}
