import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "./hooks";
import { expireSession, hydrateFromMemory, restoreSession } from "./slices/authSlice";

export function StoreEffects() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.theme.theme);

  useEffect(() => {
    void dispatch(restoreSession());
  }, [dispatch]);

  useEffect(() => {
    const onExpired = () => {
      dispatch(expireSession());
    };
    const onUpdated = () => {
      dispatch(hydrateFromMemory());
    };
    window.addEventListener("aci:session-expired", onExpired);
    window.addEventListener("aci:session-updated", onUpdated);
    return () => {
      window.removeEventListener("aci:session-expired", onExpired);
      window.removeEventListener("aci:session-updated", onUpdated);
    };
  }, [dispatch]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("aci-theme", theme);
  }, [theme]);

  return null;
}
