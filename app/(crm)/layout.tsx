import type { ReactNode } from "react";
import SupabaseGuard from "@/components/SupabaseGuard";
import { AppShell } from "@/components/atlas/app-shell";
import AtlasCopilotDock from "@/components/AtlasCopilotDock";
import AtlasSystemPulse from "@/components/AtlasSystemPulse";
import AtlasNotificationCenter from "@/components/AtlasNotificationCenter";
import AtlasQuickCreate from "@/components/AtlasQuickCreate";
import AtlasWorkspaceMemory from "@/components/AtlasWorkspaceMemory";
import AtlasFeedbackCenter from "@/components/AtlasFeedbackCenter";
import { CommercialPresence } from "@/components/atlas/commercial-presence";
import { AiPresenceDock } from "@/components/atlas/ai-presence-dock";

export default function CRMLayout({ children }: { children: ReactNode }) {
  return (
    <SupabaseGuard>
      <AppShell>{children}</AppShell>
      <AtlasCopilotDock />
      <AtlasSystemPulse />
      <AtlasNotificationCenter />
      <AtlasQuickCreate />
      <AtlasWorkspaceMemory />
      <AtlasFeedbackCenter />
      <CommercialPresence />
      <AiPresenceDock />
    </SupabaseGuard>
  );
}
