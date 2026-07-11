"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const titles: Record<string, string> = {
  "/dashboard": "Command Center",
  "/leads": "Leads",
  "/pipeline": "Pipeline",
  "/customers": "Customer Intelligence",
  "/properties": "Imóveis",
  "/developments": "Empreendimentos",
  "/sales": "Vendas",
  "/calendar": "Agenda",
  "/tasks": "Tarefas",
  "/marketing": "Marketing Intelligence",
  "/reports": "Analytics",
  "/intelligence": "Atlas Intelligence",
  "/decision-center": "Centro de Decisão",
  "/automations": "Automações",
  "/integrations": "Integrações",
  "/users": "Usuários",
  "/settings": "Configurações",
  "/atlas-v3": "Atlas OS V3",
};

export default function AtlasTopbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [online, setOnline] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const title = useMemo(() => {
    const match = Object.keys(titles)
      .sort((a, b) => b.length - a.length)
      .find((key) => pathname === key || pathname.startsWith(`${key}/`));
    return match ? titles[match] : "Atlas AI";
  }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="atlas-topbar">
      <div className="min-w-0">
        <p className="atlas-eyebrow">Real Estate Operating System</p>
        <h1 className="truncate text-lg font-semibold text-white sm:text-xl">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300 md:flex">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.7)]" : "bg-rose-400"}`} />
          {online ? "Sistema online" : "Sem conexão"}
        </div>
        <Link href="/decision-center" className="atlas-icon-button" aria-label="Abrir centro de decisão">✦</Link>
        <Link href="/tasks" className="atlas-icon-button" aria-label="Abrir tarefas">✓</Link>
        <div className="hidden text-right sm:block">
          <p className="max-w-44 truncate text-xs font-medium text-slate-200">{email || "Usuário Atlas"}</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Operação segura</p>
        </div>
        <button onClick={signOut} className="atlas-icon-button" aria-label="Sair">↗</button>
      </div>
    </header>
  );
}