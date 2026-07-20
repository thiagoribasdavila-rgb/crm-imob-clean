import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cascata hierárquica de distribuição para leads de entrada automática
 * (Meta Lead Ads e portais), aprovada em 2026-07-20.
 *
 * Ordem de resolução (determinística e explicável):
 *   1. Dono padrão da fonte (meta_lead_sources/portal_lead_sources.default_owner_id),
 *      DESDE QUE o perfil exista, esteja ativo e seja da organização — hoje o worker
 *      atribuía às cegas; um dono desativado geraria lead "fantasma".
 *   2. CORRETOR ativo e disponível (availability_status AVAILABLE), com cadeia de
 *      supervisão íntegra (reports_to → perfil ativo), DENTRO da capacidade
 *      (profiles.max_active_leads, contando leads abertos em assigned_to E no legado
 *      assigned_user_id), com MENOR carga; empate → há mais tempo sem receber lead
 *      (lead_distribution_history), depois id (estável).
 *   3. Sem corretor elegível → GERENTE ativo (commercial_role manager / legado
 *      GERENTE-DIRETOR) com menor carga segura a fila — sem teto de capacidade,
 *      porque alguém precisa ser o dono visível do lead.
 *   4. Ninguém → null (fila geral; o Command Center do diretor enxerga).
 *
 * Escolha consciente: NÃO exigimos presença online (commercial_presence, janela de
 * 90s) como a RPC de distribuição ao vivo — webhook chega de madrugada; a cascata
 * precisa funcionar offline. A auditoria vai para lead_distribution_history com o
 * motivo legível (melhor esforço — nunca derruba a criação do lead).
 */

const CLOSED_STATUSES = "(won,ganho,vendido,lost,perdido,descartado,discarded,archived,arquivado)";
const DEFAULT_CAPACITY = 100;

type ProfileRow = {
  id: string;
  full_name: string | null;
  name: string | null;
  role: string | null;
  commercial_role: string | null;
  reports_to: string | null;
  active: boolean | null;
  availability_status: string | null;
  max_active_leads: number | null;
};

export type CascadeTier = "source_default" | "broker" | "manager" | "unassigned";

export type OwnershipResolution = {
  ownerId: string | null;
  tier: CascadeTier;
  reason: string;
};

// Papel normalizado no vocabulário do RBAC oficial, com fallback do legado PT-BR.
function normalizedRole(profile: Pick<ProfileRow, "role" | "commercial_role">): string {
  const commercial = (profile.commercial_role || "").toLowerCase();
  if (commercial) return commercial;
  const legacy = (profile.role || "").toUpperCase();
  if (legacy === "CORRETOR") return "broker";
  if (legacy === "GERENTE" || legacy === "DIRETOR") return "manager";
  if (legacy === "ADMIN" || legacy === "DIRETOR_DECISOR") return "director";
  return (profile.role || "").toLowerCase();
}

function displayName(profile: Pick<ProfileRow, "full_name" | "name" | "id">): string {
  return profile.full_name || profile.name || profile.id.slice(0, 8);
}

async function openLeadCount(admin: SupabaseClient, organizationId: string, profileId: string): Promise<number> {
  const { count, error } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .or(`assigned_to.eq.${profileId},assigned_user_id.eq.${profileId}`)
    .not("status", "in", CLOSED_STATUSES);
  if (error) throw new Error(`Falha ao medir carga do perfil ${profileId}: ${error.message}`);
  return count ?? 0;
}

async function lastAssignmentAt(admin: SupabaseClient, organizationId: string, profileId: string): Promise<number> {
  const { data } = await admin
    .from("lead_distribution_history")
    .select("created_at")
    .eq("organization_id", organizationId)
    .eq("assigned_user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1);
  const raw = data?.[0]?.created_at;
  const parsed = raw ? Date.parse(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

type Candidate = { profile: ProfileRow; load: number; lastAssigned: number };

function pickLeastLoaded(candidates: Candidate[]): Candidate | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) =>
    a.load - b.load || a.lastAssigned - b.lastAssigned || a.profile.id.localeCompare(b.profile.id),
  )[0];
}

export async function resolveLeadOwner(
  admin: SupabaseClient,
  organizationId: string,
  defaultOwnerId: string | null,
): Promise<OwnershipResolution> {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id,full_name,name,role,commercial_role,reports_to,active,availability_status,max_active_leads")
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (error) throw new Error(`Falha ao carregar perfis para distribuição: ${error.message}`);
  const active = (profiles ?? []) as ProfileRow[];
  const activeIds = new Set(active.map((p) => p.id));

  // 1) Dono padrão da fonte — validado, nunca às cegas.
  if (defaultOwnerId) {
    const owner = active.find((p) => p.id === defaultOwnerId);
    if (owner) {
      return {
        ownerId: owner.id,
        tier: "source_default",
        reason: `Dono padrão da fonte: ${displayName(owner)} (ativo, validado).`,
      };
    }
    // Cai para a cascata com o motivo registrado no reason final.
  }
  const defaultNote = defaultOwnerId ? "Dono padrão da fonte inativo/inexistente; " : "";

  // 2) Corretores elegíveis: ativos, disponíveis, cadeia íntegra, dentro da capacidade.
  const brokers = active.filter((p) =>
    normalizedRole(p) === "broker" &&
    (p.availability_status ?? "AVAILABLE") === "AVAILABLE" &&
    p.reports_to !== null && activeIds.has(p.reports_to),
  );
  const brokerCandidates: Candidate[] = [];
  for (const profile of brokers) {
    const load = await openLeadCount(admin, organizationId, profile.id);
    const capacity = profile.max_active_leads ?? DEFAULT_CAPACITY;
    if (load >= capacity) continue;
    brokerCandidates.push({ profile, load, lastAssigned: await lastAssignmentAt(admin, organizationId, profile.id) });
  }
  const broker = pickLeastLoaded(brokerCandidates);
  if (broker) {
    return {
      ownerId: broker.profile.id,
      tier: "broker",
      reason: `${defaultNote}cascata hierárquica: corretor com menor carga (${displayName(broker.profile)}, ${broker.load} leads abertos).`.trim(),
    };
  }

  // 3) Gerentes seguram a fila (sem teto — alguém precisa ser o dono visível).
  const managers = active.filter((p) => normalizedRole(p) === "manager");
  const managerCandidates: Candidate[] = [];
  for (const profile of managers) {
    managerCandidates.push({
      profile,
      load: await openLeadCount(admin, organizationId, profile.id),
      lastAssigned: await lastAssignmentAt(admin, organizationId, profile.id),
    });
  }
  const manager = pickLeastLoaded(managerCandidates);
  if (manager) {
    return {
      ownerId: manager.profile.id,
      tier: "manager",
      reason: `${defaultNote}sem corretor elegível (disponível e com capacidade); gerente com menor carga segura a fila (${displayName(manager.profile)}).`.trim(),
    };
  }

  // 4) Fila geral — honesto; o diretor enxerga no Command Center.
  return {
    ownerId: null,
    tier: "unassigned",
    reason: `${defaultNote}nenhum corretor ou gerente elegível; lead na fila geral da organização.`.trim(),
  };
}

/** Auditoria em lead_distribution_history — melhor esforço, nunca derruba o lead. */
export async function recordDistribution(
  admin: SupabaseClient,
  input: { organizationId: string; leadId: string; ownerId: string; reason: string },
): Promise<void> {
  try {
    await admin.from("lead_distribution_history").insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      assigned_user_id: input.ownerId,
      reason: input.reason.slice(0, 500),
    });
  } catch {
    // Auditoria é desejável, não vital: o lead já existe e está atribuído.
  }
}
