import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/store/hooks";

export function ProtectedRoute() {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Restoring session…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!user.onboardingComplete && !location.pathname.startsWith("/onboarding")) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

export function AdminRoute() {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Restoring session…
      </div>
    );
  }
  if (user?.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}

export function GuestRoute() {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-stone-500 dark:bg-surface-dark dark:text-stone-300">
        Restoring session…
      </div>
    );
  }
  if (user) {
    return <Navigate to={user.onboardingComplete ? "/dashboard" : "/onboarding"} replace />;
  }
  return <Outlet />;
}
