import type { ReactNode } from "react";
import SupabaseGuard from "@/components/SupabaseGuard";
import { AppShell } from "@/components/atlas/app-shell";
import CommandPalette from "@/components/CommandPalette";
import AtlasCopilotDock from "@/components/AtlasCopilotDock";
import AtlasSystemPulse from "@/components/AtlasSystemPulse";
import AtlasNotificationCenter from "@/components/AtlasNotificationCenter";
import AtlasQuickCreate from "@/components/AtlasQuickCreate";
import AtlasWorkspaceMemory from "@/components/AtlasWorkspaceMemory";
import AtlasFeedbackCenter from "@/components/AtlasFeedbackCenter";
import { CommercialPresence } from "@/components/atlas/commercial-presence";

export default function CRMLayout({ children }: { children: ReactNode }) {
  return (
    <SupabaseGuard>
      <AppShell>{children}</AppShell>
      <CommandPalette />
      <AtlasCopilotDock />
      <AtlasSystemPulse />
      <AtlasNotificationCenter />
      <AtlasQuickCreate />
      <AtlasWorkspaceMemory />
      <AtlasFeedbackCenter />
      <CommercialPresence />
    </SupabaseGuard>
  );
}
