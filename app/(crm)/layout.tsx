import Sidebar from "@/components/crm/sidebar";
import { ReactNode } from "react";


export default function CRMLayout({
  children,
}: {
  children: ReactNode;
}) {

  return (

    <div className="flex min-h-screen bg-zinc-950 text-white">

      <Sidebar />

      <main className="flex-1 p-8">

        {children}

      </main>

    </div>

  );
}
