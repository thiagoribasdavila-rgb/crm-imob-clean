import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import SupabaseGuard from "@/components/SupabaseGuard";
import AtlasTopbar from "@/components/AtlasTopbar";
import CommandPalette from "@/components/CommandPalette";
import AtlasCopilotDock from "@/components/AtlasCopilotDock";
import AtlasSystemPulse from "@/components/AtlasSystemPulse";
import AtlasNotificationCenter from "@/components/AtlasNotificationCenter";
import AtlasQuickCreate from "@/components/AtlasQuickCreate";
import AtlasWorkspaceMemory from "@/components/AtlasWorkspaceMemory";

export default function CRMLayout({ children }: { children: ReactNode }) {
  return (
    <SupabaseGuard>
      <div className="atlas-shell">
        <Sidebar />
        <AtlasTopbar />
        <main className="atlas-main">
          <div className="atlas-content">{children}</div>
        </main>
        <CommandPalette />
        <AtlasCopilotDock />
        <AtlasSystemPulse />
        <AtlasNotificationCenter />
        <AtlasQuickCreate />
        <AtlasWorkspaceMemory />
      </div>
    </SupabaseGuard>
  );
}
