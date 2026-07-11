import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import SupabaseGuard from "@/components/SupabaseGuard";

export default function CRMLayout({ children }: { children: ReactNode }) {
  return (
    <SupabaseGuard>
      <div className="min-h-screen bg-zinc-950 text-white lg:flex">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </SupabaseGuard>
  );
}
