import { OtpAuthForm } from "@/components/auth/OtpAuthForm";
import { Link } from "react-router-dom";

export function LoginPage() {
  return (
    <AuthShell title="Log in with mobile" subtitle="We will send a one-time code to your phone. No password is stored.">
      <OtpAuthForm mode="login" />
      <p className="mt-6 text-center text-sm text-slate-500">
        New here?{" "}
        <Link className="font-medium text-brand-700 dark:text-brand-200" to="/signup">
          Create account
        </Link>
      </p>
    </AuthShell>
  );
}

export function SignupPage() {
  return (
    <AuthShell title="Create your profile" subtitle="Sign up with your mobile number. No passwords are stored.">
      <OtpAuthForm mode="signup" />
      <p className="mt-6 text-center text-sm text-slate-500">
        Already registered?{" "}
        <Link className="font-medium text-brand-700 dark:text-brand-200" to="/login">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-3 py-8 text-ink sm:px-4 dark:bg-surface-dark dark:text-stone-100">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-card sm:p-8 dark:border-stone-800 dark:bg-[#1a211d]">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
          ← Back
        </Link>
        <h1 className="mt-4 text-xl font-semibold sm:text-2xl">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
