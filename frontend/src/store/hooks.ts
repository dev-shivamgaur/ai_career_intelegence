import { useCallback } from "react";
import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";
import type { AppDispatch, RootState } from "./index";
import { logoutUser, sendOtp, verifyOtp } from "./slices/authSlice";
import { toggleTheme } from "./slices/themeSlice";
import { addToast, removeToast } from "./slices/toastSlice";
import type { User } from "@/types";
import type { SendOtpResult } from "@/services/api/authApi";

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export function useAuth() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const ready = useAppSelector((s) => s.auth.ready);

  const requestOtp = useCallback(
    async (phone: string) => {
      return dispatch(sendOtp(phone)).unwrap() as Promise<SendOtpResult>;
    },
    [dispatch],
  );

  const verify = useCallback(
    async (phone: string, code: string, name?: string) => {
      const result = await dispatch(verifyOtp({ phone, code, name })).unwrap();
      return result as User;
    },
    [dispatch],
  );

  const logout = useCallback(async () => {
    await dispatch(logoutUser()).unwrap();
  }, [dispatch]);

  return { user, ready, isAdmin: user?.role === "admin", requestOtp, verify, logout };
}

export function useTheme() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.theme.theme);
  const toggle = useCallback(() => {
    dispatch(toggleTheme());
  }, [dispatch]);
  return { theme, toggle };
}

export function useToast() {
  const dispatch = useAppDispatch();
  const push = useCallback(
    (message: string) => {
      const id = crypto.randomUUID();
      dispatch(addToast({ id, message }));
      window.setTimeout(() => dispatch(removeToast(id)), 2800);
    },
    [dispatch],
  );
  return { push };
}
