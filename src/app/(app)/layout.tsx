import { ProtectedAppShell } from "@/components/ProtectedAppShell";
import { AuthProvider } from "@/context/AuthContext";
import { ReviewStoreProvider } from "@/context/ReviewStoreContext";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ReviewStoreProvider>
        <ProtectedAppShell>{children}</ProtectedAppShell>
      </ReviewStoreProvider>
    </AuthProvider>
  );
}
