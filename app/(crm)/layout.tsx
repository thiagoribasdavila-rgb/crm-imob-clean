import type { ReactNode } from "react";
import SupabaseGuard from "@/components/SupabaseGuard";
import { AppShell } from "@/components/atlas/app-shell";
import AtlasSystemPulse from "@/components/AtlasSystemPulse";
import AtlasWorkspaceMemory from "@/components/AtlasWorkspaceMemory";
import { CommercialPresence } from "@/components/atlas/commercial-presence";

export default function CRMLayout({ children }: { children: ReactNode }) {
  return (
    <SupabaseGuard>
      <AppShell>{children}</AppShell>
      <AtlasSystemPulse />
      <AtlasWorkspaceMemory />
      <CommercialPresence />
    </SupabaseGuard>
  );
}
