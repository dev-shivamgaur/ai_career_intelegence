import { StrictMode, Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import "./index.css";
import { store } from "./store";
import { StoreEffects } from "./store/StoreEffects";
import { ToastHost } from "./components/ui/Toast";
import { QueryProgress } from "./components/ui/QueryProgress";
import { GuestRoute, ProtectedRoute } from "./routes/guards";
import { AdminGate } from "./routes/AdminGate";
import { AppLayout } from "./layouts/AppLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { RouteFallback } from "./pages/RouteFallback";
import { NotFoundPage } from "./pages/NotFoundPage";

const LandingPage = lazy(() => import("@/pages/Landing/LandingPage").then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import("@/pages/Auth/AuthPages").then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import("@/pages/Auth/AuthPages").then((m) => ({ default: m.SignupPage })));
const OnboardingPage = lazy(() =>
  import("@/pages/Onboarding/OnboardingPage").then((m) => ({ default: m.OnboardingPage })),
);
const DashboardPage = lazy(() =>
  import("@/pages/Dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ProfilePage = lazy(() => import("@/pages/Profile/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const DocumentsPage = lazy(() =>
  import("@/pages/Documents/DocumentsPage").then((m) => ({ default: m.DocumentsPage })),
);
const CareerAnalysisPage = lazy(() =>
  import("@/pages/CareerAnalysis/CareerAnalysisPage").then((m) => ({ default: m.CareerAnalysisPage })),
);
const SkillGapPage = lazy(() => import("@/pages/SkillGap/SkillGapPage").then((m) => ({ default: m.SkillGapPage })));
const RoadmapPage = lazy(() => import("@/pages/Roadmap/RoadmapPage").then((m) => ({ default: m.RoadmapPage })));
const OpportunitiesPage = lazy(() =>
  import("@/pages/Opportunities/OpportunitiesPages").then((m) => ({ default: m.OpportunitiesPage })),
);
const JobsPage = lazy(() => import("@/pages/Opportunities/OpportunitiesPages").then((m) => ({ default: m.JobsPage })));
const GovernmentOpportunitiesPage = lazy(() =>
  import("@/pages/Opportunities/OpportunitiesPages").then((m) => ({ default: m.GovernmentOpportunitiesPage })),
);
const SarkariHubPage = lazy(() =>
  import("@/pages/Sarkari/SarkariPages").then((m) => ({ default: m.SarkariHubPage })),
);
const SarkariExamPage = lazy(() =>
  import("@/pages/Sarkari/SarkariPages").then((m) => ({ default: m.SarkariExamPage })),
);
const ResearchPage = lazy(() => import("@/pages/Research/ResearchPage").then((m) => ({ default: m.ResearchPage })));
const CopilotPage = lazy(() => import("@/pages/Copilot/CopilotPage").then((m) => ({ default: m.CopilotPage })));
const ProgressPage = lazy(() => import("@/pages/Progress/ProgressPage").then((m) => ({ default: m.ProgressPage })));
const SettingsPage = lazy(() => import("@/pages/Settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const AdminPage = lazy(() => import("@/pages/Admin/AdminPage").then((m) => ({ default: m.AdminPage })));
const AdminLoginPage = lazy(() => import("@/pages/Admin/AdminLoginPage").then((m) => ({ default: m.AdminLoginPage })));
const AdminUserPage = lazy(() => import("@/pages/Admin/AdminUserPage").then((m) => ({ default: m.AdminUserPage })));
const AdminJobsPage = lazy(() => import("@/pages/Admin/AdminRecordsPage").then((m) => ({ default: m.AdminJobsPage })));
const AdminExamsPage = lazy(() => import("@/pages/Admin/AdminRecordsPage").then((m) => ({ default: m.AdminExamsPage })));
const AdminOpportunitiesPage = lazy(() =>
  import("@/pages/Admin/AdminRecordsPage").then((m) => ({ default: m.AdminOpportunitiesPage })),
);
const AdminMarketSourcesPage = lazy(() =>
  import("@/pages/Admin/AdminMarketSourcesPage").then((m) => ({ default: m.AdminMarketSourcesPage })),
);
const AdminMarketRunsPage = lazy(() =>
  import("@/pages/Admin/AdminMarketRunsPage").then((m) => ({ default: m.AdminMarketRunsPage })),
);
const AdminMarketSkillsPage = lazy(() =>
  import("@/pages/Admin/AdminMarketSkillsPage").then((m) => ({ default: m.AdminMarketSkillsPage })),
);
const AdminMarketSlicePage = lazy(() =>
  import("@/pages/Admin/AdminMarketSlicePage").then((m) => ({ default: m.AdminMarketSlicePage })),
);
const AdminMarketDemandPage = lazy(() =>
  import("@/pages/Admin/AdminMarketDemandPage").then((m) => ({ default: m.AdminMarketDemandPage })),
);

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

const router = createBrowserRouter([
  { path: "/", element: withSuspense(<LandingPage />) },
  {
    element: <GuestRoute />,
    children: [
      { path: "/login", element: withSuspense(<LoginPage />) },
      { path: "/signup", element: withSuspense(<SignupPage />) },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/onboarding", element: withSuspense(<OnboardingPage />) },
          { path: "/dashboard", element: withSuspense(<DashboardPage />) },
          { path: "/profile", element: withSuspense(<ProfilePage />) },
          { path: "/documents", element: withSuspense(<DocumentsPage />) },
          { path: "/career-analysis", element: withSuspense(<CareerAnalysisPage />) },
          { path: "/skill-gap", element: withSuspense(<SkillGapPage />) },
          { path: "/roadmap", element: withSuspense(<RoadmapPage />) },
          { path: "/opportunities", element: withSuspense(<OpportunitiesPage />) },
          { path: "/jobs", element: withSuspense(<JobsPage />) },
          { path: "/government-opportunities", element: withSuspense(<GovernmentOpportunitiesPage />) },
          { path: "/sarkari-naukri", element: withSuspense(<SarkariHubPage />) },
          { path: "/sarkari-naukri/:slug", element: withSuspense(<SarkariExamPage />) },
          { path: "/research", element: withSuspense(<ResearchPage />) },
          { path: "/copilot", element: withSuspense(<CopilotPage />) },
          { path: "/progress", element: withSuspense(<ProgressPage />) },
          { path: "/settings", element: withSuspense(<SettingsPage />) },
        ],
      },
    ],
  },
  { path: "/admin/login", element: withSuspense(<AdminLoginPage />) },
  {
    element: <AdminGate />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: "/admin", element: withSuspense(<AdminPage />) },
          { path: "/admin/users", element: withSuspense(<AdminPage />) },
          { path: "/admin/users/:id", element: withSuspense(<AdminUserPage />) },
          { path: "/admin/careers", element: withSuspense(<AdminPage />) },
          { path: "/admin/skills", element: withSuspense(<AdminPage />) },
          { path: "/admin/jobs", element: withSuspense(<AdminJobsPage />) },
          { path: "/admin/exams", element: withSuspense(<AdminExamsPage />) },
          { path: "/admin/opportunities", element: withSuspense(<AdminOpportunitiesPage />) },
          { path: "/admin/market/sources", element: withSuspense(<AdminMarketSourcesPage />) },
          { path: "/admin/market/runs", element: withSuspense(<AdminMarketRunsPage />) },
          { path: "/admin/market/slice", element: withSuspense(<AdminMarketSlicePage />) },
          { path: "/admin/market/skills", element: withSuspense(<AdminMarketSkillsPage />) },
          { path: "/admin/market/demand", element: withSuspense(<AdminMarketDemandPage />) },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <StoreEffects />
      <QueryProgress />
      <ToastHost />
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>,
);
