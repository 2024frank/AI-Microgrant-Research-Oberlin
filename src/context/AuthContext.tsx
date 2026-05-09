"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";
import { syncLoginUser, type AuthorizedUser, type UserRole, type UserStatus } from "@/lib/users";

type AuthContextValue = {
  user: User | null;
  authorizedUser: AuthorizedUser | null;
  role: UserRole | null;
  status: UserStatus | "unknown" | null;
  isAuthorized: boolean;
  isLoading: boolean;
  refreshUserAccess: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authorizedUser, setAuthorizedUser] = useState<AuthorizedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadUserAccess(nextUser: User | null) {
    setUser(nextUser);

    if (!nextUser) {
      setAuthorizedUser(null);
      return;
    }

    const nextAuthorizedUser = await syncLoginUser(nextUser);
    setAuthorizedUser(nextAuthorizedUser);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setIsLoading(true);
      void loadUserAccess(nextUser)
        .catch(() => {
          setUser(nextUser);
          setAuthorizedUser(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    });

    return unsubscribe;
  }, []);

  const role = authorizedUser?.role ?? null;
  const status = authorizedUser?.status ?? (user ? "unknown" : null);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authorizedUser,
      role,
      status,
      isAuthorized: Boolean(user && role && status === "active"),
      isLoading,
      refreshUserAccess: async () => {
        setIsLoading(true);
        await loadUserAccess(firebaseAuth.currentUser);
        setIsLoading(false);
      },
    }),
    [authorizedUser, isLoading, role, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
