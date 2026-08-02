import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { canonicalPipelineStage, DEFAULT_PIPELINE_STAGES } from "@/lib/atlas/pipeline-stages";
import { leSoAPropriaCarteira } from "@/lib/crm/escopo-de-leitura";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * COMO CADA CARTEIRA MOVIMENTA O FUNIL — pelo ledger, não por percepção.
 *
 * ── A PERGUNTA QUE ISTO RESPONDE ────────────────────────────────────────────
 *
 * A tela de equipe já mostra ESTADO (carteira, quentes, atraso, sem próxima
 * ação). Estado não diz se o funil está sendo alimentado. Medido no ledger em
 * 2026-08-02, sobre 477 movimentos de uma mesma pessoa:
 *
 *   saídas do funil ................................. 413
 *   dessas, com `from_stage = 'novo'` .............. 404
 *   avanços de etapa ................................. 58
 *
 * O que a rota publica é `from_stage = 'novo'`: 404. A frase mais forte —
 * "nunca passou por Contato em nenhum momento do ledger" — vale para 402: DUAS
 * dessas leads chegaram a "Contato", voltaram para "Novos" e saíram de lá
 * (conferido em 02/08/2026 por varredura do ledger inteiro, não da linha da
 * saída). O número da tela é o do recorte que o código realmente faz; a
 * diferença de 2 fica escrita aqui para ninguém a redescobrir.
 *
 * Das 404, 250 carregam a nota "cadência realizada, sem retorno".
 * Ou a etapa não é atualizada enquanto o trabalho acontece, ou a cadência não
 * aconteceu. As duas leituras pedem conversa, e nenhuma delas aparece em
 * contagem de carteira.
 *
 * ── NÃO É RANKING ───────────────────────────────────────────────────────────
 *
 * `/brokers` declara, no próprio texto, que não há ranking punitivo de pessoas.
 * Esta leitura mantém a promessa: a ordem é por VOLUME de movimentação (quem
 * mexeu mais aparece primeiro, porque é onde há o que ler), nunca por um peso
 * de desempenho, e nenhum número aqui é comparado entre pessoas pela rota.
 *
 * ── O QUE NÃO É PUBLICADO, E POR QUÊ ────────────────────────────────────────
 *
 * Tempo mediano entre a criação da lead e a primeira movimentação FICA DE FORA.
 * 270 das 490 leads entraram por importação em 28/07 e 268 saíram num lote em
 * 01/08: a mediana resultante (92,8h) descreveria a importação, não o
 * atendimento. Número plausível e sem lastro é pior que número ausente.
 */

const POSICAO_DA_ETAPA = new Map(DEFAULT_PIPELINE_STAGES.map((etapa) => [etapa.key, etapa.position]));
const DESFECHO_DA_ETAPA = new Map(DEFAULT_PIPELINE_STAGES.map((etapa) => [etapa.key, etapa.outcome]));
const ETAPAS_DE_SAIDA = new Set(
  DEFAULT_PIPELINE_STAGES.filter((etapa) => etapa.outcome === "lost" || etapa.outcome === "buyer_profile").map(
    (etapa) => etapa.key,
  ),
);
const ETAPA_DE_ENTRADA = "novo";
/* Carteira ABERTA é o que não terminou: saída do funil e ganho saem da conta.
   Sai do catálogo de etapas, não de uma lista digitada aqui — etapa nova no
   catálogo passa a ser classificada sozinha. */
const ETAPAS_ENCERRADAS = new Set(
  DEFAULT_PIPELINE_STAGES.filter((etapa) => etapa.outcome !== "open").map((etapa) => etapa.key),
);

type MovimentoDoLedger = {
  id: string;
  lead_id: string | null;
  actor_id: string | null;
  from_stage: string | null;
  to_stage: string | null;
  discard_reason_key: string | null;
  reversal_of: string | null;
  occurred_at: string | null;
};

type Pessoa = {
  id: string;
  nome: string;
  papel: string;
  movimentos: number;
  avancos: number;
  saidas: number;
  saidasSemPassarPorContato: number;
  saidasSemMotivo: number;
  leadsTocadas: Set<string>;
  ultimoEm: string | null;
  carteiraAberta: number;
  carteiraSemMovimento: number;
};

function clampDias(valor: string | null): number {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 30;
  return Math.min(180, Math.max(7, Math.round(numero)));
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 45, windowMs: 60_000, scope: "acompanhamento.movimentacao-por-pessoa" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker"],
  });
  if (!identity.ok) return identity.response;

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const perfilAtual = { commercialRole: identity.access.profile.commercialRole, role: identity.access.profile.role };
  const soAPropriaCarteira = leSoAPropriaCarteira(perfilAtual);
  const dias = clampDias(request.nextUrl.searchParams.get("dias"));
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

  const [movimentosResult, todosOsLeadIds, perfisResult, leadsDaOrganizacao, primeiroDoLedger] = await Promise.all([
    admin
      .from("pipeline_stage_moves")
      .select("id,lead_id,actor_id,from_stage,to_stage,discard_reason_key,reversal_of,occurred_at")
      .eq("organization_id", organizationId)
      .gte("occurred_at", desde)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(5000),
    // O ledger INTEIRO, só a coluna da lead: "carteira sem movimento" pergunta
    // se o funil já registrou alguma coisa sobre aquela lead alguma vez, não se
    // registrou dentro da janela.
    admin
      .from("pipeline_stage_moves")
      .select("lead_id")
      .eq("organization_id", organizationId)
      .limit(20000),
    admin
      .from("profiles")
      .select("id,name,full_name,role,commercial_role,active")
      .eq("organization_id", organizationId)
      .limit(1000),
    // Sem filtro de status no servidor: `not in` no PostgREST devolve NULL para
    // linha com status nulo, e NULL não passa no filtro — a lead sumiria da
    // contagem sem ninguém perceber. O recorte de "aberta" é feito abaixo, em
    // memória, onde a ausência de status é um caso tratado e não um sumiço.
    admin
      .from("leads")
      .select("id,assigned_to,assigned_user_id,status")
      .eq("organization_id", organizationId)
      .limit(5000),
    admin
      .from("pipeline_stage_moves")
      .select("occurred_at")
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (movimentosResult.error || perfisResult.error) {
    return apiError(
      "MOVIMENTACAO_POR_PESSOA_INDISPONIVEL",
      "Não foi possível ler a movimentação do funil agora.",
      identity.meta,
      { status: 503, headers: rate.headers },
    );
  }

  const perfis = new Map(
    (perfisResult.data ?? []).map((linha) => [
      String(linha.id),
      {
        nome: String(linha.full_name || linha.name || "Usuário Atlas"),
        papel: String(linha.commercial_role || linha.role || "broker"),
      },
    ]),
  );

  const pessoas = new Map<string, Pessoa>();
  const pessoaDe = (id: string): Pessoa => {
    const existente = pessoas.get(id);
    if (existente) return existente;
    const perfil = perfis.get(id);
    const nova: Pessoa = {
      id,
      nome: perfil?.nome ?? "Pessoa fora do seu escopo",
      papel: perfil?.papel ?? "desconhecido",
      movimentos: 0,
      avancos: 0,
      saidas: 0,
      saidasSemPassarPorContato: 0,
      saidasSemMotivo: 0,
      leadsTocadas: new Set<string>(),
      ultimoEm: null,
      carteiraAberta: 0,
      carteiraSemMovimento: 0,
    };
    pessoas.set(id, nova);
    return nova;
  };

  const movimentos = (movimentosResult.data ?? []) as MovimentoDoLedger[];
  const desfeitos = new Set(movimentos.map((linha) => linha.reversal_of).filter((valor): valor is string => Boolean(valor)));
  let totalMovimentos = 0;

  for (const linha of movimentos) {
    // Movimento desfeito não conta como trabalho feito nem como saída: as duas
    // linhas ficam no ledger, a contagem publicada é líquida.
    if (desfeitos.has(String(linha.id))) continue;
    const atorId = String(linha.actor_id || "");
    if (!atorId) continue;
    if (soAPropriaCarteira && atorId !== identity.access.profile.id) continue;
    const pessoa = pessoaDe(atorId);
    totalMovimentos += 1;
    pessoa.movimentos += 1;
    if (linha.lead_id) pessoa.leadsTocadas.add(String(linha.lead_id));
    if (linha.occurred_at && (!pessoa.ultimoEm || linha.occurred_at > pessoa.ultimoEm)) {
      pessoa.ultimoEm = linha.occurred_at;
    }
    const de = canonicalPipelineStage(linha.from_stage);
    const para = canonicalPipelineStage(linha.to_stage);
    const saida = para ? ETAPAS_DE_SAIDA.has(para) : false;
    if (saida) {
      pessoa.saidas += 1;
      if (de === ETAPA_DE_ENTRADA) pessoa.saidasSemPassarPorContato += 1;
      if (!linha.discard_reason_key) pessoa.saidasSemMotivo += 1;
    } else if (de && para) {
      const posicaoDe = POSICAO_DA_ETAPA.get(de) ?? 0;
      const posicaoPara = POSICAO_DA_ETAPA.get(para) ?? 0;
      const desfecho = DESFECHO_DA_ETAPA.get(para);
      if (posicaoPara > posicaoDe && (desfecho === "open" || desfecho === "won")) pessoa.avancos += 1;
    }
  }

  // Carteira aberta e carteira que o funil nunca registrou. Só entra quem já
  // apareceu no ledger ou tem lead aberta — pessoa sem nenhum dos dois não tem
  // linha a ler e ocuparia espaço afirmando zero sobre quem não trabalha leads.
  const leadsComLedger = new Set(
    ((todosOsLeadIds.data ?? []) as Array<{ lead_id: string | null }>)
      .map((linha) => String(linha.lead_id || ""))
      .filter(Boolean),
  );
  const carteiraMensuravel = !leadsDaOrganizacao.error && !todosOsLeadIds.error;
  if (carteiraMensuravel) {
    for (const lead of (leadsDaOrganizacao.data ?? []) as Array<{
      id: string;
      assigned_to: string | null;
      assigned_user_id: string | null;
      status: string | null;
    }>) {
      const etapa = canonicalPipelineStage(lead.status) ?? ETAPA_DE_ENTRADA;
      if (ETAPAS_ENCERRADAS.has(etapa)) continue;
      // As DUAS colunas de dono: a base tem histórico nos dois lados e escolher
      // uma só esconde parte da carteira da própria pessoa.
      const donoId = String(lead.assigned_user_id || lead.assigned_to || "");
      if (!donoId) continue;
      if (soAPropriaCarteira && donoId !== identity.access.profile.id) continue;
      const pessoa = pessoaDe(donoId);
      pessoa.carteiraAberta += 1;
      if (!leadsComLedger.has(String(lead.id))) pessoa.carteiraSemMovimento += 1;
    }
  }

  const linhas = [...pessoas.values()]
    .filter((pessoa) => pessoa.movimentos > 0 || pessoa.carteiraAberta > 0)
    .sort((a, b) => b.movimentos - a.movimentos || b.carteiraAberta - a.carteiraAberta)
    .map((pessoa) => ({
      id: pessoa.id,
      nome: pessoa.nome,
      papel: pessoa.papel,
      movimentos: pessoa.movimentos,
      avancos: pessoa.avancos,
      saidas: pessoa.saidas,
      saidasSemPassarPorContato: pessoa.saidasSemPassarPorContato,
      saidasSemMotivo: pessoa.saidasSemMotivo,
      leadsTocadas: pessoa.leadsTocadas.size,
      ultimoEm: pessoa.ultimoEm,
      carteiraAberta: pessoa.carteiraAberta,
      carteiraSemMovimento: pessoa.carteiraSemMovimento,
    }));

  return apiSuccess(
    {
      escopo: soAPropriaCarteira ? "carteira" : "organizacao",
      dias,
      desde,
      ledgerDesde: primeiroDoLedger.data?.occurred_at ?? null,
      totalMovimentos,
      pessoas: linhas,
      // Duas leituras independentes: se a da carteira falhar, os contadores de
      // carteira precisam ser lidos como "não medido", nunca como zero.
      carteiraMensuravel,
      medidoEm: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
