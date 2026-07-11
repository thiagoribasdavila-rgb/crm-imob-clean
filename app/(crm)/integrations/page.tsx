"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Integration = {
  name: string;
  description: string;
  status: "connected" | "ready" | "planned";
  env?: string[];
};

const integrations: Integration[] = [
  { name: "Supabase", description: "Banco, autenticação, RLS e realtime.", status: "connected", env: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] },
  { name: "Vercel", description: "Deploy, previews, logs e produção.", status: "connected" },
  { name: "GitHub", description: "Código, auditoria, CI e pull requests.", status: "connected" },
  { name: "Meta Ads", description: "Leads, campanhas, criativos, públicos e atribuição.", status: "ready", env: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID", "META_PIXEL_ID"] },
  { name: "WhatsApp Cloud API", description: "Pré-atendimento, follow-up e notificações.", status: "ready", env: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"] },
  { name: "Google Calendar", description: "Visitas, compromissos e disponibilidade.", status: "planned" },
  { name: "Google Sheets", description: "Importação, exportação e relatórios legados.", status: "planned" },
  { name: "n8n / Make", description: "Orquestração externa e fluxos personalizados.", status: "planned" },
];

export default function IntegrationsPage() {
  const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);

  useEffect(() => {
    async function check() {
      const { error } = await supabase.from("organizations").select("id").limit(1);
      setSupabaseOk(!error);
    }
    check();
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">Atlas Connect</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Central de integrações</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Visão única das conexões que alimentam operação, marketing, atendimento, dados e automações.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {integrations.map((integration) => {
          const status = integration.name === "Supabase" && supabaseOk !== null ? (supabaseOk ? "connected" : "ready") : integration.status;
          return (
            <article key={integration.name} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-bold text-white">{integration.name}</h2>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${status === "connected" ? "bg-emerald-500/10 text-emerald-300" : status === "ready" ? "bg-amber-500/10 text-amber-300" : "bg-zinc-800 text-zinc-400"}`}>
                  {status === "connected" ? "Conectado" : status === "ready" ? "Pronto" : "Planejado"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{integration.description}</p>
              {integration.env?.length ? <div className="mt-4 space-y-1">{integration.env.map(item => <code key={item} className="block truncate rounded bg-zinc-950 px-2 py-1 text-[11px] text-zinc-500">{item}</code>)}</div> : null}
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-6">
        <h2 className="font-bold text-blue-100">Política operacional</h2>
        <p className="mt-2 text-sm leading-6 text-blue-100/70">Tokens e segredos nunca ficam no repositório. Publicação de campanhas, disparos em massa, movimentações financeiras e ações externas exigirão aprovação humana e registro em auditoria.</p>
      </section>
    </div>
  );
}
