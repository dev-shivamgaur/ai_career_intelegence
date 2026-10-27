import { ApiError, isAbortError } from "@/services/http";
import { useCallback, useEffect, useRef, useState } from "react";

export function useAsyncData<T>(loader: (signal?: AbortSignal) => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  const abortRef = useRef<AbortController | null>(null);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const result = await loaderRef.current(controller.signal);
      if (controller.signal.aborted) return;
      setData(result);
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorCode(err.code);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setErrorCode(null);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-supplied refetch keys
  }, [reload, ...deps]);

  return { data, loading, error, errorCode, reload, setData };
}
