import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import * as authApi from "@/services/api/authApi";
import { ApiError } from "@/services/http";
import { sessionStore } from "@/lib/session";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  expiresAt: number | null;
  ready: boolean;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  expiresAt: null,
  ready: false,
};

function syncFromMemory(state: AuthState, user?: User | null) {
  const snap = sessionStore.load();
  state.user = user === undefined ? snap.user : user;
  state.accessToken = snap.accessToken;
  state.expiresAt = snap.expiresAt;
}

export const restoreSession = createAsyncThunk("auth/restoreSession", async () => {
  return authApi.getSessionUser();
});

export type OtpRequestError = {
  code: string;
  message: string;
  status: number;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
  sendsRemaining?: number;
};

function toOtpRequestError(err: unknown): OtpRequestError {
  if (err instanceof ApiError) {
    return {
      code: err.code,
      message: err.message,
      status: err.status,
      retryAfterSeconds: err.retryAfterSeconds,
      remainingAttempts: err.remainingAttempts,
      sendsRemaining: err.sendsRemaining,
    };
  }
  return {
    code: "REQUEST_FAILED",
    message: err instanceof Error ? err.message : "Request failed",
    status: 0,
  };
}

export const sendOtp = createAsyncThunk("auth/sendOtp", async (phone: string, { rejectWithValue }) => {
  try {
    return await authApi.sendOtp(phone);
  } catch (err) {
    return rejectWithValue(toOtpRequestError(err));
  }
});

export const verifyOtp = createAsyncThunk(
  "auth/verifyOtp",
  async (payload: { phone: string; code: string; name?: string }, { rejectWithValue }) => {
    try {
      return await authApi.verifyOtp(payload.phone, payload.code, payload.name);
    } catch (err) {
      return rejectWithValue(toOtpRequestError(err));
    }
  },
);

export const logoutUser = createAsyncThunk("auth/logout", async () => {
  await authApi.logout();
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<User | null>) {
      state.user = action.payload;
      if (action.payload) sessionStore.setUser(action.payload);
    },
    hydrateFromMemory(state) {
      syncFromMemory(state);
    },
    expireSession(state) {
      state.user = null;
      state.accessToken = null;
      state.expiresAt = null;
      sessionStore.clear();
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.fulfilled, (state, action) => {
        syncFromMemory(state, action.payload);
        state.ready = true;
      })
      .addCase(restoreSession.rejected, (state) => {
        state.user = null;
        state.accessToken = null;
        state.expiresAt = null;
        state.ready = true;
        sessionStore.clear();
      })
      .addCase(verifyOtp.fulfilled, (state, action) => {
        syncFromMemory(state, action.payload);
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.expiresAt = null;
      })
      .addCase(logoutUser.rejected, (state) => {
        state.user = null;
        state.accessToken = null;
        state.expiresAt = null;
        sessionStore.clear();
      });
  },
});

export const { setUser, expireSession, hydrateFromMemory } = authSlice.actions;
export default authSlice.reducer;
