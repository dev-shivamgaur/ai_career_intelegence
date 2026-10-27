export function AIMessage({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-brand-600 text-white"
            : "border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
        }`}
      >
        <p className="whitespace-pre-wrap">
          {content}
          {streaming && (
            <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-px bg-slate-800 typing-caret align-text-bottom dark:bg-slate-100" />
          )}
        </p>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex justify-start" aria-live="polite" aria-label="Assistant is typing">
      <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-500" />
        <span className="typing-dot typing-dot-delay-1 h-1.5 w-1.5 rounded-full bg-slate-500" />
        <span className="typing-dot typing-dot-delay-2 h-1.5 w-1.5 rounded-full bg-slate-500" />
        <span className="ml-2 inline-block h-4 w-[2px] translate-y-px bg-slate-700 typing-caret dark:bg-slate-200" />
      </div>
    </div>
  );
}

export function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
}) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onSend();
      }}
    >
      <label className="sr-only" htmlFor="copilot-input">
        Message
      </label>
      <input
        id="copilot-input"
        className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ask your career copilot"
      />
      <button
        type="submit"
        disabled={disabled}
        className="h-10 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
}
