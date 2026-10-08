import { useAuth } from "@/store/hooks";
import { Navigate, Outlet } from "react-router-dom";

export function AdminGate() {
  const { user, ready } = useAuth();
  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">Restoring session…</div>;
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4 text-ink dark:bg-surface-dark dark:text-stone-100">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Admin access required</h1>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">This phone is a learner account. The learner app is separate from this console.</p>
          <a className="mt-4 inline-block text-sm font-medium text-brand-700 dark:text-brand-200" href="/dashboard">
            Open learner app
          </a>
        </div>
      </div>
    );
  }
  return <Outlet />;
}
