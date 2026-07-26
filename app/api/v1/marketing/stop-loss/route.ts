import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { avaliarStopLoss, resumoDoStopLoss } from "@/lib/marketing/stop-loss";

export const dynamic = "force-dynamic";

/**
 * STOP LOSS DE MARKETING — leitura do estado e veredito.
 *
 * O motor (lib/marketing/stop-loss) é puro; esta rota só o alimenta com o que o
 * banco e o ambiente sabem hoje. O que não dá para saber entra como `null`, e o
 * veredito o reporta em `naoAvaliado` — nunca como zero.
 *
 * A rota NÃO executa nada: não pausa campanha, não corta verba, não chama a
 * Meta. Devolve decisão para virar proposta na Caixa de Aprovações. É a mesma
 * fronteira de todo o resto: a máquina executa o reversível e propõe o
 * irreversível, e mexer em verba é irreversível dentro do dia.
 *
 * O teto do período vem por parâmetro ou por ATLAS_MARKETING_BUDGET_CEILING.
 * Sem teto acordado, as regras de verba não rodam — cobrar meta que ninguém
 * combinou é inventar régua.
 */

const DIAS_DO_PERIODO = 30;

/**
 * Mede o estado e roda o motor. Existe como função porque o POST **repete a
 * medição** em vez de acreditar no que a tela mandou: entre carregar a página e
 * clicar em "levar para aprovação" a operação pode ter contatado as leads
 * atrasadas, e propor corte de verba por um número que já não vale seria mover
 * dinheiro com base em tela velha.
 */
async function medirEAvaliar(
  organizationId: string,
  opcoes: { teto?: number | null; cplAlvo?: number | null },
) {
  const teto = Number.isFinite(opcoes.teto) && (opcoes.teto ?? 0) > 0
    ? Number(opcoes.teto)
    : Number(process.env.ATLAS_MARKETING_BUDGET_CEILING) || 0;
  const cplAlvo = Number.isFinite(opcoes.cplAlvo) && (opcoes.cplAlvo ?? 0) > 0
    ? Number(opcoes.cplAlvo)
    : Number(process.env.ATLAS_MARKETING_TARGET_CPL) || null;

  const admin = getSupabaseAdmin();
  const inicio = new Date(Date.now() - DIAS_DO_PERIODO * 86_400_000).toISOString();
  const agora = new Date().toISOString();

  const [gasto, recebidas, contatadas, slaVencido, semDono, corretores, fontes] = await Promise.all([
    // marketing_spend só tem linha quando a conta de anúncios responde. Zero
    // linhas significa "não sei", e não "gastou zero" — a diferença decide se o
    // stop loss avalia custo ou se declara cegueira.
    admin.from("marketing_spend").select("amount").eq("organization_id", organizationId).gte("date", inicio.slice(0, 10)),
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).not("campaign_id", "is", null).gte("created_at", inicio),
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).not("campaign_id", "is", null).gte("created_at", inicio)
      .not("first_contacted_at", "is", null),
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).not("campaign_id", "is", null)
      .is("first_contacted_at", null).lt("first_contact_due_at", agora),
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).not("campaign_id", "is", null).is("assigned_user_id", null),
    admin.from("profiles").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).eq("active", true).eq("commercial_role", "broker"),
    admin.from("meta_lead_sources").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).eq("active", false),
  ]);

  const linhasDeGasto = (gasto.data ?? []) as Array<{ amount: number | null }>;
  const gastoConhecido = !gasto.error && linhasDeGasto.length > 0;
  const somaGasta = gastoConhecido
    ? linhasDeGasto.reduce((soma, l) => soma + Number(l.amount ?? 0), 0)
    : null;

  // Represa exige chamada à Meta e é ação sob demanda; aqui entra zero e a
  // ressalva vai no texto, para o número não parecer medido quando não foi.
  const veredito = avaliarStopLoss(
    {
      teto,
      gasto: somaGasta,
      // Fração do período decorrida é sempre 1 numa janela móvel de 30 dias
      // fechada em hoje — o que anula a regra de ritmo. Mantida explícita para
      // quando o período passar a ser calendário (mês fechado).
      fracaoDecorrida: 1,
      cplAlvo,
    },
    {
      leadsRecebidas: recebidas.count ?? 0,
      leadsContatadas: contatadas.count ?? 0,
      leadsComSlaVencido: slaVencido.count ?? 0,
      leadsSemDono: semDono.count ?? 0,
      leadsRepresadas: 0,
      corretoresAtivos: corretores.count ?? 0,
    },
  );

  const ressalvas = [
    !teto ? "Nenhum teto de verba acordado: defina ATLAS_MARKETING_BUDGET_CEILING ou informe ?teto= para ligar as regras de orçamento." : null,
    (fontes.count ?? 0) > 0
      ? `${fontes.count} fonte(s) de lead inativas — a represa não entra nesta conta. Apure em Marketing → Leads represadas.`
      : null,
  ].filter(Boolean);

  return { veredito, teto, cplAlvo, somaGasta, gastoConhecido, ressalvas };
}

function ehLideranca(papel: string) {
  return ["director", "superintendent", "manager", "admin"].includes(papel);
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "marketing.stop-loss" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!ehLideranca(papel)) {
    return apiError("FORBIDDEN", "Stop loss de verba é da liderança comercial.", access.meta, { status: 403, headers: rate.headers });
  }

  const url = new URL(request.url);
  const organizationId = access.access.organization.id;
  const medicao = await medirEAvaliar(organizationId, {
    teto: Number(url.searchParams.get("teto")),
    cplAlvo: Number(url.searchParams.get("cplAlvo")),
  });

  structuredApiLog("info", "marketing.stop_loss_avaliado", request, access.meta, {
    organizationId,
    acao: medicao.veredito.acao,
    decisoes: medicao.veredito.decisoes.length,
    gastoConhecido: medicao.gastoConhecido,
  });

  return apiSuccess({
    periodoDias: DIAS_DO_PERIODO,
    orcamento: { teto: medicao.teto || null, gasto: medicao.somaGasta, cplAlvo: medicao.cplAlvo },
    ...medicao.veredito,
    resumo: resumoDoStopLoss(medicao.veredito),
    ressalvas: medicao.ressalvas,
    // Explícito no payload para não restar dúvida de leitura.
    governanca: {
      executaSozinho: false,
      exigeAprovacaoHumana: true,
      onde: "/approvals",
    },
  }, access.meta, { headers: rate.headers });
}

/**
 * LEVA UMA DECISÃO DO STOP LOSS PARA A CAIXA DE APROVAÇÕES.
 *
 * Até aqui o ciclo terminava na tela: a IA media, concluía "reduzir 30% na
 * campanha X", redigia a proposta — e alguém tinha que reescrever tudo à mão em
 * `/approvals`. Recomendação que exige redigitação é recomendação que não vira
 * ação nos dias corridos.
 *
 * O que esta rota faz é só o meio do caminho, de propósito:
 *
 *   mede → propõe → **para**.
 *
 * Ela cria uma linha `pending` em `approval_requests`. Não pausa campanha, não
 * corta verba, não chama a Meta. Quem decide é a liderança em `/approvals`, e a
 * execução continua sendo trabalho de outra rota, sob a mesma regra que vale
 * para tudo aqui: a máquina executa o reversível e propõe o irreversível.
 *
 * O corpo traz apenas `regra` — o identificador da decisão. NUNCA o texto, nem o
 * valor, nem a ação. Se a tela pudesse ditar o conteúdo da proposta, o stop loss
 * viraria formulário livre com aparência de análise.
 */
export async function POST(request: NextRequest) {
  // 10/min: propor é escrita de governança, e um laço de UI aqui encheria a
  // caixa da diretoria de propostas idênticas.
  const rate = enforceRateLimit(request, { limit: 10, windowMs: 60_000, scope: "marketing.stop-loss.propor" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!ehLideranca(papel)) {
    return apiError("FORBIDDEN", "Stop loss de verba é da liderança comercial.", access.meta, { status: 403, headers: rate.headers });
  }

  const corpo = (await request.json().catch(() => null)) as { regra?: string; teto?: number; cplAlvo?: number } | null;
  const regra = String(corpo?.regra ?? "").trim();
  if (!regra) {
    return apiError("REGRA_AUSENTE", "Informe qual decisão do stop loss deve virar proposta.", access.meta, { status: 400, headers: rate.headers });
  }

  const organizationId = access.access.organization.id;
  const medicao = await medirEAvaliar(organizationId, { teto: corpo?.teto, cplAlvo: corpo?.cplAlvo });
  const decisao = medicao.veredito.decisoes.find((d) => d.regra === regra);

  // A decisão sumiu entre a leitura e o clique: a operação corrigiu o que a
  // acionou. Recusar é o comportamento certo — propor corte por uma condição
  // que já não existe seria mexer em verba com base em tela velha.
  if (!decisao) {
    return apiError(
      "DECISAO_VENCIDA",
      "Esta decisão não consta mais na medição atual — a situação mudou desde que a tela carregou. Recarregue o stop loss.",
      access.meta,
      { status: 409, headers: rate.headers },
    );
  }

  const admin = getSupabaseAdmin();

  // Dedupe por regra: enquanto a diretoria não decidir sobre "cpl acima do
  // alvo", clicar de novo devolve a mesma proposta em vez de empilhar cópias.
  const { data: existente } = await admin
    .from("approval_requests")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("entity_type", "meta_campaign")
    .eq("status", "pending")
    .contains("payload", { kind: "stop_loss", regra })
    .limit(1);

  if (existente?.length) {
    return apiSuccess(
      { id: existente[0].id, jaExistia: true, regra },
      access.meta,
      { headers: rate.headers },
    );
  }

  const payload = {
    kind: "stop_loss",
    regra: decisao.regra,
    acao: decisao.acao,
    // O título é o que a diretoria lê primeiro na caixa: ação e regra, sem rodeio.
    title: `Stop loss · ${decisao.acao.toUpperCase()} — ${decisao.motivo}`,
    preview: decisao.proposta,
    reason: decisao.motivo,
    gravidade: decisao.gravidade,
    // `medida` ou `indicativa`: quem aprova precisa saber se o número veio da
    // conta de anúncios ou de inferência pela absorção da operação.
    confianca: decisao.confianca,
    orcamento: { teto: medicao.teto || null, gasto: medicao.somaGasta, cplAlvo: medicao.cplAlvo },
    // Congela o que o motor NÃO conseguiu avaliar. Aprovar sabendo do buraco é
    // decisão; aprovar sem saber é acidente.
    naoAvaliado: medicao.veredito.naoAvaliado,
    ressalvas: medicao.ressalvas,
    governance: {
      note: `${decisao.confianca === "medida" ? "Medido" : "Indicativo"} · gravidade ${decisao.gravidade}/5 · aprovar AUTORIZA a mudança, não a executa`,
      executaSozinho: false,
      // Dito no payload de propósito: aprovar aqui grava a autorização e quem
      // decidiu. NÃO pausa campanha nem mexe em verba na Meta — isso continua
      // passando por /api/v1/marketing/execute, com a mesma alçada. Aprovação
      // que executasse sozinha tiraria da diretoria o passo de conferir onde o
      // corte cai.
      executaAoAprovar: false,
    },
    propostoPor: access.access.profile.id,
  };

  const { data: criada, error } = await admin
    .from("approval_requests")
    .insert({
      organization_id: organizationId,
      request_type: "action_proposal",
      entity_type: "meta_campaign",
      status: "pending",
      payload,
      requested_by: access.access.profile.id,
      // 48h, e não os 7 dias das propostas de lead: condição de verba envelhece
      // rápido. Uma decisão de corte parada há uma semana foi tomada sobre
      // outro mês de gasto.
      expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    })
    .select("id")
    .single();

  if (error || !criada) {
    structuredApiLog("error", "marketing.stop_loss_proposta_falhou", request, access.meta, {
      organizationId, regra, erro: error?.message,
    });
    return apiError("PROPOSTA_FALHOU", "Não foi possível registrar a proposta.", access.meta, { status: 500, headers: rate.headers });
  }

  structuredApiLog("info", "marketing.stop_loss_proposta_criada", request, access.meta, {
    organizationId, regra, acao: decisao.acao, gravidade: decisao.gravidade,
  });

  return apiSuccess(
    { id: criada.id, jaExistia: false, regra, acao: decisao.acao, onde: "/approvals" },
    access.meta,
    { status: 201, headers: rate.headers },
  );
}
