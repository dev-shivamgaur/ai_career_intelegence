import { OtpAuthForm } from "@/components/auth/OtpAuthForm";
import { useAuth } from "@/store/hooks";
import { Link, Navigate } from "react-router-dom";

export function AdminLoginPage() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="p-8 text-sm text-slate-500">Restoring session…</div>;
  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  if (user) return <Navigate to={user.onboardingComplete ? "/dashboard" : "/onboarding"} replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 text-ink dark:bg-surface-dark dark:text-stone-100">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-[#1a211d]">
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Admin</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Same phone code as the app. Only an admin account can open this console.</p>
        <div className="mt-6">
          <OtpAuthForm mode="login" next="admin" />
        </div>
        <p className="mt-6 text-center text-sm text-stone-500">
          <Link to="/" className="text-brand-700 hover:text-brand-800 dark:text-brand-200">
            Learner site
          </Link>
        </p>
      </div>
    </div>
  );
}
