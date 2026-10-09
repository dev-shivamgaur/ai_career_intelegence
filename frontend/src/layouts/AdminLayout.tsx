import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAuth, useTheme } from "@/store/hooks";
import {
  HiOutlineBriefcase,
  HiOutlineCollection,
  HiOutlineGlobe,
  HiOutlineLogout,
  HiOutlineMoon,
  HiOutlineOfficeBuilding,
  HiOutlineRefresh,
  HiOutlineSun,
  HiOutlineUserGroup,
  HiOutlineViewGrid,
} from "react-icons/hi";
import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/admin", label: "Overview", end: true, icon: HiOutlineViewGrid },
  { to: "/admin/users", label: "Users", icon: HiOutlineUserGroup },
  { to: "/admin/careers", label: "Careers", icon: HiOutlineBriefcase },
  { to: "/admin/skills", label: "Skills", icon: HiOutlineCollection },
  { to: "/admin/jobs", label: "Jobs", icon: HiOutlineOfficeBuilding },
  { to: "/admin/exams", label: "Exams", icon: HiOutlineCollection },
  { to: "/admin/opportunities", label: "Vacancies", icon: HiOutlineBriefcase },
  { to: "/admin/market/sources", label: "Market sources", icon: HiOutlineGlobe },
  { to: "/admin/market/runs", label: "Market runs", icon: HiOutlineRefresh },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <div className="min-h-screen bg-surface text-ink dark:bg-surface-dark dark:text-stone-100">
      <header className="flex items-center justify-between gap-4 border-b border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-surface-dark">
        <div className="min-w-0">
          <BrandLogo to="/admin" />
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Admin console</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-ink hover:bg-stone-50 dark:border-stone-700 dark:bg-transparent dark:text-stone-200 dark:hover:bg-stone-800"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <HiOutlineSun className="h-4 w-4" /> : <HiOutlineMoon className="h-4 w-4" />}
            <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          <div className="text-right text-sm leading-5">
            <p className="font-medium text-ink dark:text-stone-100">{user?.name || user?.phone}</p>
            <button
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              onClick={() => void logout()}
            >
              <HiOutlineLogout className="h-3.5 w-3.5" />
              Log out
            </button>
          </div>
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-4.5rem)]">
        <nav className="w-56 shrink-0 border-r border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-surface-dark">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive
                      ? "bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-100"
                      : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800/60"
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{link.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1 p-4 text-ink dark:text-stone-100 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
