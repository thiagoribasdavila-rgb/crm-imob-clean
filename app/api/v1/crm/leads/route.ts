import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { filtroDaMinhaCarteira, leSoAPropriaCarteira } from "@/lib/crm/escopo-de-leitura";
import {
  canonicalCommercialRole,
  compatibleLeadStatuses,
  LIVE_LEAD_SELECT,
  LIVE_LEAD_SELECT_WITH_SLA,
  LIVE_PROFILE_SELECT,
  isMissingColumn,
  liveLeadSortColumn,
  mapLegacyLead,
  mapLegacyProfile,
} from "@/lib/compat/legacy-v2";

export const dynamic = "force-dynamic";

const allowedSorts = new Set(["created_at", "updated_at", "score", "name", "first_contact_sla"]);
const allowedDirections = new Set(["asc", "desc"]);
const allowedAttentionFilters = new Set(["overdue", "no_action", "hot", "unassigned"]);
const allowedNextActionFilters = new Set(["today", "next_7_days", "scheduled"]);

function clampLimit(raw: string | null) {
  const parsed = Number(raw ?? "25");
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(100, Math.max(1, Math.trunc(parsed)));
}

function clampPage(raw: string | null) {
  const parsed = Number(raw ?? "1");
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.trunc(parsed));
}

function scoreFilter(raw: string | null) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, Math.trunc(parsed)));
}

function campaignFilters(raw: string | null) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[0-9a-f-]{36}$/i.test(value))
    .slice(0, 50);
}
const uuidPattern = /^[0-9a-f-]{36}$/i;
const terminalStorageStatuses = ["ganho", "GANHO", "venda", "VENDA", "vendido", "VENDIDO", "perdido", "PERDIDO", "comprou_outro", "COMPROU_OUTRO"];

type CompatibleProfile = Record<string, unknown> & {
  id: string;
  team: string | null;
  commercial_role: string;
};

function profileTeamScope(profiles: CompatibleProfile[], ownerId: string) {
  const owner = profiles.find((profile) => profile.id === ownerId);
  if (!owner) return [];
  const team = String(owner.team || "").trim().toLocaleLowerCase("pt-BR");
  if (!team) return [owner.id];
  return profiles
    .filter((profile) => String(profile.team || "").trim().toLocaleLowerCase("pt-BR") === team)
    .map((profile) => profile.id);
}

function decodeCursor(raw: string | null): { createdAt: string; id: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null;
    if (!/^\d{4}-\d{2}-\d{2}T/.test(parsed.createdAt)) return null;
    if (!/^[0-9a-f-]{36}$/i.test(parsed.id)) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(row: Record<string, unknown> | undefined) {
  const createdAt = typeof row?.created_at === "string" ? row.created_at : null;
  const id = typeof row?.id === "string" ? row.id : null;
  if (!createdAt || !id) return null;
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url");
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 120, windowMs: 60_000, scope: "crm.leads.list" });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker", "viewer"],
  });
  if (!access.ok) return access.response;

  const params = request.nextUrl.searchParams;
  const limit = clampLimit(params.get("limit"));
  const page = clampPage(params.get("page"));
  const status = params.get("status")?.trim() || null;
  const source = params.get("source")?.trim() || null;
  const assignedTo = params.get("assigned_to")?.trim() || null;
  const developmentId = params.get("development_id")?.trim() || null;
  const teamOwner = params.get("team_owner")?.trim() || null;
  const minScore = scoreFilter(params.get("min_score"));
  const maxScore = scoreFilter(params.get("max_score"));
  const campaignIds = campaignFilters(params.get("campaign_ids"));
  const search = params.get("q")?.trim() || null;
  const sort = allowedSorts.has(params.get("sort") ?? "") ? params.get("sort")! : "created_at";
  const direction = allowedDirections.has(params.get("direction") ?? "")
    ? (params.get("direction") as "asc" | "desc")
    : "desc";
  const cursor = decodeCursor(params.get("cursor"));
  const attention = allowedAttentionFilters.has(params.get("attention") ?? "")
    ? params.get("attention")
    : null;
  const nextAction = allowedNextActionFilters.has(params.get("next_action") ?? "")
    ? params.get("next_action")
    : null;

  if (teamOwner && assignedTo) {
    return apiError("AMBIGUOUS_OWNER_FILTER", "Escolha uma equipe ou um corretor, não os dois ao mesmo tempo.", access.meta, {
      status: 400,
      headers: rate.headers,
    });
  }
  if (assignedTo && assignedTo !== "unassigned" && !uuidPattern.test(assignedTo)) {
    return apiError("INVALID_OWNER", "Corretor inválido.", access.meta, { status: 400, headers: rate.headers });
  }
  if (developmentId && !uuidPattern.test(developmentId)) {
    return apiError("INVALID_DEVELOPMENT", "Projeto inválido.", access.meta, { status: 400, headers: rate.headers });
  }

  if (params.has("cursor") && !cursor) {
    return apiError("INVALID_CURSOR", "Cursor de paginação inválido.", access.meta, {
      status: 400,
      headers: rate.headers,
    });
  }

  const usePagePagination = params.has("page");
  const offset = (page - 1) * limit;
  const storageSort = liveLeadSortColumn(sort);
  // ── PISO DE CARTEIRA ──────────────────────────────────────────────────────
  //
  // Medido em 2026-07-28 com um corretor descartável de ZERO leads: esta rota
  // devolvia as 200 leads da imobiliária. O filtro de dono só existia quando o
  // CLIENTE pedia (`assigned_to`/`team_owner`) — quem não pedisse via tudo.
  //
  // O Kanban (GET /api/v1/pipeline) já tinha o piso: liderança vê o funil
  // inteiro, corretor vê a própria carteira. Duas telas do MESMO dado com
  // regras opostas é a divergência que atravessou esta sessão — e aqui ela
  // vaza carteira entre colegas, não só confunde.
  //
  // Lead SEM dono continua visível para todos, de propósito: ela precisa ser
  // vista por alguém para ser adotada; escondê-la de quem não é liderança a
  // deixaria parada até alguém abrir um relatório.
  const soAMinhaCarteira = leSoAPropriaCarteira(access.access.profile);

  // Resolver o escopo da equipe exige consulta e pode recusar o pedido; fica
  // fora do construtor da query, que precisa poder ser executado duas vezes.
  let escopoDeEquipe: string[] | null = null;
  let donoUnico: string | null = null;
  if (teamOwner || (assignedTo && assignedTo !== "unassigned")) {
    const { data: visibleProfiles, error: profilesError } = await access.supabase
      .from("profiles")
      .select(LIVE_PROFILE_SELECT)
      .eq("organization_id", access.access.organization.id)
      .eq("active", true);
    if (profilesError) return apiError("TEAM_SCOPE_FAILED", "Não foi possível validar o escopo da equipe.", access.meta, { status: 500, headers: rate.headers });

    const profiles = ((visibleProfiles ?? []) as Record<string, unknown>[]).map(mapLegacyProfile) as CompatibleProfile[];

    if (assignedTo && assignedTo !== "unassigned") {
      const owner = profiles.find((profile) => profile.id === assignedTo);
      if (!owner) return apiError("OWNER_OUT_OF_SCOPE", "Responsável fora do seu escopo comercial.", access.meta, { status: 403, headers: rate.headers });
    }
    if (teamOwner) {
      if (!uuidPattern.test(teamOwner)) return apiError("INVALID_TEAM", "Gerente inválido.", access.meta, { status: 400, headers: rate.headers });
      const manager = profiles.find((profile) => profile.id === teamOwner);
      if (!manager || canonicalCommercialRole(manager.commercial_role) !== "manager") return apiError("TEAM_OUT_OF_SCOPE", "Equipe fora do seu escopo comercial.", access.meta, { status: 403, headers: rate.headers });
      escopoDeEquipe = profileTeamScope(profiles, manager.id);
    } else if (assignedTo) donoUnico = assignedTo;
  }

  // A fila do corretor precisa poder ser ordenada por URGÊNCIA, não por data de
  // entrada: lead que vence em 3 minutos vale mais que lead que chegou primeiro.
  // Como a coluna do prazo só existe em banco com a fase 34 aplicada, a consulta
  // é montável duas vezes — com e sem SLA — e a segunda cobre o banco legado.
  const ordenarPorSla = sort === "first_contact_sla";

  const montarConsulta = (colunas: string, comSla: boolean) => {
    let query = access.supabase
      .from("leads")
      .select(colunas, { count: usePagePagination ? "exact" : undefined })
      .eq("organization_id", access.access.organization.id)
      .not("status", "in", "(arquivado,ARQUIVADO,archived,ARCHIVED)");
    // Fora da janela de recuperação, a lead deixou de ser problema de SLA e virou
    // problema de reativação. Medido no smoke de ciclo em 2026-07-26: com 201
    // leads vencidas há mais de 48h, uma lead NOVA de 5 minutos caía além da
    // posição 100 — ou seja, a fila "por urgência" abria pelas leads menos
    // recuperáveis e escondia a única que ainda virava conversa.
    //
    // Ordenar cru por prazo crescente era literal e inútil. O recorte é o mesmo
    // limite que o vigia já usa, e o mesmo motivo.
    const janelaDeRecuperacaoMin = Number(process.env.ATLAS_SLA_JANELA_RECUPERACAO_MIN || 2880);
    const inicioDaJanela = new Date(Date.now() - janelaDeRecuperacaoMin * 60_000).toISOString();

    query = comSla && ordenarPorSla
      // Prazo mais próximo primeiro, e quem não tem prazo vai para o fim: sem
      // nullsFirst:false o banco jogaria as leads sem medição para o topo da fila.
      ? query
          .gte("first_contact_due_at", inicioDaJanela)
          .order("first_contact_due_at", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
      : query
          .order(storageSort, { ascending: direction === "asc" })
          .order("id", { ascending: direction === "asc" });

    query = usePagePagination
      ? query.range(offset, offset + limit - 1)
      : query.limit(limit + 1);

    if (status) query = query.in("status", compatibleLeadStatuses(status));
    if (source) query = query.eq("source", source);
    // O filtro por empreendimento consultava `project_id`, coluna vazia em
    // TODAS as 217 leads desta base. A coluna com dado é `development_id`
    // (174 leads). Resultado medido antes da correção: escolher "Inside
    // Perdizes" devolvia ZERO — com 174 leads dentro dele.
    //
    // Filtro que devolve vazio é pior que filtro ausente: quem escolhe o
    // empreendimento e vê a lista limpar conclui que não há lead ali, e vai
    // embora. É o mesmo par legado/canônico que já mordeu a ingestão
    // (assigned_user_id vs assigned_to); aqui aceitamos os DOIS, porque a base
    // tem histórico nas duas colunas e escolher uma só perderia leads de um
    // dos lados.
    if (developmentId) {
      query = query.or(`development_id.eq.${developmentId},project_id.eq.${developmentId}`);
    }
    if (escopoDeEquipe) query = query.in("assigned_user_id", escopoDeEquipe);
    else if (donoUnico) query = query.eq("assigned_user_id", donoUnico);
    else if (assignedTo === "unassigned") query = query.is("assigned_user_id", null);
    else if (soAMinhaCarteira) {
      // As DUAS colunas de posse, pelo mesmo motivo do filtro de empreendimento
      // logo acima: a base tem histórico nos dois lados e escolher uma só
      // esconderia parte da própria carteira do corretor.
      query = query.or(filtroDaMinhaCarteira(access.access.user.id));
    }
    if (minScore !== null) query = query.gte("score_ia", minScore);
    if (maxScore !== null) query = query.lte("score_ia", maxScore);
    // ── Próxima ação: `next_action_at` é a coluna canônica ──────────────────
    //
    // Todos estes filtros consultavam `next_contact`, coluna vazia em TODAS as
    // 217 leads desta base. A coluna com dado é `next_action_at`. Medido: as
    // opções "Atrasadas", "Agendada", "Hoje" e "Próximos 7 dias" NUNCA
    // devolviam nada — quatro filtros que o corretor tenta, vê a lista vazia, e
    // conclui que não há trabalho.
    //
    // Aceitamos as DUAS colunas: a base tem histórico nas duas e escolher uma
    // só perderia registros de um dos lados. Mesma decisão do filtro por
    // empreendimento, logo acima.
    const emAlgumaProxima = (expressao: (coluna: string) => string) =>
      `${expressao("next_action_at")},${expressao("next_contact")}`;

    if (attention) {
      query = query.not("status", "in", `(${terminalStorageStatuses.join(",")})`);
      const agora = new Date().toISOString();
      if (attention === "overdue") {
        query = query.or(emAlgumaProxima((c) => `${c}.lt.${agora}`));
      }
      if (attention === "no_action") {
        // AND das duas: só é "sem próxima ação" quem não tem em nenhuma das
        // colunas. Conferir só a legada devolveria a base inteira e continuaria
        // dizendo "sem ação" para quem acabou de agendar uma.
        query = query.is("next_action_at", null).is("next_contact", null);
      }
      if (attention === "hot") query = query.or("temperature.ilike.quente,score_ia.gte.70");
      if (attention === "unassigned") query = query.is("assigned_user_id", null);
    }
    if (nextAction) {
      query = query
        .not("status", "in", `(${terminalStorageStatuses.join(",")})`)
        .or(emAlgumaProxima((c) => `${c}.not.is.null`));
      const now = new Date();
      const janela = (inicio: Date, fim?: Date) =>
        emAlgumaProxima((c) => fim
          ? `and(${c}.gte.${inicio.toISOString()},${c}.lte.${fim.toISOString()})`
          : `${c}.gte.${inicio.toISOString()}`);

      if (nextAction === "scheduled") query = query.or(janela(now));
      if (nextAction === "today") {
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        query = query.or(janela(now, end));
      }
      if (nextAction === "next_7_days") {
        query = query.or(janela(now, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)));
      }
    }
    if (campaignIds.length) query = query.in("campaign_id", campaignIds);
    if (search) {
      const escaped = search.replace(/[,%()]/g, " ").trim();
      if (escaped) query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
    }

    if (!usePagePagination && cursor && sort === "created_at") {
      const operator = direction === "desc" ? "lt" : "gt";
      query = query.or(
        `created_at.${operator}.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.${operator}.${cursor.id})`,
      );
    }

    return query;
  };

  let comSla = true;
  let resultado = await montarConsulta(LIVE_LEAD_SELECT_WITH_SLA, true);
  if (resultado.error && isMissingColumn(resultado.error)) {
    // Banco sem a fase 34: a lista continua funcionando, apenas sem prazo — e a
    // resposta diz isso, para a tela não confundir "sem medição" com "no prazo".
    comSla = false;
    resultado = await montarConsulta(LIVE_LEAD_SELECT, false);
  }
  const { data, error, count } = resultado;

  if (error) {
    structuredApiLog("error", "crm.leads.list_failed", request, access.meta, {
      organizationId: access.access.organization.id,
      message: error.message,
    });
    return apiError("LEADS_QUERY_FAILED", "Não foi possível carregar os leads.", access.meta, {
      status: 500,
      headers: rate.headers,
    });
  }

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(mapLegacyLead);
  const hasMore = usePagePagination
    ? offset + rows.length < (count ?? 0)
    : rows.length > limit;
  const items = !usePagePagination && hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = !usePagePagination && hasMore && sort === "created_at"
    ? encodeCursor(items[items.length - 1])
    : null;
  const total = usePagePagination ? count ?? 0 : null;
  const pages = total === null ? null : Math.max(1, Math.ceil(total / limit));

  structuredApiLog("info", "crm.leads.list_success", request, access.meta, {
    organizationId: access.access.organization.id,
    count: items.length,
    hasMore,
  });

  return apiSuccess(
    {
      items,
      page: {
        limit,
        number: usePagePagination ? page : null,
        total,
        pages,
        hasMore,
        nextCursor,
      },
      /**
       * Que recorte a rota aplicou por conta própria. "carteira" significa que
       * o piso de dono entrou mesmo sem o cliente pedir — a tela precisa saber
       * disso para não afirmar "todos os leads" mostrando parte deles.
       */
      escopo: soAMinhaCarteira ? "carteira" : "organizacao",
      filters: {
        status,
        source,
        assignedTo,
        developmentId,
        teamOwner,
        minScore,
        maxScore,
        campaignIds,
        search,
        sort,
        direction,
        attention,
        nextAction,
      },
      compatibility: {
        canonicalContract: "lead-v1",
        storageContract: "atlas-live-legacy",
        databasePagination: true,
        // A tela precisa saber a diferença entre "ninguém tinha prazo" e "este
        // banco não mede prazo". Sem esse sinal, a fila por SLA cairia
        // silenciosamente para ordem por data de entrada sem avisar ninguém.
        firstContactSlaDisponivel: comSla,
        // Quando a fila é a de urgência, ela mostra só o que ainda se recupera.
        // Dizer isso evita que "20 leads na fila" seja lido como "20 leads na
        // carteira" — o acervo antigo continua existindo, em outro lugar.
        filaRecortadaPorRecuperacao: comSla && ordenarPorSla,
      },
    },
    access.meta,
    { headers: rate.headers },
  );
}
