import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LIVE_PROFILE_SELECT,
  leadAsOpportunity,
  mapLegacyProfile,
  type CompatRow,
} from "@/lib/compat/legacy-v2";
import {
  readCompatibleDevelopments,
  readCompatibleLeads,
  readCompatibleTasks,
  type CompatibleReadResult,
} from "./live-repositories";
import {
  resolveOperationalWriteReadiness,
  type OperationalWriteReadiness,
} from "./live-write-readiness";

export const ATLAS_OPERATIONAL_HEALTH_VERSION = "module-health-v2";

export type OperationalModuleId =
  | "leads"
  | "pipeline"
  | "tasks-and-agenda"
  | "customers-360"
  | "developments";

export type OperationalModuleState = "operational" | "degraded" | "unavailable";

export type OperationalModuleHealth = {
  id: OperationalModuleId;
  label: string;
  state: OperationalModuleState;
  detail: string;
  href: string;
  count: number | null;
  write: OperationalWriteReadiness;
};

type OperationalModuleReadHealth = Omit<OperationalModuleHealth, "write">;

type OperationalHealthInput = {
  organizationId: string;
  limit?: number;
};

type ProfileRead = {
  ok: boolean;
  rows: CompatRow[];
  count: number | null;
};

function readState(
  result: CompatibleReadResult<CompatRow>,
  input: {
    id: OperationalModuleId;
    label: string;
    href: string;
    ready: string;
    empty: string;
  },
): OperationalModuleReadHealth {
  if (!result.ok) {
    return {
      id: input.id,
      label: input.label,
      state: "unavailable",
      detail: "Conexão temporariamente indisponível",
      href: input.href,
      count: null,
    };
  }

  return {
    id: input.id,
    label: input.label,
    state: "operational",
    detail: result.count > 0 ? input.ready : input.empty,
    href: input.href,
    count: result.count,
  };
}

function localInsights(leads: CompatRow[], tasks: CompatRow[]) {
  const now = Date.now();
  const unassigned = leads.filter((lead) => !lead.assigned_to).length;
  const hot = leads.filter((lead) => {
    const temperature = String(lead.temperature ?? "").toLocaleLowerCase("pt-BR");
    return temperature === "quente" || Number(lead.score ?? 0) >= 70;
  }).length;
  const overdue = tasks.filter((task) => {
    const dueAt = typeof task.due_at === "string" ? new Date(task.due_at).getTime() : Number.NaN;
    const status = String(task.status ?? "").toLocaleLowerCase("pt-BR");
    return Number.isFinite(dueAt)
      && dueAt < now
      && !["done", "completed", "concluido", "concluida", "cancelado"].includes(status);
  }).length;

  return [
    ...(hot > 0 ? [{ id: "hot-leads", type: "opportunity", title: "Leads quentes", content: `${hot} leads pedem priorização comercial.`, count: hot }] : []),
    ...(unassigned > 0 ? [{ id: "unassigned-leads", type: "attention", title: "Leads sem responsável", content: `${unassigned} leads aguardam distribuição humana.`, count: unassigned }] : []),
    ...(overdue > 0 ? [{ id: "overdue-tasks", type: "attention", title: "Ações atrasadas", content: `${overdue} tarefas precisam de revisão.`, count: overdue }] : []),
  ];
}

async function readProfiles(
  client: SupabaseClient,
  organizationId: string,
  limit: number,
): Promise<ProfileRead> {
  const result = await client
    .from("profiles")
    .select(LIVE_PROFILE_SELECT, { count: "exact" })
    .eq("organization_id", organizationId)
    .limit(limit);

  if (result.error) return { ok: false, rows: [], count: null };
  return {
    ok: true,
    rows: ((result.data ?? []) as unknown as CompatRow[]).map(mapLegacyProfile),
    count: result.count ?? result.data?.length ?? 0,
  };
}

export async function readOperationalModuleHealth(
  client: SupabaseClient,
  input: OperationalHealthInput,
) {
  const organizationId = input.organizationId.trim();
  const limit = Math.min(5_000, Math.max(1, Math.trunc(input.limit ?? 500)));
  const [leadResult, taskResult, developmentResult, profiles] = await Promise.all([
    readCompatibleLeads(client, { organizationId, limit }),
    readCompatibleTasks(client, { organizationId, limit }),
    readCompatibleDevelopments(client, { organizationId, limit }),
    readProfiles(client, organizationId, Math.min(limit, 500)),
  ]);

  const leads = leadResult.ok ? leadResult.rows : [];
  const tasks = taskResult.ok ? taskResult.rows : [];
  const developments = developmentResult.ok ? developmentResult.rows : [];
  const opportunities = leads.map(leadAsOpportunity);

  const readModules: OperationalModuleReadHealth[] = [
    readState(leadResult, {
      id: "leads",
      label: "Leads",
      href: "/leads",
      ready: "Carteira comercial conectada",
      empty: "Carteira pronta para receber leads",
    }),
    readState(leadResult, {
      id: "pipeline",
      label: "Pipeline",
      href: "/pipeline",
      ready: "Funil comercial conectado",
      empty: "Funil pronto para novas oportunidades",
    }),
    readState(taskResult, {
      id: "tasks-and-agenda",
      label: "Tarefas e agenda",
      href: "/tasks",
      ready: "Prazos operacionais conectados",
      empty: "Agenda pronta para novas ações",
    }),
    !leadResult.ok
      ? {
          id: "customers-360",
          label: "Clientes 360",
          state: "unavailable",
          detail: "Conexão temporariamente indisponível",
          href: "/customers",
          count: null,
        }
      : {
          id: "customers-360",
          label: "Clientes 360",
          state: profiles.ok ? "operational" : "degraded",
          detail: profiles.ok
            ? (leadResult.count > 0 ? "Visão unificada conectada" : "Base pronta para novos clientes")
            : "Clientes disponíveis; equipe em atualização",
          href: "/customers",
          count: leadResult.count,
        },
    readState(developmentResult, {
      id: "developments",
      label: "Projetos",
      href: "/developments",
      ready: "Portfólio comercial conectado",
      empty: "Portfólio pronto para cadastro",
    }),
  ];

  const modules: OperationalModuleHealth[] = readModules.map((module) => ({
    ...module,
    write: resolveOperationalWriteReadiness(module),
  }));
  const operational = modules.filter((module) => module.state === "operational").length;
  const degraded = modules.filter((module) => module.state === "degraded").length;
  const unavailable = modules.filter((module) => module.state === "unavailable").length;
  const writeReady = modules.filter((module) => module.write.state === "ready").length;
  const writeMediated = modules.filter((module) => module.write.state === "source-mediated").length;
  const writeBlocked = modules.filter((module) => module.write.state === "blocked").length;

  return {
    contract: ATLAS_OPERATIONAL_HEALTH_VERSION,
    generatedAt: new Date().toISOString(),
    scope: {
      organizationId,
      tenantFilterApplied: true,
      rlsPreserved: true,
    },
    snapshot: {
      leads,
      opportunities,
      tasks,
      insights: localInsights(leads, tasks),
      developments,
      profiles: profiles.rows,
    },
    health: {
      state: unavailable > 0 ? "attention" : degraded > 0 ? "degraded" : "operational",
      operational,
      degraded,
      unavailable,
      write: {
        ready: writeReady,
        sourceMediated: writeMediated,
        blocked: writeBlocked,
      },
      modules,
    },
  };
}
