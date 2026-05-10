"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Archive,
  BarChart3,
  Bot,
  CalendarDays,
  Copy,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  MapPinned,
  MessageCircle,
  Settings,
  Shield,
  UserCog,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { canAccessAdminControl } from "@/lib/users";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/posts", label: "Posts", icon: CalendarDays, badge: true },
  { href: "/sources", label: "Sources", icon: Gauge },
  { href: "/source-builder", label: "Source Builder", icon: Bot, adminOnly: true },
  { href: "/ai-analysis", label: "AI Analysis", icon: BarChart3 },
  { href: "/duplicate-detection", label: "Duplicate Detection", icon: Copy },
  { href: "/geo-intel", label: "Geo Intel", icon: MapPinned },
  { href: "/logs", label: "Logs", icon: Activity },
  { href: "/system-health", label: "System Health", icon: HeartPulse },
  { href: "/chat", label: "Team Chat", icon: MessageCircle },
  { href: "/admin-control", label: "Admin Control", icon: UserCog },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/archive", label: "Archive", icon: Archive },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { role, user } = useAuth();
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    async function loadCount() {
      try {
        const { getReviewPostStats } = await import("@/lib/reviewStoreClient");
        const stats = await getReviewPostStats();
        setPendingCount(stats.pending);
      } catch { /* silent */ }
    }
    loadCount();
    const interval = setInterval(loadCount, 15000);
    return () => clearInterval(interval);
  }, []);

  const isAdmin = role === "admin" || role === "super_admin";
  const visibleNavItems = navItems.filter(
    (item) =>
      (item.href !== "/admin-control" || canAccessAdminControl(role)) &&
      (!item.adminOnly || isAdmin),
  );

  return (
    <aside className="hidden h-screen w-[240px] shrink-0 border-r border-[var(--border-warm)] bg-[var(--surface)] md:fixed md:left-0 md:top-0 md:flex md:flex-col">
      <div className="border-b border-[var(--border)] px-5 py-5">
        <Link className="flex items-center gap-3" href="/dashboard">
          <div className="flex h-9 w-9 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-high)] text-[#ffb3b3]">
            <Shield aria-hidden="true" size={20} />
          </div>
          <div>
            <p className="font-[var(--font-public-sans)] text-lg font-bold text-[var(--text)]">
              Civic Calendar
            </p>
            <p className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted-warm)]">
              Admin Console
            </p>
          </div>
        </Link>
      </div>
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const showBadge = item.badge && pendingCount > 0;

            return (
              <li key={item.href}>
                <Link
                  className={cn(
                    "flex items-center gap-3 rounded px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-high)] hover:text-[var(--text)]",
                    isActive &&
                      "border-r-2 border-[#ffb3b3] bg-[var(--primary-soft)] font-semibold text-[#ffb3b3]",
                  )}
                  href={item.href}
                >
                  <Icon aria-hidden="true" size={18} />
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#a6192e] px-1.5 text-[10px] font-bold text-white tabular-nums">
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-[var(--border)] px-5 py-4 text-sm">
        <p className="truncate text-[var(--text)]">{user?.displayName ?? user?.email ?? "Admin User"}</p>
        <p className="font-[var(--font-plex)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
          {role ?? "No role"}
        </p>
      </div>
    </aside>
  );
}
