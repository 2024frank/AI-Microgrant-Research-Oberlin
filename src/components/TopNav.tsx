"use client";

import Link from "next/link";
import { Bell, HelpCircle, LogOut, Menu, Search } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { signOutUser } from "@/lib/auth";

type TopNavProps = {
  title?: string;
};

export function TopNav({ title = "Operations" }: TopNavProps) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-4 border-b border-[var(--border-warm)] bg-[var(--surface)] px-4 md:ml-[240px] md:px-6">
      <button
        aria-label="Open navigation"
        className="rounded border border-[var(--border)] p-2 text-[var(--muted)] md:hidden"
        type="button"
      >
        <Menu aria-hidden="true" size={18} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-[var(--font-public-sans)] text-base font-semibold text-[var(--text)] md:hidden">
          {title}
        </p>
        <label className="relative hidden max-w-md md:block">
          <span className="sr-only">Search civic calendar</span>
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            size={18}
          />
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
      <button
        aria-label="Notifications"
        className="rounded border border-transparent p-2 text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--text)]"
        type="button"
      >
        <Bell aria-hidden="true" size={18} />
      </button>
      <button
        aria-label="Help"
        className="rounded border border-transparent p-2 text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--text)]"
        type="button"
      >
        <HelpCircle aria-hidden="true" size={18} />
      </button>
      <button
        aria-label="Sign out"
        className="hidden items-center gap-2 rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)] sm:inline-flex"
        onClick={() => void signOutUser()}
        type="button"
      >
        <LogOut aria-hidden="true" size={16} />
        <span className="max-w-32 truncate">{user?.email ?? "Sign out"}</span>
      </button>
    </header>
  );
}
