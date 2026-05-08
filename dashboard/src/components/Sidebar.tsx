"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

const nav = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
  },
  {
    label: "Sources",
    href: "/dashboard/sources",
    icon: "M12 3c4.556 0 8.25 1.847 8.25 4.125S16.556 11.25 12 11.25 3.75 9.403 3.75 7.125 7.444 3 12 3Zm8.25 4.125v9.75C20.25 19.153 16.556 21 12 21s-8.25-1.847-8.25-4.125v-9.75m16.5 4.875c0 2.278-3.694 4.125-8.25 4.125S3.75 14.278 3.75 12",
  },
  {
    label: "Review Queue",
    href: "/dashboard/review",
    badge: "review",
    icon: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  {
    label: "Duplicates",
    href: "/dashboard/duplicates",
    badge: "duplicates",
    icon: "M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75A1.125 1.125 0 0 1 3.75 20.625V7.875c0-.621.504-1.125 1.125-1.125H8.25m7.5 10.5h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876A9.06 9.06 0 0 0 11.25 2.25H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375A1.125 1.125 0 0 1 8.25 16.125v-9.25",
  },
  {
    label: "Rejected",
    href: "/dashboard/rejected",
    badge: "rejected",
    icon: "M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636",
  },
];

function NavIcon({ path }: { path: string }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin } = useAuth();
  const [counts, setCounts] = useState({ review: 0, rejected: 0, duplicates: 0 });

  useEffect(() => {
    const review = query(collection(db, "review_queue"), where("status", "==", "pending"));
    const rejected = query(collection(db, "rejected"), where("status", "==", "rejected"));
    const duplicates = query(collection(db, "duplicates"), where("status", "==", "pending"));
    const unsubReview = onSnapshot(review, s => setCounts(c => ({ ...c, review: s.size })));
    const unsubRejected = onSnapshot(rejected, s => setCounts(c => ({ ...c, rejected: s.size })));
    const unsubDuplicates = onSnapshot(duplicates, s => setCounts(c => ({ ...c, duplicates: s.size })));
    return () => {
      unsubReview();
      unsubRejected();
      unsubDuplicates();
    };
  }, []);

  const items = [
    ...nav,
    ...(isAdmin ? [{
      label: "Users",
      href: "/dashboard/users",
      icon: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
    }] : []),
  ];

  return (
    <aside className="w-60 shrink-0 flex flex-col bg-[#120000] border-r border-white/[0.06] min-h-screen">
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#C8102E] flex items-center justify-center shadow-md shadow-[#C8102E]/30">
            <NavIcon path="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-none">Source Ops</p>
            <p className="text-zinc-500 text-[11px] mt-0.5">Codex to CommunityHub</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {items.map(item => {
          const active = pathname === item.href;
          const count = "badge" in item && item.badge ? counts[item.badge as keyof typeof counts] : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active ? "bg-[#C8102E]/15 text-white" : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <span className={active ? "text-[#C8102E]" : ""}><NavIcon path={item.icon} /></span>
              {item.label}
              {count > 0 && (
                <span className="ml-auto text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#C8102E]">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-[#C8102E]/20 flex items-center justify-center text-[#C8102E] text-xs font-bold uppercase shrink-0">
            {user?.email?.[0] ?? "U"}
          </div>
          <p className="text-zinc-400 text-xs truncate flex-1">{user?.email}</p>
          <button onClick={() => signOut(auth)} title="Sign out" className="text-zinc-600 hover:text-white transition shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
