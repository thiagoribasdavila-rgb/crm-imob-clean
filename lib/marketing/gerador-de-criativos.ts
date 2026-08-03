/**
 * O CAMINHO QUE FAZ A PEÇA NASCER — o lado que fala com o mundo.
 *
 * A REGRA (o que vira peça, com qual taxonomia, com qual procedência e o que
 * seria gravado) mora em `criativo-com-lastro.ts`, que é puro e por isso
 * testável. Aqui só existe I/O: ler o CRM, chamar o roteador de IA e gravar.
 *
 * ── Por que `creative_assets` tinha ZERO linhas ────────────────────────────
 *
 * Não faltava código. `creative-studio.ts` já lia o empreendimento, chamava o
 * modelo pelo roteador, gerava briefing e copies e chamava `salvarCriativos`. O
 * que faltava era o caminho CHEGAR ao banco — e ele não chegava por dois
 * bloqueios de esquema, ambos medidos por ensaio a seco na produção em
 * 02/08/2026 (transação abortada de propósito; nada persistiu):
 *
 *   BLOQUEIO 1 — SQLSTATE 23514.
 *     `app/api/v1/marketing/creative-studio/route.ts` grava a campanha com
 *     `status: "draft"`, mas o CHECK `marketing_campaigns_status_check` só
 *     admite ACTIVE, PAUSED, COMPLETED e ARCHIVED. O insert estourava ANTES de
 *     qualquer criativo — depois de já ter gasto as DUAS chamadas de modelo.
 *     Dinheiro queimado, zero linha salva, e o usuário lia "não foi possível
 *     gerar as peças agora".
 *
 *   BLOQUEIO 2 — SQLSTATE 23503.
 *     `creative_assets.campaign_id` referencia `campaigns(id)`, NÃO
 *     `marketing_campaigns(id)`. São tabelas diferentes: `campaigns` tem 0
 *     linhas, `marketing_campaigns` tem 8, e ZERO ids em comum. Mesmo com o
 *     bloqueio 1 resolvido, todo criativo morreria aqui.
 *
 * É a classe "duas tabelas para a mesma ideia" que já custou caro neste repo
 * (developments × crm_projects). A correção NÃO é inserir uma linha em
 * `campaigns` só para satisfazer a FK — isso ressuscitaria uma tabela morta e
 * criaria uma terceira verdade. É não mentir na coluna.
 *
 * NADA aqui fala com a Meta. O agente `creative-studio` está declarado no nível
 * 2 em config/orcamento-e-autonomia-da-ia.json: "escreve copy e briefing e
 * DEIXA salvo para revisão. Publicar é ato humano."
 */

import { generateAIText } from "@/lib/ai/provider-router";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recortarObjetoJson } from "@/lib/marketing/pesquisa-de-regiao";
import { SISTEMA_CRIATIVO } from "@/lib/marketing/creative-studio";
import {
  montarFicha,
  deFonteExterna,
  type FichaDeFatos,
  type FonteWeb,
  type PropriedadeCrua,
  type EmpreendimentoCru,
} from "@/lib/marketing/fatos-do-empreendimento";
import {
  montarPromptDeVariacoes,
  normalizarVariacoes,
  avaliarVariacoes,
  planejarGravacao,
  FEATURE_GERACAO,
  type ObjetivoDeCampanha,
  type PlanoDeGravacao,
  type ResultadoDaGeracao,
  type VariacaoAvaliada,
} from "@/lib/marketing/criativo-com-lastro";

// A regra inteira é reexportada para que quem consome o gerador não precise
// saber que ela mora noutro arquivo — e para que exista UM ponto de entrada.
export * from "@/lib/marketing/criativo-com-lastro";

// ---------------------------------------------------------------------------
// 1. Ler o mundo
// ---------------------------------------------------------------------------

/**
 * Carrega a ficha de fatos do empreendimento a partir do CRM.
 *
 * `properties` é lida SEM filtro de status no SQL de propósito: `montarFicha`
 * precisa ver reservado e vendido para conseguir acusar a divergência com
 * `developments.total_units`. Filtrar aqui esconderia a diferença — que é
 * justamente o que se quer mostrar a quem aprova a peça.
 */
export async function carregarFichaDeFatos(
  organizationId: string,
  developmentId: string,
  fontesWeb: FonteWeb[] = [],
): Promise<FichaDeFatos | null> {
  const admin = getSupabaseAdmin();
  const [dev, props] = await Promise.all([
    admin
      .from("developments")
      .select("id,organization_id,name,developer_name,neighborhood,city,total_units,price_min,price_max")
      .eq("id", developmentId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    admin
      .from("properties")
      .select("status,typology,area,price")
      .eq("development_id", developmentId)
      .eq("organization_id", organizationId)
      .limit(5000),
  ]);
  if (dev.error || !dev.data) return null;
  return montarFicha(
    dev.data as unknown as EmpreendimentoCru,
    (props.data ?? []) as unknown as PropriedadeCrua[],
    fontesWeb,
  );
}

/**
 * As fontes de mercado que PODEM lastrear a peça.
 *
 * Dois filtros, os dois duros:
 *   `review_status = 'verified'` — a coleta automática nasce `pending`, e
 *   pendente é o estado de quem ainda não foi conferido por gente.
 *   `valid_until >= hoje` — fonte com validade vencida não é fonte atual, e um
 *   "m² a R$ 14 mil" de 2024 num anúncio de 2026 é número errado com aparência
 *   de procedência.
 *
 * `deFonteExterna` refaz a checagem de `verified` sobre o objeto — a leitura do
 * banco e a regra não podem depender uma da outra para estarem certas.
 */
export async function carregarFontesVerificadas(
  organizationId: string,
  developmentId: string,
): Promise<FonteWeb[]> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await getSupabaseAdmin()
    .from("project_region_sources")
    .select("source_url,publisher,reference_date,summary,review_status,valid_until")
    .eq("organization_id", organizationId)
    .eq("development_id", developmentId)
    .eq("review_status", "verified")
    .gte("valid_until", hoje)
    .limit(50);
  // Erro de leitura devolve LISTA VAZIA, nunca uma exceção que derruba a
  // geração: sem fonte de mercado a peça sai sem fato de mercado, que é o
  // comportamento correto. O que ele não pode é virar fonte inventada.
  if (error || !data) return [];
  return deFonteExterna(
    data.map((f) => ({
      sourceUrl: f.source_url as string | null,
      publisher: f.publisher as string | null,
      referenceDate: f.reference_date as string | null,
      summary: f.summary as string | null,
      reviewStatus: f.review_status as string | null,
    })),
  );
}

// ---------------------------------------------------------------------------
// 2. Pedir ao modelo — pelo roteador que já existe
// ---------------------------------------------------------------------------

/**
 * Tarefa `commercial`: é texto comercial de produto, não raciocínio longo nem
 * pesquisa. O sistema é o MESMO de `creative-studio.ts` — duplicá-lo criaria
 * duas políticas de anúncio divergindo em silêncio.
 */
export async function gerarVariacoes(
  ficha: FichaDeFatos,
  objetivo: ObjetivoDeCampanha,
  organizationId: string,
  quantidade = 4,
  userId?: string,
): Promise<ResultadoDaGeracao> {
  const r = await generateAIText({
    task: "commercial",
    feature: FEATURE_GERACAO,
    organizationId,
    userId,
    system: SISTEMA_CRIATIVO,
    prompt: montarPromptDeVariacoes(ficha, objetivo, quantidade),
  });
  // `local` é o fallback SEM IA do roteador (teto de orçamento estourado ou
  // provedor fora do ar). Tratá-lo como sucesso gravaria texto de template como
  // se tivesse saído de um modelo — mentira na procedência.
  const semModelo = r.provider === "local";
  // `recortarObjetoJson` é o recortador que a frente de pesquisa já exporta:
  // modelos devolvem JSON cercado por ``` mesmo instruídos a não fazê-lo, e ter
  // dois recortadores seria ter dois comportamentos para a mesma resposta.
  const bruto = semModelo ? null : recortarObjetoJson<{ variacoes?: unknown[] }>(r.text);
  return {
    variacoes: normalizarVariacoes(bruto?.variacoes, objetivo),
    provedor: r.provider,
    modelo: r.model,
    tokens: r.usage.totalTokens,
    custoUsd: r.cost?.estimatedUsd ?? null,
    geradoEm: new Date().toISOString(),
    semModelo,
  };
}

// ---------------------------------------------------------------------------
// 3. Gravar
// ---------------------------------------------------------------------------

export type ResultadoDaGravacao = {
  gravadas: number;
  ids: string[];
  /** Peças que o banco recusou (duplicata de content_hash, por exemplo). */
  naoGravadas: Array<{ titulo: string; motivo: string }>;
};

/**
 * Grava peça + versão. A versão é o que liga a peça ao fluxo de aprovação; se
 * ela falhar, a peça é removida — meia peça no banco é peça que nunca poderá
 * ser aprovada nem medida, e ninguém descobriria por quê.
 *
 * Recusa gravar quando o plano tem impedimento: peça sem lastro não nasce, e
 * "gravou zero" precisa vir com motivo.
 */
export async function gravarCriativos(plano: PlanoDeGravacao): Promise<ResultadoDaGravacao> {
  if (plano.impedimentos.length) {
    return { gravadas: 0, ids: [], naoGravadas: plano.impedimentos.map((m) => ({ titulo: "—", motivo: m })) };
  }
  const admin = getSupabaseAdmin();
  const ids: string[] = [];
  const naoGravadas: ResultadoDaGravacao["naoGravadas"] = [];

  for (const { asset, versao } of plano.pecas) {
    const inserida = await admin.from("creative_assets").insert(asset).select("id").single();
    if (inserida.error || !inserida.data) {
      naoGravadas.push({ titulo: asset.headline, motivo: inserida.error?.message ?? "insert sem retorno" });
      continue;
    }
    const v = await admin
      .from("creative_intelligence_versions")
      .insert({ ...versao, creative_asset_id: inserida.data.id })
      .select("id")
      .single();
    if (v.error) {
      await admin
        .from("creative_assets")
        .delete()
        .eq("id", inserida.data.id)
        .eq("organization_id", asset.organization_id);
      naoGravadas.push({ titulo: asset.headline, motivo: `versão recusada: ${v.error.message}` });
      continue;
    }
    ids.push(inserida.data.id);
  }
  return { gravadas: ids.length, ids, naoGravadas };
}

// ---------------------------------------------------------------------------
// 4. O caminho inteiro — a porta única que a rota chama
// ---------------------------------------------------------------------------

export type PedidoDePecas = {
  organizationId: string;
  developmentId: string;
  objetivo: ObjetivoDeCampanha;
  /** `profiles.id`. É NOT NULL em `creative_intelligence_versions.created_by`. */
  criadoPor: string;
  quantidade?: number;
  /**
   * Id em `marketing_campaigns`, quando a peça já pertence a uma. Vai para
   * `metadata`, jamais para a coluna `campaign_id` — ver `LinhaCreativeAsset`.
   */
  marketingCampaignId?: string | null;
};

export type PecasPlanejadas = {
  ficha: FichaDeFatos;
  geracao: ResultadoDaGeracao;
  avaliadas: VariacaoAvaliada[];
  plano: PlanoDeGravacao;
};

export type PecasComLastro = PecasPlanejadas & { gravacao: ResultadoDaGravacao };

/**
 * FICHA → MODELO → CONFERÊNCIA → PLANO. Tudo, menos gravar.
 *
 * A separação existe para que o ENSAIO A SECO percorra exatamente esta
 * sequência, e não uma reconstrução parecida dela. Um ensaio que remontasse os
 * quatro passos à mão provaria que os quatro módulos funcionam — nunca que a
 * rota os chama nesta ordem. É a classe "caminhos divergentes" que este
 * repositório já pagou caro: dois lados que fazem "a mesma coisa" até o dia em
 * que um deles para de chamar `avaliarVariacoes` e a peça nasce sem conferência
 * de número, sem erro nenhum.
 *
 * Devolve `null` quando o empreendimento não está no escopo da organização —
 * distinto de "gerou zero peças", que vem com `plano.impedimentos` preenchido.
 */
export async function planejarPecasComLastro(pedido: PedidoDePecas): Promise<PecasPlanejadas | null> {
  const fontes = await carregarFontesVerificadas(pedido.organizationId, pedido.developmentId);
  const ficha = await carregarFichaDeFatos(pedido.organizationId, pedido.developmentId, fontes);
  if (!ficha) return null;

  const geracao = await gerarVariacoes(
    ficha,
    pedido.objetivo,
    pedido.organizationId,
    pedido.quantidade ?? 4,
    pedido.criadoPor,
  );
  const avaliadas = avaliarVariacoes(geracao.variacoes, ficha);
  const plano = planejarGravacao(avaliadas, {
    ficha,
    objetivo: pedido.objetivo,
    criadoPor: pedido.criadoPor,
    geracao,
    marketingCampaignId: pedido.marketingCampaignId ?? null,
  });
  return { ficha, geracao, avaliadas, plano };
}

/**
 * O caminho inteiro, com a gravação no fim — a porta única que a rota chama.
 *
 * A gravação só acontece quando o plano não tem impedimento; `gravarCriativos`
 * é quem recusa, e devolve o motivo em vez de um zero mudo.
 */
export async function gerarPecasComLastro(pedido: PedidoDePecas): Promise<PecasComLastro | null> {
  const planejado = await planejarPecasComLastro(pedido);
  if (!planejado) return null;
  return { ...planejado, gravacao: await gravarCriativos(planejado.plano) };
}
