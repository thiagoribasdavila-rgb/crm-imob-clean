/**
 * MOVER VÁRIAS LEADS DE ETAPA DE UMA VEZ.
 *
 * ── Por que isto passou a ser necessário ────────────────────────────────────
 *
 * As 174 leads do Inside não estão em "novo" porque ninguém as trabalhou —
 * estão porque o CRM nunca soube. O histórico vive fora dele, com o corretor,
 * e amanhã ele vem trazer isso para dentro.
 *
 * Uma a uma, isso é abrir 174 telas. A meia hora de trabalho real vira uma
 * tarde de clique, e o que se perde no caminho não é tempo: é a vontade de
 * manter o CRM em dia, que nunca volta depois que se perde.
 *
 * Já existia ação em lote — `bulk-transfer` — mas só para trocar o corretor.
 * Este é o par que faltava.
 *
 * ── O que ele NÃO faz, de propósito ─────────────────────────────────────────
 *
 * Não fecha lead em massa. `ganho` e `perdido` estão fora: são os dois desfechos
 * que disparam evento de conversão para a Meta e alimentam o algoritmo. Marcar
 * 50 vendas por engano ensina a Meta a caçar o público errado, e não há desfazer
 * — o aprendizado já aconteceu. Fechar continua sendo uma lead por vez, com a
 * tela inteira na frente.
 *
 * Também não mexe em dono, em tarefa nem em consentimento. Uma ação em lote que
 * faz várias coisas é uma ação que ninguém consegue prever.
 */

import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canonicalPipelineStage } from "@/lib/atlas/pipeline-stages";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Etapas que podem ser aplicadas em massa.
 *
 * `ganho` e `perdido` ficam fora: viram evento de conversão na Meta, e engano
 * em massa ali não tem desfazer.
 */
const ETAPAS_EM_LOTE = new Set(["novo", "contato", "qualificacao", "visita", "proposta", "contrato"]);

/** Teto por chamada. Acima disso, o operador confere o que selecionou. */
const MAXIMO = 200;

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 15, windowMs: 60_000, scope: "crm.leads.bulk-stage" });
  if (!rate.ok) return rate.response;

  // ── QUEM MOVE EM LOTE ─────────────────────────────────────────────────────
  //
  // Era só liderança, pela mesma alçada do bulk-transfer. Só que TRANSFERIR
  // muda o dono da lead — ato de quem responde pela carteira — e MOVER DE ETAPA
  // é o trabalho diário de quem atende.
  //
  // Medido em 2026-07-28: o corretor tem 174 leads em "novo" e movia uma a uma.
  // Um dia inteiro de cliques para registrar o que ele já sabe. O lote é a
  // ferramenta certa para isso, e negá-la a quem tem o volume é negar a
  // ferramenta a quem precisa dela.
  //
  // O corretor entra, com DUAS travas que já existiam e continuam valendo:
  //   · `ETAPAS_EM_LOTE` exclui "ganho" e "perdido" — fechar 50 leads por
  //     engano ensina a Meta a caçar o público errado e não tem desfazer;
  //   · o update prende `organization_id`, e abaixo prendemos também o DONO:
  //     lote de corretor só alcança lead dele.
  const access = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker"],
  });
  if (!access.ok) return access.response;
  const papel = access.access.profile.commercialRole || access.access.profile.role;
  const soAsMinhas = !["admin", "director", "superintendent", "manager"].includes(String(papel || ""));

  let body: { leadIds?: unknown; stage?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("INVALID_JSON", "Envie os dados em formato válido.", access.meta, { status: 400 });
  }

  const leadIds = Array.isArray(body.leadIds)
    ? [...new Set(body.leadIds.filter((id): id is string => typeof id === "string" && UUID.test(id)))]
    : [];
  const stage = canonicalPipelineStage(body.stage);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  if (!leadIds.length) {
    return apiError("NO_LEADS", "Selecione ao menos uma lead.", access.meta, { status: 422 });
  }
  if (leadIds.length > MAXIMO) {
    return apiError("TOO_MANY",
      `São ${leadIds.length} leads de uma vez. O limite é ${MAXIMO} — divida a seleção e confira o que está movendo.`,
      access.meta, { status: 422 });
  }
  if (!stage) {
    return apiError("STAGE_INVALID", "Etapa desconhecida.", access.meta, { status: 422 });
  }
  if (!ETAPAS_EM_LOTE.has(stage)) {
    return apiError("STAGE_NOT_BULKABLE",
      `"${stage}" não pode ser aplicada em massa: fechar lead dispara evento de conversão para a Meta, e engano em massa ali não tem desfazer. Feche uma por vez.`,
      access.meta, { status: 422 });
  }

  const admin = getSupabaseAdmin();
  const organizationId = access.access.organization.id;
  const agora = new Date().toISOString();

  // A organização entra no WHERE, não só na leitura: sem isso um id de outra
  // organização passaria batido no meio de 200.
  let atualizacao = admin
    .from("leads")
    .update({ status: stage, updated_at: agora })
    .in("id", leadIds)
    .eq("organization_id", organizationId);

  // O DONO entra no WHERE pelo mesmo motivo que a organização: o lote do
  // corretor alcança só a carteira dele. Liderança segue vendo o funil inteiro.
  // Fica no WHERE (e não numa checagem prévia) porque conferir antes e gravar
  // depois é a corrida clássica — a lead muda de dono entre as duas consultas.
  // O que não pertence não é bloqueado com erro: sai da lista de movidas e é
  // relatado abaixo, junto com o resto que não moveu.
  //
  // `user.id` e não `profile.id`: a coluna guarda o id do usuário. Medido em
  // 2026-07-28 que os dois coincidem hoje (18/18 profiles com id = id do auth,
  // 196/196 leads batendo), e é por isso que as duas rotas que comparam dono de
  // formas diferentes — leads/[id] com `identity.userId`, leads/[id]/objections
  // com `profile.id` — funcionam ambas. No dia em que `profiles` ganhar id
  // próprio, uma delas para de bater sem erro nenhum. Aqui fica a forma certa.
  if (soAsMinhas) {
    const dono = access.access.user.id;
    atualizacao = atualizacao.or(`assigned_user_id.eq.${dono},assigned_to.eq.${dono}`);
  }

  const { data: movidas, error } = await atualizacao.select("id");

  if (error) {
    return apiError("BULK_STAGE_FAILED", "Não foi possível mover as leads.", access.meta, { status: 503 });
  }

  const movidasIds = (movidas ?? []).map((l) => l.id as string);
  // O que não moveu importa tanto quanto o que moveu: silenciar a diferença
  // faria o operador achar que 200 foram e conferir só na semana seguinte.
  const naoMovidas = leadIds.filter((id) => !movidasIds.includes(id));

  structuredApiLog("info", "crm.leads.bulk_stage_success", request, access.meta, {
    organizationId,
    actorId: access.access.profile.id,
    stage,
    solicitadas: leadIds.length,
    movidas: movidasIds.length,
    naoMovidas: naoMovidas.length,
    reason,
  });

  return apiSuccess({
    stage,
    solicitadas: leadIds.length,
    movidas: movidasIds.length,
    naoMovidas: naoMovidas.length,
    aviso: naoMovidas.length
      ? `${naoMovidas.length} lead(s) não mudaram — fora desta organização ou já removidas.`
      : null,
  }, access.meta, { headers: rate.headers });
}
