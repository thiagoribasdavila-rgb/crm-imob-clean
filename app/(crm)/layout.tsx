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

export default function CRMLayout({
  children,
  ficha,
}: {
  children: ReactNode;
  /**
   * Slot da ficha do lead em lâmina. Vive AQUI, e não dentro de `leads/`,
   * porque só neste nível o `children` continua sendo a lista quando a URL
   * vira `/leads/:id` — medido: dentro de `leads/` a lista remontava e refazia
   * 4 consultas por abertura. Ver o comentário em @ficha/(.)leads/[id]/page.tsx.
   */
  ficha: ReactNode;
}) {
  return (
    <SupabaseGuard>
      <AppShell>{children}</AppShell>
      {ficha}
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
