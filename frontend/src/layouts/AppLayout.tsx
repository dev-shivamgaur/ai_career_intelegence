import { CopilotWidget } from "@/components/copilot/CopilotWidget";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { ProfileProvider, useProfile } from "@/context/ProfileContext";
import type { CareerTrack } from "@/types";
import { useState } from "react";
import { Outlet } from "react-router-dom";

export function AppLayout() {
  return (
    <ProfileProvider>
      <AppShell />
    </ProfileProvider>
  );
}

function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const profile = useProfile();
  const track: CareerTrack = profile.data?.careerTrack === "government_exam" ? "government_exam" : "private_tech";

  return (
    <div className="flex min-h-screen bg-surface dark:bg-surface-dark">
      <div className="hidden lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar collapsed={collapsed} track={track} onToggle={() => setCollapsed((c) => !c)} />
        </div>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-slate-900/40" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-72">
            <Sidebar
              collapsed={false}
              track={track}
              onToggle={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
      <CopilotWidget />
    </div>
  );
}
