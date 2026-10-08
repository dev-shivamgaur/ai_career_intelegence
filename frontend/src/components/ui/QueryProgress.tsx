import { subscribeQueries } from "@/lib/queryProgress";
import { useEffect, useState } from "react";

export function QueryProgress() {
  const [pending, setPending] = useState(0);

  useEffect(() => subscribeQueries(setPending), []);

  if (pending <= 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden bg-transparent">
      <div className="query-bar-fill h-full w-1/3 rounded-full bg-brand-600" />
    </div>
  );
}
