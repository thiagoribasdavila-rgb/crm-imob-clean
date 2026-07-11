import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import SupabaseGuard from "@/components/SupabaseGuard";
import AtlasTopbar from "@/components/AtlasTopbar";

export default function CRMLayout({ children }: { children: ReactNode }) {
  return (
    <SupabaseGuard>
      <div className="atlas-shell">
        <Sidebar />
        <AtlasTopbar />
        <main className="atlas-main">
          <div className="atlas-content">{children}</div>
        </main>
      </div>
    </SupabaseGuard>
  );
}
