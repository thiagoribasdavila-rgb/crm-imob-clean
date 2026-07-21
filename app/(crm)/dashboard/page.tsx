"use client";

import Link from "next/link";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Fusão Início → Sala de comando: o Command Center passou a ser a única home
// (informação por papel e grau de importância). /dashboard permanece apenas
// como rota de compatibilidade para deep links, favoritos e atalhos antigos —
// por isso o componente de página redireciona (ver DashboardPage no fim).
//
// O redesign CC-6 preservou a fronteira protegida (fetch a /api/v1/core-v2/
// module-health, sem leitura direta ao banco no cliente), mas removeu a
// renderização explícita da saúde dos módulos e da orientação de escrita
// segura. Esta seção — CommandCenterModuleHealth — é a restauração real dessa
// governança: os cinco módulos prioritários com semáforo operacional e a ação
// de escrita segura de cada um. O Command Center importa e renderiza este
// componente; aqui fica a fonte única, honesta e reaproveitável.

type ModuleWriteReadiness = {
  state: "ready" | "source-mediated" | "blocked";
  label: string;
  detail: string;
  href: string;
  actionLabel: string;
};

type ModuleHealth = {
  id: string;
  label: string;
  state: "operational" | "degraded" | "unavailable";
  detail: string;
  href: string;
  count: number | null;
  write: ModuleWriteReadiness;
};

type ModuleHealthApiEnvelope = {
  ok: boolean;
  data?: {
    generatedAt: string;
    health: {
      state: "operational" | "degraded" | "attention";
      modules: ModuleHealth[];
    };
  };
  error?: { message?: string };
};

// Semente honesta: base vazia é saudável (Fase 96) e a prontidão de escrita
// nunca anuncia como pronto um domínio que ainda não está vivo (Fase 97).
// É apenas o estado inicial otimista enquanto a fronteira protegida responde;
// o snapshot real do endpoint substitui estes valores assim que chega.
const INITIAL_MODULE_HEALTH: ModuleHealth[] = [
  {
    id: "leads",
    label: "Leads",
    state: "operational",
    detail: "Carteira pronta para receber leads",
    href: "/leads",
    count: null,
    write: {
      state: "ready",
      label: "Escrita liberada",
      detail: "Identidade, tenant, duplicidade e auditoria aplicados.",
      href: "/leads",
      actionLabel: "Registrar lead",
    },
  },
  {
    id: "pipeline",
    label: "Pipeline",
    state: "operational",
    detail: "Funil pronto para movimentar oportunidades",
    href: "/pipeline",
    count: null,
    write: {
      state: "ready",
      label: "Escrita liberada",
      detail: "Movimentos com conflito, histórico e escrita compensatória.",
      href: "/pipeline",
      actionLabel: "Mover estágio",
    },
  },
  {
    id: "tasks-and-agenda",
    label: "Tarefas e agenda",
    state: "operational",
    detail: "Agenda pronta para novas tarefas",
    href: "/tasks",
    count: null,
    write: {
      state: "ready",
      label: "Escrita liberada",
      detail: "Contexto, tenant e confirmação humana preservados.",
      href: "/tasks",
      actionLabel: "Criar tarefa",
    },
  },
  {
    id: "customers-360",
    label: "Clientes 360",
    state: "operational",
    detail: "Visão de clientes pronta para uso",
    href: "/leads",
    count: null,
    write: {
      state: "source-mediated",
      label: "Escrita pela fonte Lead 360",
      detail: "A gravação acontece na origem do lead, sem duplicar a verdade.",
      href: "/leads",
      actionLabel: "Abrir Lead 360",
    },
  },
  {
    id: "developments",
    label: "Empreendimentos",
    state: "operational",
    detail: "Catálogo pronto para consulta",
    href: "/developments",
    count: null,
    write: {
      state: "blocked",
      label: "Escrita bloqueada",
      detail: "Domínio canônico ainda não está vivo; escrita só em homologação.",
      href: "/developments/homologation",
      actionLabel: "Abrir homologação",
    },
  },
];

const HEALTH_STYLE: Record<ModuleHealth["state"], { dot: string; text: string; label: string }> = {
  operational: { dot: "var(--atlas-success)", text: "cc6-ok", label: "Operacional" },
  degraded: { dot: "var(--atlas-warning)", text: "cc6-warn", label: "Atenção" },
  unavailable: { dot: "var(--atlas-danger)", text: "cc6-crit", label: "Indisponível" },
};

const WRITE_STYLE: Record<ModuleWriteReadiness["state"], { sev: string; text: string }> = {
  ready: { sev: "var(--atlas-success)", text: "cc6-ok" },
  "source-mediated": { sev: "var(--atlas-accent)", text: "" },
  blocked: { sev: "var(--atlas-danger)", text: "cc6-crit" },
};

/**
 * Saúde operacional dos módulos + orientação de escrita segura.
 * Consome exclusivamente /api/v1/core-v2/module-health (fronteira protegida,
 * sem query Supabase direta no cliente). Falha parcial mostra a semente e um
 * aviso discreto — nunca é anunciada como pane geral.
 */
export function CommandCenterModuleHealth() {
  const [modules, setModules] = useState<ModuleHealth[]>(INITIAL_MODULE_HEALTH);
  const [partial, setPartial] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadHealth = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session) throw new Error("ATLAS_SESSION_REQUIRED");

        const response = await fetch("/api/v1/core-v2/module-health", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const body = (await response
          .json()
          .catch(() => null)) as ModuleHealthApiEnvelope | null;

        if (!active) return;

        if (!response.ok || !body?.ok || !body.data) {
          setPartial(
            "Mantendo a leitura anterior enquanto a fronteira de saúde responde.",
          );
          return;
        }

        setModules(body.data.health.modules);
        setPartial(null);
      } catch {
        if (active) {
          setPartial(
            "Mantendo a leitura anterior enquanto a fronteira de saúde responde.",
          );
        }
      }
    };

    void loadHealth();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section
      aria-label="Saúde operacional dos módulos"
      data-section="module-health"
      className="cc6-reveal cc6-panel px-5 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="cc6-eyebrow">Saúde operacional dos módulos</p>
        <span className="cc6-chip" role="status">
          {modules.filter((module) => module.state === "operational").length}/{modules.length} operacionais
        </span>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {modules.map((module) => {
          const health = HEALTH_STYLE[module.state];
          const write = WRITE_STYLE[module.write.state];
          return (
            <li
              key={module.id}
              className="cc6-panel-quiet cc6-sev-band px-3 py-3"
              style={{ ["--cc6-sev" as string]: write.sev }}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: health.dot }}
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">
                  {module.label}
                </span>
                <span className="cc6-num shrink-0 text-xs font-semibold text-slate-300">
                  {module.count ?? "—"}
                </span>
              </div>
              <p className={`mt-1 text-[10px] ${health.text || "text-slate-500"}`}>
                {health.label} · {module.detail}
              </p>

              <div className="cc6-hairline mt-2 pt-2">
                <p className={`text-[11px] font-medium ${write.text || "text-slate-300"}`}>
                  {module.write.label}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">{module.write.detail}</p>
                <Link
                  href={module.write.href}
                  aria-disabled={module.write.state === "blocked"}
                  className="cc6-ghost-btn mt-2 w-full justify-center"
                >
                  {module.write.actionLabel}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      {partial ? (
        <p
          role="status"
          data-state="partial"
          className="cc6-warn mt-3 text-[11px]"
        >
          Atualização parcial do Command Center · {partial}
        </p>
      ) : null}
    </section>
  );
}

export default function DashboardPage() {
  redirect("/command-center");
}
