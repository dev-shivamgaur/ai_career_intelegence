import { PhoneField } from "@/components/auth/PhoneField";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { SendOtpResult } from "@/services/api/authApi";
import { useAuth, useToast } from "@/store/hooks";
import type { OtpRequestError } from "@/store/slices/authSlice";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

function formatMmSs(total: number) {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function readOtpError(err: unknown): OtpRequestError {
  if (err && typeof err === "object" && "message" in err) {
    const o = err as Partial<OtpRequestError>;
    return {
      code: o.code ?? "REQUEST_FAILED",
      message: String(o.message),
      status: o.status ?? 0,
      retryAfterSeconds: o.retryAfterSeconds,
      remainingAttempts: o.remainingAttempts,
      sendsRemaining: o.sendsRemaining,
    };
  }
  return { code: "REQUEST_FAILED", message: "Request failed", status: 0 };
}

function shortError(e: OtpRequestError, cooldown: number, windowWait: number) {
  if (e.code === "OTP_COOLDOWN") return formatMmSs(e.retryAfterSeconds ?? cooldown);
  if (e.code === "OTP_RATE_LIMIT") return `Try again in ${formatMmSs(e.retryAfterSeconds ?? windowWait)}`;
  if (e.code === "OTP_INVALID") return "Wrong code";
  if (e.code === "OTP_LOCKED" || e.code === "OTP_EXPIRED") return "Code expired";
  return "Something went wrong";
}

export function OtpAuthForm({ mode, next }: { mode: "login" | "signup"; next?: "admin" }) {
  const { requestOtp, verify } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const [windowWait, setWindowWait] = useState(0);
  const [sendsRemaining, setSendsRemaining] = useState(3);

  useEffect(() => {
    if (cooldown <= 0 && expiresIn <= 0 && windowWait <= 0) return;
    const id = window.setTimeout(() => {
      setCooldown((v) => Math.max(0, v - 1));
      setExpiresIn((v) => Math.max(0, v - 1));
      setWindowWait((v) => Math.max(0, v - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [cooldown, expiresIn, windowWait]);

  function applySend(result: SendOtpResult) {
    setOtpSent(true);
    setCode("");
    setError("");
    setCooldown(result.resendAfterSeconds);
    setExpiresIn(result.expiresInSeconds);
    setSendsRemaining(result.sendsRemaining);
    setWindowWait(result.sendsRemaining === 0 ? result.sendWindowRemainingSeconds : 0);
  }

  function applySendError(err: unknown, asResend: boolean) {
    const e = readOtpError(err);
    if (e.retryAfterSeconds) {
      if (e.code === "OTP_RATE_LIMIT") {
        setWindowWait(e.retryAfterSeconds);
        if (e.sendsRemaining != null) setSendsRemaining(e.sendsRemaining);
      }
      if (e.code === "OTP_COOLDOWN") {
        setCooldown(e.retryAfterSeconds);
        if (!asResend) setOtpSent(true);
      }
    }
    if (e.code === "OTP_RATE_LIMIT" || e.code === "OTP_LOCKED" || e.code === "OTP_EXPIRED" || e.code === "OTP_INVALID") {
      setError(shortError(e, cooldown, windowWait));
    } else if (e.code === "OTP_COOLDOWN") {
      setError("");
    } else {
      setError(shortError(e, cooldown, windowWait));
    }
  }

  async function onSendOtp(e: FormEvent) {
    e.preventDefault();
    if (mode === "signup" && name.trim().length < 2) {
      setError("Enter your name.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 8) {
      setError("Enter a valid number.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      applySend(await requestOtp(phone));
      push("OTP sent");
    } catch (err) {
      applySendError(err, false);
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    if (cooldown > 0 || windowWait > 0 || resending || loading) return;
    setResending(true);
    setError("");
    try {
      applySend(await requestOtp(phone));
    } catch (err) {
      applySendError(err, true);
    } finally {
      setResending(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (code.length < 4) {
      setError("Enter the OTP.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const user = await verify(phone, code, mode === "signup" ? name : undefined);
      if (next === "admin") {
        if (user.role !== "admin") {
          setError("This phone is not an admin account");
          return;
        }
        push("Signed in");
        navigate("/admin");
        return;
      }
      if (mode === "signup") {
        push("Account created");
        navigate("/onboarding");
      } else {
        push("Signed in");
        navigate(user.onboardingComplete ? "/dashboard" : "/onboarding");
      }
    } catch (err) {
      const e = readOtpError(err);
      setError(shortError(e, cooldown, windowWait));
      if (e.code === "OTP_LOCKED" || e.code === "OTP_EXPIRED") setExpiresIn(0);
    } finally {
      setLoading(false);
    }
  }

  const blocked = windowWait > 0;
  const otpDead = otpSent && expiresIn <= 0;

  return (
    <form className="space-y-4" onSubmit={otpSent ? onVerify : onSendOtp}>
      {mode === "signup" && (
        <Input
          label="Full name"
          name="name"
          required
          disabled={otpSent}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <PhoneField disabled={otpSent} onChangeE164={setPhone} />

      {otpSent && (
        <div>
          <Input
            label="OTP"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            disabled={otpDead}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="tracking-[0.3em]"
          />
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span className="tabular-nums">{otpDead ? "Expired" : formatMmSs(expiresIn)}</span>
            <div className="flex items-center gap-3">
              {blocked ? (
                <span>Try again in {formatMmSs(windowWait)}</span>
              ) : cooldown <= 0 && !resending ? (
                <button
                  type="button"
                  className="font-medium text-brand-700 hover:underline"
                  onClick={() => void onResend()}
                >
                  Resend
                </button>
              ) : null}
              <button
                type="button"
                className="hover:text-slate-800 dark:hover:text-slate-200"
                onClick={() => {
                  setOtpSent(false);
                  setCode("");
                  setError("");
                }}
              >
                Change
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading || (otpSent && otpDead)}>
        {loading ? "Please wait…" : otpSent ? (mode === "signup" ? "Verify and continue" : "Verify OTP") : "Send OTP"}
      </Button>
    </form>
  );
}
