import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { COPILOT_OPEN_EVENT, type CopilotOpenDetail } from "@/components/copilot/copilotOpen";
import { useCopilotChat } from "@/components/copilot/useCopilotChat";
import { useCopilotResize } from "@/components/copilot/useCopilotResize";
import { MessageSquare, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export function CopilotWidget() {
  const chat = useCopilotChat();
  const { size, resizing, startResize } = useCopilotResize();
  const [open, setOpen] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const openWith = useCallback((q?: string) => {
    if (q) setPendingQuery(q);
    setOpen(true);
  }, []);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<CopilotOpenDetail>).detail;
      openWith(detail?.q);
    }
    window.addEventListener(COPILOT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COPILOT_OPEN_EVENT, onOpen);
  }, [openWith]);

  useEffect(() => {
    if (searchParams.get("copilot") !== "1") return;
    openWith();
    const next = new URLSearchParams(searchParams);
    next.delete("copilot");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, openWith]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      {open && !resizing && (
        <button
          type="button"
          className="pointer-events-auto fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px] lg:bg-transparent lg:backdrop-blur-none"
          aria-label="Dismiss copilot overlay"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className={`absolute bottom-[4.5rem] right-0 z-50 sm:bottom-20 ${
          open ? "pointer-events-auto visible opacity-100" : "pointer-events-none invisible opacity-0"
        } ${resizing ? "" : "transition-opacity duration-150"}`}
        style={{ width: size.width, height: size.height, maxWidth: "calc(100vw - 1.5rem)" }}
      >
        <CopilotPanel
          chat={chat}
          active={open}
          onClose={() => setOpen(false)}
          pendingQuery={pendingQuery}
          onPendingConsumed={() => setPendingQuery(null)}
          onResizeStart={startResize}
          resizing={resizing}
        />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto relative z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        aria-label={open ? "Close AI Copilot" : "Open AI Copilot"}
        aria-expanded={open}
      >
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </button>
    </div>
  );
}
