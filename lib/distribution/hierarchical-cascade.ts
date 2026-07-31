import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolverElenco, aplicarElenco,
  type EscopoDeDistribuicao, type MembroDoElenco,
} from "./elenco-por-escopo";

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
 * Escolha consciente: NÃO exigimos presença online (aba aberta, janela de minutos)
 * como a RPC de distribuição ao vivo — webhook chega de madrugada; a cascata
 * precisa funcionar offline. A auditoria vai para lead_distribution_history com o
 * motivo legível (melhor esforço — nunca derruba a criação do lead).
 *
 * ── MUDANÇA DE REGRA (2026-07-27), pedida pelo dono do produto ──────────────
 *
 * TODOS — corretor, gerente e dono padrão da fonte — só recebem lead com o
 * WhatsApp CONECTADO. Sem ninguém conectado a lead fica REPRESADA (sem dono) e
 * o diretor distribui.
 *
 * O corretor só entra no rodízio com o WhatsApp CONECTADO. Não é presença de
 * aba aberta — é a conexão do número, que sobrevive ao notebook fechado e à
 * madrugada, então a decisão acima continua valendo inteira.
 *
 * O motivo é operacional: lead de anúncio se atende por WhatsApp. Mandar lead
 * para quem não tem o canal ligado é criar um SLA que já nasce estourado.
 *
 * Nenhuma lead se perde por causa disto: sem corretor conectado a cascata cai
 * para o gerente (etapa 3) e depois para a fila geral (etapa 4), que já eram os
 * degraus previstos. O motivo aparece por escrito no histórico — se as leads
 * começarem a empilhar no gerente, a causa está escrita lá, não escondida.
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

/**
 * `escopo` é OPCIONAL de propósito: os chamadores que ainda não sabem o projeto
 * nem a campanha da lead continuam funcionando exatamente como antes. Elenco
 * ausente ou escopo ausente ⇒ fila aberta a toda a equipe.
 */
export async function resolveLeadOwner(
  admin: SupabaseClient,
  organizationId: string,
  defaultOwnerId: string | null,
  escopo?: EscopoDeDistribuicao,
): Promise<OwnershipResolution> {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id,full_name,name,role,commercial_role,reports_to,active,availability_status,max_active_leads")
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (error) throw new Error(`Falha ao carregar perfis para distribuição: ${error.message}`);
  const active = (profiles ?? []) as ProfileRow[];
  const activeIds = new Set(active.map((p) => p.id));

  // Quem está com o WhatsApp conectado AGORA. Uma consulta só para a
  // organização inteira — perguntar por pessoa faria N consultas no caminho
  // quente de toda lead que entra. Levantada ANTES do degrau 1 porque agora
  // TODO degrau depende dela.
  const conectados = new Set<string>();
  {
    const { data } = await admin
      .from("whatsapp_broker_sessions")
      .select("profile_id")
      .eq("organization_id", organizationId)
      .eq("status", "conectado");
    for (const linha of data ?? []) {
      if (typeof linha.profile_id === "string") conectados.add(linha.profile_id);
    }
  }

  // 1) Dono padrão da fonte — validado, nunca às cegas.
  if (defaultOwnerId) {
    const owner = active.find((p) => p.id === defaultOwnerId);
    // Nem o dono padrão escapa: a regra é receber lead exige WhatsApp
    // conectado, e abrir exceção para o degrau 1 seria a porta pela qual a
    // regra deixaria de valer na prática — é justamente o caminho que mais
    // lead percorre quando a fonte tem dono definido.
    if (owner && conectados.has(owner.id)) {
      return {
        ownerId: owner.id,
        tier: "source_default",
        reason: `Dono padrão da fonte: ${displayName(owner)} (ativo, validado).`,
      };
    }
    // Cai para a cascata com o motivo registrado no reason final.
  }
  const donoPadrao = defaultOwnerId ? active.find((p) => p.id === defaultOwnerId) : null;
  const defaultNote = !defaultOwnerId
    ? ""
    : !donoPadrao
      ? "Dono padrão da fonte inativo/inexistente; "
      : !conectados.has(donoPadrao.id)
        ? `Dono padrão (${displayName(donoPadrao)}) está sem WhatsApp conectado; `
        : "";

  // 2) Corretores elegíveis: ativos, disponíveis, cadeia íntegra, dentro da capacidade.
  const brokersDisponiveis = active.filter((p) =>
    normalizedRole(p) === "broker" &&
    (p.availability_status ?? "AVAILABLE") === "AVAILABLE" &&
    p.reports_to !== null && activeIds.has(p.reports_to),
  );
  // A regra nova, aplicada por último para que a contagem abaixo saiba
  // distinguir "não tem corretor" de "os corretores estão sem WhatsApp".
  const brokers = brokersDisponiveis.filter((p) => conectados.has(p.id));
  const semWhatsapp = brokersDisponiveis.length - brokers.length;
  const brokerCandidates: Candidate[] = [];
  for (const profile of brokers) {
    const load = await openLeadCount(admin, organizationId, profile.id);
    const capacity = profile.max_active_leads ?? DEFAULT_CAPACITY;
    if (load >= capacity) continue;
    brokerCandidates.push({ profile, load, lastAssigned: await lastAssignmentAt(admin, organizationId, profile.id) });
  }

  // ── O ELENCO DO ESCOPO ──────────────────────────────────────────────────
  //
  // Entra AQUI, depois dos filtros de disponibilidade, e a ordem é o ponto:
  // assim "o elenco esvaziou" significa exatamente "o time deste projeto/
  // campanha existe mas ninguém dele pode atender agora" — que é o que o
  // gerente precisa ler. Filtrar antes confundiria "não está no time" com
  // "está indisponível".
  //
  // Sem elenco cadastrado nada muda: `permitidos: null` deixa a lista intacta.
  const elenco = resolverElenco(escopo ?? {}, await carregarElenco(admin, organizationId, escopo));
  const filtrado = aplicarElenco(
    brokerCandidates.map((c) => ({ id: c.profile.id, candidato: c })),
    elenco,
  );
  const notaElenco = elenco.decididoPor === "sem-elenco" ? "" : `${filtrado.porque} `;

  const broker = filtrado.elencoEsvaziou ? null : pickLeastLoaded(filtrado.elegiveis.map((x) => x.candidato));
  if (broker) {
    return {
      ownerId: broker.profile.id,
      tier: "broker",
      reason: `${defaultNote}${notaElenco}cascata hierárquica: corretor com menor carga (${displayName(broker.profile)}, ${broker.load} leads abertos).`.trim(),
    };
  }

  // 3) Gerentes seguram a fila (sem teto — alguém precisa ser o dono visível).
  // Se corretores foram barrados por falta de WhatsApp, isso precisa estar
  // ESCRITO no histórico. Lead empilhando no gerente sem explicação é o tipo de
  // sintoma que se investiga por semanas.
  const notaElencoVazio = filtrado.elencoEsvaziou ? `${filtrado.porque} ` : "";
  const notaWhatsapp = semWhatsapp > 0
    ? `${semWhatsapp} corretor(es) disponível(is) fora do rodízio por estar(em) sem WhatsApp conectado; `
    : "";
  // O gerente também precisa estar conectado. A regra é "receber lead exige
  // WhatsApp", e gerente que segura fila ESTÁ recebendo lead — a lead fica no
  // nome dele, o SLA corre contra ele, e o cliente espera resposta dele.
  //
  // Isentar o gerente faria dele o ralo por onde a regra escoaria: bastaria
  // ninguém conectar para tudo cair nele, e o incentivo de conectar sumiria.
  const gerentesDisponiveis = active.filter((p) => normalizedRole(p) === "manager");
  const managers = gerentesDisponiveis.filter((p) => conectados.has(p.id));
  const gerentesSemWhatsapp = gerentesDisponiveis.length - managers.length;
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
      reason: `${defaultNote}${notaElencoVazio}${notaWhatsapp}sem corretor elegível (disponível, com WhatsApp conectado e com capacidade); gerente conectado com menor carga segura a fila (${displayName(manager.profile)}).`.trim(),
    };
  }

  // 4) REPRESADA — ninguém conectado, ninguém recebe.
  //
  // A regra do dono do produto: receber lead exige WhatsApp conectado, para
  // corretor E para gerente. Quando ninguém está, a lead NÃO é empurrada para
  // alguém que não pode atendê-la — fica sem dono, visível para o diretor
  // distribuir à mão.
  //
  // É deliberadamente incômodo. Lead sem dono aparece como problema no
  // Command Center, e o problema tem uma solução de trinta segundos: alguém
  // conectar o WhatsApp. Atribuir a quem está desconectado seria esconder isso
  // e deixar a lead esfriando no nome de quem não vai vê-la.
  const notaGerente = gerentesSemWhatsapp > 0
    ? `${gerentesSemWhatsapp} gerente(s) também sem WhatsApp conectado; `
    : "";
  return {
    ownerId: null,
    tier: "unassigned",
    reason: `${defaultNote}${notaElencoVazio}${notaWhatsapp}${notaGerente}REPRESADA: ninguém com WhatsApp conectado para receber. O diretor distribui pelo Command Center, ou alguém conecta e a próxima entra sozinha.`.trim(),
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


/**
 * Busca o elenco do escopo. Uma consulta só, filtrada pelos ids que interessam —
 * carregar o elenco inteiro da organização a cada lead seria pagar por dados que
 * não serão usados no caminho mais quente do produto.
 *
 * Falha de leitura devolve lista VAZIA em vez de derrubar: sem elenco a fila
 * volta a ser aberta, que é o comportamento anterior. Distribuir para a equipe
 * inteira é ruim; não distribuir é pior.
 */
async function carregarElenco(
  admin: SupabaseClient,
  organizationId: string,
  escopo: EscopoDeDistribuicao | undefined,
): Promise<MembroDoElenco[]> {
  const ids = [escopo?.projetoId, escopo?.campanhaId].filter(Boolean) as string[];
  if (ids.length === 0) return [];
  const { data, error } = await admin
    .from("distribution_roster")
    .select("escopo,escopo_id,profile_id,ativo")
    .eq("organization_id", organizationId)
    .eq("ativo", true)
    .in("escopo_id", ids);
  if (error) return [];
  return (data ?? []).map((r) => ({
    escopo: r.escopo as "projeto" | "campanha",
    escopoId: String(r.escopo_id),
    profileId: String(r.profile_id),
    ativo: Boolean(r.ativo),
  }));
}
