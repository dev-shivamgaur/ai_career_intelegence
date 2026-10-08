import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  UserRound,
  FileStack,
  LineChart,
  GitCompare,
  Map,
  Briefcase,
  Building2,
  Landmark,
  BookOpen,
  Search,
  MessageSquare,
  Activity,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { BrandLogo } from "@/components/brand/BrandLogo";
import type { CareerTrack } from "@/types";

const privateItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/profile", label: "My Profile", icon: UserRound },
  { to: "/documents", label: "Documents", icon: FileStack },
  { to: "/career-analysis", label: "Career Analysis", icon: LineChart },
  { to: "/skill-gap", label: "Skill Gap", icon: GitCompare },
  { to: "/roadmap", label: "Roadmap", icon: Map },
  { to: "/jobs", label: "Jobs", icon: Building2 },
  { to: "/opportunities", label: "Opportunities", icon: Briefcase },
  { to: "/research", label: "Research", icon: Search },
  { to: "/copilot", label: "AI Copilot", icon: MessageSquare },
  { to: "/progress", label: "Progress", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

const governmentItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/profile", label: "My Profile", icon: UserRound },
  { to: "/documents", label: "Documents", icon: FileStack },
  { to: "/sarkari-naukri", label: "Exam prep", icon: BookOpen },
  { to: "/government-opportunities", label: "Vacancies", icon: Landmark },
  { to: "/roadmap", label: "Prep plan", icon: Map },
  { to: "/copilot", label: "AI Copilot", icon: MessageSquare },
  { to: "/progress", label: "Progress", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
  track = "private_tech",
}: {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  track?: CareerTrack;
}) {
  const baseItems = track === "government_exam" ? governmentItems : privateItems;
  const items = baseItems;

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className="flex h-16 items-center justify-between gap-1 px-3">
        <BrandLogo collapsed={collapsed} />
        <button
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4" aria-label="Main">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium",
                isActive
                  ? "bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900",
                collapsed && "justify-center",
              )
            }
            title={label}
          >
            <Icon size={18} aria-hidden />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
