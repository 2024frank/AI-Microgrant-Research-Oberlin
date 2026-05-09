"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AccessDeniedScreen, UnauthorizedScreen } from "@/components/AccessScreens";
import { AppSidebar } from "@/components/AppSidebar";
import { TopNav } from "@/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { canAccessAdminControl } from "@/lib/users";

export function ProtectedAppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, status, isAuthorized, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, router, user]);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 text-sm text-[var(--muted)]">
        Checking access...
      </main>
    );
  }

  if (!isAuthorized) {
    return (
      <UnauthorizedScreen
        displayName={user.displayName}
        email={user.email}
        photoURL={user.photoURL}
        status={status}
      />
    );
  }

  if (pathname.startsWith("/admin-control") && !canAccessAdminControl(role)) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <AppSidebar />
        <TopNav />
        <main className="px-4 py-6 md:ml-[240px] md:px-6 lg:px-8">
          <AccessDeniedScreen />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <AppSidebar />
      <TopNav />
      <main className="px-4 py-6 md:ml-[240px] md:px-6 lg:px-8">{children}</main>
    </div>
  );
}
