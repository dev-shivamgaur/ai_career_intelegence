import { Avatar } from "@/components/ui/Avatar";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { useAuth, useTheme, useToast } from "@/store/hooks";
import * as appApi from "@/services/api/appApi";
import type { NotificationItem, SearchResult } from "@/types";
import { Bell, Menu, Moon, Search, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { push } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [notes, setNotes] = useState<NotificationItem[]>([]);
  const [openSearch, setOpenSearch] = useState(false);
  const [notesLoaded, setNotesLoaded] = useState(false);

  async function loadNotes() {
    if (notesLoaded) return;
    const rows = await appApi.getNotifications();
    setNotes(rows);
    setNotesLoaded(true);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      void appApi.searchCatalog(query).then(setResults);
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  const unread = notes.filter((n) => !n.read).length;

  return (
    <header className="flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-950 sm:h-16 sm:gap-3 sm:px-4">
      <button className="shrink-0 rounded-md p-2 lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>
      <div className="relative min-w-0 max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          aria-label="Search skills, tasks, jobs, and sources"
          placeholder="Search…"
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpenSearch(true);
          }}
          onFocus={() => setOpenSearch(true)}
        />
        {openSearch && results.length > 0 && (
          <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card dark:border-slate-700 dark:bg-slate-900">
            {results.map((r) => (
              <li key={r.id}>
                <Link
                  to={r.href}
                  className="block px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => {
                    setOpenSearch(false);
                    setQuery("");
                  }}
                >
                  <span className="font-medium">{r.title}</span>
                  <span className="ml-2 text-xs uppercase text-slate-400">{r.category}</span>
                  <p className="text-xs text-slate-500">{r.subtitle}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <button
        className="shrink-0 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
        onClick={toggle}
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <Dropdown
        onOpen={() => void loadNotes()}
        trigger={
          <button className="relative shrink-0 rounded-lg border border-slate-200 p-2 dark:border-slate-700" aria-label="Notifications">
            <Bell size={16} />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] text-white">
                {unread}
              </span>
            )}
          </button>
        }
      >
        <div className="max-h-80 w-80 overflow-y-auto p-2">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-xs font-semibold uppercase text-slate-500">Notifications</p>
            <button
              className="text-xs text-brand-700"
              onClick={() =>
                void appApi.markAllRead().then((n) => {
                  setNotes(n);
                  push("Notifications marked as read");
                })
              }
            >
              Mark all read
            </button>
          </div>
          {notes.map((n) => (
            <button
              key={n.id}
              className="mb-1 w-full rounded-lg px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => void appApi.markRead(n.id).then(setNotes)}
            >
              <p className={`text-sm ${n.read ? "text-slate-500" : "font-medium"}`}>{n.title}</p>
              <p className="text-xs text-slate-500">{n.body}</p>
            </button>
          ))}
        </div>
      </Dropdown>
      <Dropdown
        trigger={
          <button className="flex max-w-[9.5rem] shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700 sm:max-w-[14rem]">
            <Avatar initials={user?.avatarInitials ?? "U"} />
            <span className="hidden min-w-0 truncate text-sm font-medium sm:block">{user?.name}</span>
          </button>
        }
      >
        <DropdownItem onClick={() => navigate("/profile")}>Profile</DropdownItem>
        <DropdownItem onClick={() => navigate("/settings")}>Settings</DropdownItem>
        <DropdownItem
          onClick={() => {
            void logout().then(() => navigate("/login"));
          }}
        >
          Log out
        </DropdownItem>
      </Dropdown>
      </div>
    </header>
  );
}
