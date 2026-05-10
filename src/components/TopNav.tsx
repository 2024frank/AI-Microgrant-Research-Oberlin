"use client";

import Link from "next/link";
import { Bell, HelpCircle, LogOut, Menu, Search, X, Shield } from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import { signOutUser } from "@/lib/auth";
import { canAccessAdminControl } from "@/lib/users";
import { cn } from "@/lib/utils";
import {
  Activity, Archive, BarChart3, CalendarDays, Copy,
  Gauge, HeartPulse, LayoutDashboard, MapPinned,
  Settings, UserCog,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/posts", label: "Posts", icon: CalendarDays },
  { href: "/sources", label: "Sources", icon: Gauge },
  { href: "/ai-analysis", label: "AI Analysis", icon: BarChart3 },
  { href: "/duplicate-detection", label: "Duplicate Detection", icon: Copy },
  { href: "/geo-intel", label: "Geo Intel", icon: MapPinned },
  { href: "/logs", label: "Logs", icon: Activity },
  { href: "/system-health", label: "System Health", icon: HeartPulse },
  { href: "/admin-control", label: "Admin Control", icon: UserCog },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/archive", label: "Archive", icon: Archive },
];

type TopNavProps = { title?: string };

export function TopNav({ title = "Operations" }: TopNavProps) {
  const { user, role } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = navItems.filter(
    (item) => item.href !== "/admin-control" || canAccessAdminControl(role)
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-[var(--border-warm)] bg-[var(--surface)] px-4 md:ml-[240px] md:px-6">
        <button
          aria-label="Open navigation"
          className="rounded border border-[var(--border)] p-2 text-[var(--muted)] md:hidden"
          onClick={() => setMobileOpen(true)}
          type="button"
        >
          <Menu size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="font-[var(--font-public-sans)] text-base font-semibold text-[var(--text)] md:hidden">
            {title}
          </p>
          <label className="relative hidden max-w-md md:block">
            <span className="sr-only">Search</span>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
            <input
              className="w-full rounded border border-[var(--border)] bg-[#131313] py-2 pl-10 pr-3 text-sm text-[var(--text)] outline-none placeholder:text-slate-500 focus:border-[#a6192e]"
              placeholder="Search posts, sources, logs..."
              type="search"
            />
          </label>
        </div>

        <Link
          className="hidden rounded bg-[#a6192e] px-3 py-2 font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-white hover:bg-[#b42537] sm:inline-flex"
          href="/posts"
        >
          Review Queue
        </Link>

        <button aria-label="Notifications" className="rounded border border-transparent p-2 text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--text)]" type="button">
          <Bell size={18} />
        </button>

        <button
          aria-label="Sign out"
          className="rounded border border-[var(--border)] p-2 text-[var(--muted)] hover:text-[var(--text)] sm:hidden"
          onClick={() => void signOutUser()}
          type="button"
        >
          <LogOut size={16} />
        </button>

        <button
          aria-label="Sign out"
          className="hidden items-center gap-2 rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)] sm:inline-flex"
          onClick={() => void signOutUser()}
          type="button"
        >
          <LogOut size={16} />
          <span className="max-w-32 truncate">{user?.email ?? "Sign out"}</span>
        </button>
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />

          {/* Drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-[var(--surface)] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-high)] text-[#ffb3b3]">
                  <Shield size={16} />
                </div>
                <div>
                  <p className="font-[var(--font-public-sans)] text-base font-bold text-[var(--text)]">Civic Calendar</p>
                  <p className="font-[var(--font-plex)] text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--muted-warm)]">Admin Console</p>
                </div>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-2 text-[var(--muted)]">
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-4">
              <ul className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded px-3 py-2.5 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-high)] hover:text-[var(--text)]",
                          isActive && "border-r-2 border-[#ffb3b3] bg-[var(--primary-soft)] font-semibold text-[#ffb3b3]"
                        )}
                      >
                        <Icon size={18} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="border-t border-[var(--border)] px-5 py-4">
              <p className="truncate text-sm text-[var(--text)]">{user?.displayName ?? user?.email ?? "Admin"}</p>
              <p className="text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mt-0.5">{role ?? "No role"}</p>
              <button
                onClick={() => { void signOutUser(); setMobileOpen(false); }}
                className="mt-3 flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--text)]"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
