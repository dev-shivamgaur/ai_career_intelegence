import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

const STORAGE_KEY = "careerforge:copilot-size";
export const COPILOT_DEFAULT_WIDTH = 380;
export const COPILOT_DEFAULT_HEIGHT = 560;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 360;

type Size = { width: number; height: number };
type Edge = "left" | "top" | "top-left";

function maxWidth() {
  return Math.max(MIN_WIDTH, window.innerWidth - 24);
}

function maxHeight() {
  // Leave room for FAB + margins
  return Math.max(MIN_HEIGHT, window.innerHeight - 112);
}

function clamp(size: Size): Size {
  return {
    width: Math.min(maxWidth(), Math.max(MIN_WIDTH, Math.round(size.width))),
    height: Math.min(maxHeight(), Math.max(MIN_HEIGHT, Math.round(size.height))),
  };
}

function readStored(): Size | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Size>;
    if (typeof parsed.width !== "number" || typeof parsed.height !== "number") return null;
    return clamp({ width: parsed.width, height: parsed.height });
  } catch {
    return null;
  }
}

function writeStored(size: Size) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(size));
  } catch {
    /* ignore quota */
  }
}

export function useCopilotResize() {
  const [size, setSize] = useState<Size>(() => {
    return (
      readStored() ?? {
        width: COPILOT_DEFAULT_WIDTH,
        height: Math.min(COPILOT_DEFAULT_HEIGHT, typeof window !== "undefined" ? maxHeight() : COPILOT_DEFAULT_HEIGHT),
      }
    );
  });
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    function onResize() {
      setSize((s) => clamp(s));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    writeStored(size);
  }, [size]);

  const startResize = useCallback(
    (edge: Edge) => (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = size.width;
      const startH = size.height;
      const pointerId = e.pointerId;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture?.(pointerId);
      setResizing(true);
      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor =
        edge === "left" ? "ew-resize" : edge === "top" ? "ns-resize" : "nwse-resize";
      document.body.style.userSelect = "none";

      function onMove(ev: PointerEvent) {
        const dx = startX - ev.clientX; // drag left → wider (right-anchored)
        const dy = startY - ev.clientY; // drag up → taller (bottom-anchored)
        const next: Size = { width: startW, height: startH };
        if (edge === "left" || edge === "top-left") next.width = startW + dx;
        if (edge === "top" || edge === "top-left") next.height = startH + dy;
        setSize(clamp(next));
      }

      function onUp() {
        setResizing(false);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
        target.releasePointerCapture?.(pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [size.width, size.height],
  );

  return { size, resizing, startResize };
}
