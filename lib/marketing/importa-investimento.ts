import "server-only";
import { fetchMetaDailyCampaignInsights, fetchMetaCampaignStates, type MetaInsightPeriod } from "@/lib/meta/insights";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  agrupaInvestimentoPorDia,
  linhasParaGravar,
  deveAtualizarNome,
  PLATAFORMA_META,
} from "@/lib/marketing/investimento-puro";

// As regras puras moram em `investimento-puro.ts` — sem `server-only` e sem
// Supabase — para que os contratos possam EXECUTÁ-LAS em vez de lerem o código.
// Reexportadas aqui porque este é o módulo que o produto conhece.
export {
  agrupaInvestimentoPorDia,
  linhasParaGravar,
  deveAtualizarNome,
  PLATAFORMA_META,
};
export type { LinhaDeInvestimento } from "@/lib/marketing/investimento-puro";

/**
 * O INVESTIMENTO SAIU DA CONTA E NUNCA ENTROU NO CRM.
 *
 * ── O que foi medido em 2026-07-31 ──────────────────────────────────────────
 *
 *   conta de anúncios da Meta, últimos 30 dias .... R$ 3.612,01
 *   linhas dia×campanha disponíveis ............... 94
 *   campanhas com gasto ........................... 7
 *   linhas em `marketing_spend` ................... 0
 *
 * Sete lugares do produto leem `marketing_spend`: relatório de custo, stop-loss,
 * desempenho de anúncio, briefing do diretor, contexto de campanha da lead,
 * qualidade de campanha e o relatório semanal do incorporador. Todos os sete
 * respondem R$ 0 — não porque deu erro, mas porque a tabela está vazia.
 *
 * ── A doença, de novo: duas verdades para o mesmo fato ──────────────────────
 *
 * O sistema JÁ sabia buscar gasto na Meta: `fetchMetaCampaignInsights` existe e
 * três rotas a chamam ao vivo para desenhar tela. Então convivem duas respostas
 * para "quanto gastamos": a da tela, que vem da Meta na hora, e a do banco, que
 * é zero. Quem olha o painel de campanha vê número; quem lê o relatório de custo
 * vê zero. Nenhum dos dois está com defeito — eles perguntam a fontes
 * diferentes.
 *
 * O elo que faltava nunca foi a busca. Foi a GRAVAÇÃO.
 *
 * ── O que este módulo faz, e o que ele recusa a fazer ───────────────────────
 *
 * Faz: lê o gasto dia a dia na Meta (somente leitura), garante que cada campanha
 * externa tenha registro em `marketing_campaigns`, e grava uma linha por
 * (organização, campanha, dia) em `marketing_spend`, por `upsert`.
 *
 * Não faz: não cria campanha na Meta, não altera orçamento, não pausa nada, não
 * move verba. A Graph API é tocada com GET e mais nada.
 *
 * ── Por que ele RECUSA quando há mais de uma organização configurada ────────
 *
 * A credencial da conta de anúncios vem do ambiente — é UMA conta, global ao
 * processo. A organização dona dela é deduzida de `meta_conversion_configs`.
 * Com duas organizações configuradas, não existe forma honesta de escolher: o
 * gasto de uma iria para o CPL da outra, e a conta fecharia — errada, mas
 * fechando. Atribuir dinheiro à organização errada é pior do que não importar,
 * porque o número resultante é plausível.
 *
 * Então: recusa, e diz por quê.
 */

export type ResultadoDaImportacao = {
  ok: boolean;
  motivo?: "sem_credencial" | "sem_organizacao" | "organizacao_ambigua" | "sem_dado" | "erro_no_banco";
  mensagem?: string;
  organizationId?: string;
  diasLidos: number;
  linhasDaMeta: number;
  campanhasVistas: number;
  campanhasCriadas: number;
  nomesAtualizados: number;
  linhasGravadas: number;
  linhasSemCampanha: number;
  investimentoTotal: number;
};

const VAZIO: Omit<ResultadoDaImportacao, "ok"> = {
  diasLidos: 0, linhasDaMeta: 0, campanhasVistas: 0, campanhasCriadas: 0,
  nomesAtualizados: 0, linhasGravadas: 0, linhasSemCampanha: 0, investimentoTotal: 0,
};

/**
 * Descobre a organização dona da conta de anúncios do ambiente.
 *
 * Regra: é a organização com integração de conversão da Meta configurada. Zero
 * → não há a quem atribuir. Mais de uma → ambíguo, e ambiguidade sobre dinheiro
 * se recusa, não se chuta.
 */
export async function organizacaoDaContaDeAnuncios(
  admin: SupabaseClient,
): Promise<{ organizationId: string } | { erro: "sem_organizacao" | "organizacao_ambigua"; quantas: number }> {
  const { data, error } = await admin.from("meta_conversion_configs").select("organization_id");
  if (error || !data || data.length === 0) return { erro: "sem_organizacao", quantas: 0 };
  const orgs = [...new Set(data.map((linha) => String((linha as { organization_id: string }).organization_id)))];
  if (orgs.length > 1) return { erro: "organizacao_ambigua", quantas: orgs.length };
  return { organizationId: orgs[0] };
}

/**
 * Importa o gasto da Meta para `marketing_spend`. Idempotente: reexecutar no
 * mesmo dia atualiza as mesmas linhas em vez de somar linhas novas — garantido
 * pelo índice único (organization_id, campaign_id, spend_date), criado na
 * migration `20260731120000` justamente para isto.
 */
export async function importaInvestimentoDaMeta(
  admin: SupabaseClient,
  opcoes: { dias?: MetaInsightPeriod } = {},
): Promise<ResultadoDaImportacao> {
  const dias = opcoes.dias ?? 30;

  const org = await organizacaoDaContaDeAnuncios(admin);
  if ("erro" in org) {
    return {
      ok: false, motivo: org.erro, ...VAZIO, diasLidos: dias,
      mensagem: org.erro === "sem_organizacao"
        ? "Nenhuma organização tem integração de conversão da Meta configurada — não há a quem atribuir o investimento."
        : `${org.quantas} organizações têm integração da Meta configurada, e a conta de anúncios vem do ambiente (é uma só). Atribuir o gasto a uma delas seria adivinhar de quem é o dinheiro.`,
    };
  }
  const organizationId = org.organizationId;

  const brutas = await fetchMetaDailyCampaignInsights(dias);
  if (brutas.length === 0) {
    // Sem credencial a busca devolve `[]` por construção; sem gasto no período,
    // também. Os dois casos são "nada a gravar", e nenhum é falha do worker.
    return { ok: true, motivo: "sem_dado", ...VAZIO, organizationId, diasLidos: dias, mensagem: "A Meta não devolveu gasto no período (ou a conta/token não está configurada)." };
  }
  const linhas = agrupaInvestimentoPorDia(brutas);
  const externos = [...new Set(linhas.map((linha) => linha.campaignId))];

  // ── Campanhas: resolver o id externo para o uuid interno ──────────────────
  const { data: existentes, error: erroCampanhas } = await admin
    .from("marketing_campaigns")
    .select("id,name,external_campaign_id")
    .eq("organization_id", organizationId)
    .eq("platform", PLATAFORMA_META)
    .in("external_campaign_id", externos);
  if (erroCampanhas) {
    return { ok: false, motivo: "erro_no_banco", ...VAZIO, organizationId, diasLidos: dias, mensagem: `Falha ao ler marketing_campaigns: ${erroCampanhas.message}` };
  }

  const campanhaPorExterno = new Map<string, string>();
  const nomeGuardadoPorExterno = new Map<string, string | null>();
  for (const linha of (existentes ?? []) as Array<{ id: string; name: string | null; external_campaign_id: string | null }>) {
    if (!linha.external_campaign_id) continue;
    campanhaPorExterno.set(linha.external_campaign_id, linha.id);
    nomeGuardadoPorExterno.set(linha.external_campaign_id, linha.name);
  }

  const nomeDaMetaPorExterno = new Map(linhas.map((linha) => [linha.campaignId, linha.campaignName]));
  const faltantes = externos.filter((externo) => !campanhaPorExterno.has(externo));

  // O estado da campanha é PERGUNTADO à Meta, não suposto. A primeira versão
  // deste código gravou "UNKNOWN" e o banco recusou pelo check constraint — e a
  // recusa estava certa: "não sei" não é um estado de campanha, é ausência de
  // leitura. Falha nesta chamada devolve mapa vazio e cai no default PAUSED,
  // sem derrubar a importação do gasto.
  const estadoPorExterno = faltantes.length > 0 ? await fetchMetaCampaignStates() : new Map();
  let campanhasCriadas = 0;
  if (faltantes.length > 0) {
    const { data: criadas, error: erroCriacao } = await admin
      .from("marketing_campaigns")
      .upsert(
        faltantes.map((externo) => ({
          organization_id: organizationId,
          platform: PLATAFORMA_META,
          external_campaign_id: externo,
          name: nomeDaMetaPorExterno.get(externo) || `Campanha Meta ${externo}`,
          // Estado real lido da Meta; PAUSED quando a leitura não respondeu.
          // Errar para "parada" faz alguém ir conferir; errar para "ativa" faz
          // todo mundo relaxar achando que há entrega acontecendo.
          status: estadoPorExterno.get(externo) ?? "PAUSED",
        })),
        { onConflict: "organization_id,platform,external_campaign_id" },
      )
      .select("id,external_campaign_id");
    if (erroCriacao) {
      return { ok: false, motivo: "erro_no_banco", ...VAZIO, organizationId, diasLidos: dias, mensagem: `Falha ao registrar campanhas: ${erroCriacao.message}` };
    }
    for (const linha of (criadas ?? []) as Array<{ id: string; external_campaign_id: string | null }>) {
      if (linha.external_campaign_id) campanhaPorExterno.set(linha.external_campaign_id, linha.id);
    }
    campanhasCriadas = (criadas ?? []).length;
  }

  // ── Nome provisório vira nome real ───────────────────────────────────────
  let nomesAtualizados = 0;
  for (const externo of externos) {
    const nomeDaMeta = nomeDaMetaPorExterno.get(externo) || "";
    if (!deveAtualizarNome(nomeGuardadoPorExterno.get(externo), nomeDaMeta)) continue;
    const id = campanhaPorExterno.get(externo);
    if (!id) continue;
    const { error } = await admin.from("marketing_campaigns").update({ name: nomeDaMeta }).eq("id", id).eq("organization_id", organizationId);
    if (!error) nomesAtualizados += 1;
  }

  // ── O gasto ──────────────────────────────────────────────────────────────
  const { gravar, semCampanha } = linhasParaGravar(organizationId, linhas, campanhaPorExterno);
  let linhasGravadas = 0;
  if (gravar.length > 0) {
    const { data: gravadas, error: erroGravacao } = await admin
      .from("marketing_spend")
      .upsert(gravar.map((linha) => ({ ...linha, updated_at: new Date().toISOString() })), { onConflict: "organization_id,campaign_id,spend_date" })
      .select("id");
    if (erroGravacao) {
      return { ok: false, motivo: "erro_no_banco", ...VAZIO, organizationId, diasLidos: dias, mensagem: `Falha ao gravar marketing_spend: ${erroGravacao.message}` };
    }
    // Conta o que o banco DEVOLVEU, não o tamanho do array enviado. O Supabase
    // não lança em toda falha parcial, e já houve nesta base um relatório de
    // "19 removidos" que na verdade foram 2.
    linhasGravadas = (gravadas ?? []).length;
  }

  return {
    ok: true,
    organizationId,
    diasLidos: dias,
    linhasDaMeta: linhas.length,
    campanhasVistas: externos.length,
    campanhasCriadas,
    nomesAtualizados,
    linhasGravadas,
    linhasSemCampanha: semCampanha.length,
    investimentoTotal: Math.round(gravar.reduce((soma, linha) => soma + linha.amount, 0) * 100) / 100,
  };
}
