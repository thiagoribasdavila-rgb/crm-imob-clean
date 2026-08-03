import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { auditarPecaDoEmpreendimento } from "@/lib/marketing/lastro-do-criativo";
import { podarConjuntoSemLastro, textosPublicaveis } from "@/lib/marketing/conjunto-com-lastro";
import {
  carregarEmpreendimento, gerarBriefing, gerarCopies, salvarCriativos,
  type ObjetivoCampanha,
} from "@/lib/marketing/creative-studio";
/* O GERADOR COM LASTRO — o caminho em que cada número da peça é conferido
   contra `properties` antes de a peça existir. É esta porta que a tela
   /marketing/campanhas-criativos-proposta usa. */
import {
  gerarPecasComLastro,
  ctaDaMeta,
  type ObjetivoDeCampanha,
} from "@/lib/marketing/gerador-de-criativos";
/* O nome do modo vem do MESMO módulo que a tela importa: string escrita à mão
   nos dois lados diverge sem erro de compilação, e a rota cairia no modo de
   sempre em silêncio. */
import {
  MODO_COM_LASTRO, MODOS_DE_GERACAO, modoDaRequisicao,
} from "@/lib/marketing/modo-de-geracao";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJETIVOS = new Set<ObjetivoCampanha>([
  "gerar_leads", "contato_whatsapp", "gerar_visitas", "divulgar_lancamento",
  "vender_estoque", "atrair_investidores", "remarketing",
]);
const PODE_GERAR = new Set(["admin", "director", "superintendent", "manager"]);

/**
 * OS DOIS MODOS DESTA PORTA — e por que são dois, e não um.
 *
 * O vocabulário e o padrão moram em `lib/marketing/modo-de-geracao.ts`, que a
 * tela importa também. O que cada modo faz está documentado lá; o que importa
 * aqui é POR QUE o modo antigo continua sendo o padrão: `/marketing/nova-campanha`
 * consome briefing, `copies.conceitos`, `copies.roteirosVideo` e
 * `consumo.chamadas` da resposta de sempre. Trocar aquela forma apagaria a etapa
 * 3 daquele wizard — regressão, não evolução.
 */

/**
 * GET — insumo do briefing sem gastar um único token de IA.
 * Serve à etapa de revisão do wizard: mostra o que está cadastrado e o que
 * falta confirmar ANTES de qualquer geração.
 */
export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "creative-studio.read" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const developmentId = new URL(request.url).searchParams.get("developmentId") ?? "";
  if (!UUID.test(developmentId)) return apiError("DEVELOPMENT_INVALID", "Informe o empreendimento.", access.meta, { status: 400, headers: rate.headers });

  const base = await carregarEmpreendimento(access.access.organization.id, developmentId);
  if (!base) return apiError("DEVELOPMENT_NOT_FOUND", "Empreendimento não encontrado no seu escopo.", access.meta, { status: 404, headers: rate.headers });

  return apiSuccess({
    empreendimento: base,
    prontoParaGerar: base.pendencias.length === 0,
    // Pendência não impede gerar — impede PROMETER. A peça sai sem o dado.
    aviso: base.pendencias.length
      ? "A geração é permitida, mas as peças NÃO citarão preço, prazo ou condição enquanto esses dados não forem confirmados no cadastro."
      : null,
  }, access.meta, { headers: rate.headers });
}

/**
 * POST — gera briefing + copies com IA real e grava as peças como RASCUNHO.
 *
 * O que esta rota deliberadamente NÃO faz: publicar campanha, gastar verba,
 * ativar anúncio ou marcar peça como aprovada. Tudo nasce em `draft`.
 */
export async function POST(request: NextRequest) {
  // Limite baixo de propósito: cada chamada custa dinheiro em token.
  const rate = enforceRateLimit(request, { limit: 10, windowMs: 60_000, scope: "creative-studio.generate" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!PODE_GERAR.has(String(papel))) {
    return apiError("FORBIDDEN", "Geração de criativos é da liderança comercial ou do marketing.", access.meta, { status: 403, headers: rate.headers });
  }

  let body: { developmentId?: unknown; objetivo?: unknown; campanha?: unknown; modo?: unknown };
  try { body = await request.json(); }
  catch { return apiError("INVALID_JSON", "Dados inválidos.", access.meta, { status: 400, headers: rate.headers }); }

  const developmentId = typeof body.developmentId === "string" ? body.developmentId : "";
  const objetivo = String(body.objetivo ?? "") as ObjetivoCampanha;
  if (!UUID.test(developmentId)) return apiError("DEVELOPMENT_INVALID", "Informe o empreendimento.", access.meta, { status: 400, headers: rate.headers });
  if (!OBJETIVOS.has(objetivo)) return apiError("OBJECTIVE_INVALID", `Objetivo inválido. Use um de: ${[...OBJETIVOS].join(", ")}.`, access.meta, { status: 400, headers: rate.headers });

  const modo = modoDaRequisicao(body.modo);
  if (modo === null) {
    return apiError("MODE_INVALID", `Modo inválido. Use um de: ${MODOS_DE_GERACAO.join(", ")}.`, access.meta, { status: 400, headers: rate.headers });
  }

  const organizationId = access.access.organization.id;

  if (modo === MODO_COM_LASTRO) {
    return gerarComLastro(request, access.meta, rate.headers, {
      organizationId, developmentId,
      objetivo: objetivo as unknown as ObjetivoDeCampanha,
      criadoPor: access.access.profile.id,
    });
  }

  const base = await carregarEmpreendimento(organizationId, developmentId);
  if (!base) return apiError("DEVELOPMENT_NOT_FOUND", "Empreendimento não encontrado no seu escopo.", access.meta, { status: 404, headers: rate.headers });

  const admin = getSupabaseAdmin();
  const nomeCampanha = String(body.campanha ?? "").trim().slice(0, 120) || `${base.nome} · ${objetivo}`;

  try {
    // 1) Briefing: uma chamada, reaproveitada pelas copies.
    const b = await gerarBriefing(base, objetivo, organizationId, access.access.profile.id);
    // 2) Copies a partir do briefing — sem reenviar a ficha do empreendimento.
    const c = await gerarCopies(b.briefing, base.nome, objetivo, organizationId, access.access.profile.id);

    /**
     * ── A PORTA IRMÃ QUE ESTAVA ESCANCARADA ──────────────────────────────────
     *
     * Esta rota tem dois modos e os dois gravam em `creative_assets`.
     * `variacoes_com_lastro` (abaixo) audita cada número contra as fontes
     * regionais e o cadastro do produto e RECUSA a variação sem lastro. Este
     * modo — o padrão — ia de `gerarCopies` direto para `salvarCriativos`.
     *
     * O resultado era uma régua que valia por qual botão o operador apertou, e
     * não pelo que ia para o banco. É a mesma classe já paga aqui quando a régua
     * da Meta valia na tela de composição e não valia em `ready-campaigns` — só
     * que o que passa por esta porta é número sem lastro em anúncio de imóvel.
     *
     * A auditoria vem ANTES de criar a campanha: uma peça sem lastro não deve
     * chegar ao banco nem marcada como bloqueada, porque marca depende de todo
     * consumidor futuro se lembrar de respeitá-la.
     */
    const auditoria = await auditarPecaDoEmpreendimento({
      organizationId,
      developmentId,
      textos: textosPublicaveis(c.copies),
    });
    const reprovados = new Set(auditoria.removidos.map((r) => r.texto));
    const poda = podarConjuntoSemLastro(c.copies, reprovados);

    if (poda.conjunto.conceitos.length === 0) {
      // Nenhuma campanha criada: a linha PAUSED sem peça nenhuma seria lixo que
      // o operador teria de limpar depois, e mentiria sobre ter havido geração
      // aproveitável.
      structuredApiLog("warn", "creative_studio.sem_lastro", request, access.meta, {
        organizationId, developmentId,
        recusadas: poda.recusadas.length,
        leituraIncompleta: auditoria.leituraIncompleta,
      });
      return apiError(
        auditoria.leituraIncompleta ? "LASTRO_INDISPONIVEL" : "CREATIVE_SEM_LASTRO",
        auditoria.leituraIncompleta
          ? "Não foi possível conferir o lastro das peças agora, e por isso nada foi gravado. O portão reprovou por não conseguir conferir — não por ter conferido e negado."
          : "Nenhuma peça tem lastro: os números citados não aparecem no cadastro do empreendimento nem em fonte regional vigente. Cadastre a fonte ou o valor antes de gerar.",
        access.meta,
        { status: auditoria.leituraIncompleta ? 503 : 422, headers: rate.headers },
      );
    }

    // A campanha nasce PARADA. Publicação é outro fluxo, com aprovação.
    //
    // `status: "draft"` estourava o CHECK `marketing_campaigns_status_check`
    // (SQLSTATE 23514): a coluna só admite ACTIVE, PAUSED, COMPLETED e
    // ARCHIVED. O insert falhava DEPOIS das duas chamadas de modelo — token
    // gasto, nenhuma linha gravada, e o usuário lendo "não foi possível gerar
    // as peças agora" sem nenhuma pista do motivo. Medido por ensaio a seco na
    // produção em 02/08/2026.
    //
    // PAUSED é o valor honesto: é o único do vocabulário que NÃO afirma que a
    // campanha está no ar — a mesma escolha, pelo mesmo motivo, que
    // `lib/marketing/campaign-provenance.ts` já documenta para a campanha
    // registrada por automação.
    //
    // `platform` também acompanha o vocabulário vivo: as 8 linhas da tabela e o
    // default da coluna usam "META" em maiúsculas.
    const campanha = await admin.from("marketing_campaigns").insert({
      organization_id: organizationId, name: nomeCampanha,
      platform: "META", status: "PAUSED",
    }).select("id,name,status").single();
    if (campanha.error) throw campanha.error;

    const salvos = await salvarCriativos(organizationId, campanha.data.id, poda.conjunto, {
      briefing: b.briefing, modelo: c.modelo, provedor: c.provedor,
      custoUsd: (b.custoUsd ?? 0) + (c.custoUsd ?? 0),
      developmentId,
    }, access.access.profile.id);

    const custoTotal = (b.custoUsd ?? 0) + (c.custoUsd ?? 0);
    structuredApiLog("info", "creative_studio.generated", request, access.meta, {
      organizationId, developmentId, campaignId: campanha.data.id,
      provedor: b.provedor, modelo: b.modelo,
      tokens: b.tokens + c.tokens, custoUsd: custoTotal,
    });

    return apiSuccess({
      campanha: campanha.data,
      briefing: b.briefing,
      // As copies que SOBRARAM — as mesmas que foram gravadas. Devolver
      // `c.copies` aqui mostraria ao operador peças que o banco não tem: a tela
      // exibiria uma variação recusada como se estivesse salva, e é assim que se
      // fabrica a terceira verdade sobre o que existe.
      copies: poda.conjunto,
      criativosSalvos: salvos.criados,
      // O que caiu, e por quê. Recusa em silêncio faria o operador contar 5
      // peças na cabeça e achar 3 no banco, sem nada explicando a diferença.
      recusadasPorFaltaDeLastro: poda.recusadas.map((r) => ({
        conceito: r.conceito,
        campo: r.campo,
        texto: r.texto,
        motivo: auditoria.removidos.find((rem) => rem.texto === r.texto)?.motivo ?? "sem lastro no cadastro nem em fonte regional vigente",
      })),
      lastro: {
        fontesConhecidas: auditoria.fontesConhecidas,
        valoresCadastrados: Object.keys(auditoria.valoresCadastrados).length,
      },
      // Custo exposto sempre: quem gera precisa ver o que gastou.
      consumo: {
        provedor: b.provedor, modelo: b.modelo,
        tokensTotais: b.tokens + c.tokens,
        custoEstimadoUsd: custoTotal || null,
        chamadas: 2,
      },
      pendenciasDoProduto: base.pendencias,
      proximoPasso: "Revisar as peças, escolher as imagens e enviar para aprovação. Nada foi publicado.",
    }, access.meta, { status: 201, headers: rate.headers });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha desconhecida";
    structuredApiLog("warn", "creative_studio.failed", request, access.meta, { organizationId, developmentId, motivo: motivo.slice(0, 120) });
    return apiError("CREATIVE_GENERATION_FAILED", "Não foi possível gerar as peças agora. Nenhuma campanha foi criada.", access.meta, { status: 502, headers: rate.headers });
  }
}

/**
 * MODO `variacoes_com_lastro` — a peça só nasce se o número dela existir.
 *
 * O que este caminho faz de diferente, e por quê:
 *
 *   NÃO CRIA CAMPANHA. O modo de sempre grava uma linha em
 *   `marketing_campaigns` a cada geração; aqui a peça nasce SOLTA e ancorada no
 *   PRODUTO. Medido em `information_schema` na produção em 02/08/2026:
 *   `creative_assets.campaign_id` é NULLABLE (is_nullable = YES) e sua FK
 *   aponta para `campaigns(id)` — tabela com 0 linhas —, enquanto
 *   `creative_intelligence_versions.development_id` é NOT NULL e referencia
 *   `developments(id)`, que tem as 4 linhas reais. Então a âncora obrigatória
 *   do esquema é o empreendimento, não a campanha: prender a peça a uma
 *   campanha rascunho exigiria inventar uma linha em `campaigns` só para
 *   satisfazer uma FK, ressuscitando uma tabela morta e criando uma TERCEIRA
 *   verdade sobre "campanha". A campanha nasce quando a proposta for aprovada;
 *   até lá, `campaign_id` nulo é o valor honesto, não um contorno.
 *
 *   RECUSA EM VEZ DE CORRIGIR. Variação que cita número fora do estoque não é
 *   reescrita em silêncio: ela volta na resposta, marcada, com o motivo. Quem
 *   aprova precisa ver o que a IA tentou dizer.
 *
 * Continua sem publicar nada: a peça nasce `draft` e a versão nasce com
 * `review_status = 'draft'`, que é o portão da diretoria.
 */
async function gerarComLastro(
  request: NextRequest,
  meta: Parameters<typeof apiSuccess>[1],
  headers: HeadersInit | undefined,
  pedido: {
    organizationId: string;
    developmentId: string;
    objetivo: ObjetivoDeCampanha;
    criadoPor: string;
  },
) {
  const { organizationId, developmentId, objetivo } = pedido;
  try {
    const r = await gerarPecasComLastro({ ...pedido, marketingCampaignId: null });
    if (!r) {
      return apiError("DEVELOPMENT_NOT_FOUND", "Empreendimento não encontrado no seu escopo.", meta, { status: 404, headers });
    }

    structuredApiLog("info", "creative_studio.lastro_generated", request, meta, {
      organizationId, developmentId,
      provedor: r.geracao.provedor, modelo: r.geracao.modelo,
      tokens: r.geracao.tokens, custoUsd: r.geracao.custoUsd,
      variacoes: r.avaliadas.length,
      aprovadas: r.plano.pecas.length,
      gravadas: r.gravacao.gravadas,
      impedimentos: r.plano.impedimentos.length,
    });

    return apiSuccess({
      modo: MODO_COM_LASTRO,
      // A ficha que o modelo leu — cada número com tabela, coluna e filtro.
      ficha: {
        nome: r.ficha.nome,
        bairro: r.ficha.bairro,
        cidade: r.ficha.cidade,
        unidadesDisponiveis: r.ficha.unidadesDisponiveis,
        precoMin: r.ficha.precoMin,
        precoMax: r.ficha.precoMax,
        areaMin: r.ficha.areaMin,
        areaMax: r.ficha.areaMax,
        fatos: r.ficha.fatos,
        fontesWeb: r.ficha.fontesWeb,
        divergenciasDeCadastro: r.ficha.divergenciasDeCadastro,
      },
      // Aprovadas E recusadas, na mesma lista: esconder a recusa faria "saíram
      // 2 peças em vez de 4" parecer capricho do modelo.
      variacoes: r.avaliadas,
      ctaSugerido: ctaDaMeta(objetivo),
      gravacao: {
        gravadas: r.gravacao.gravadas,
        ids: r.gravacao.ids,
        naoGravadas: r.gravacao.naoGravadas,
        recusadas: r.plano.recusadas.length,
        // Zero peças SEM motivo declarado é zero desenhado como saúde.
        impedimentos: r.plano.impedimentos,
      },
      consumo: {
        provedor: r.geracao.provedor, modelo: r.geracao.modelo,
        tokensTotais: r.geracao.tokens,
        custoEstimadoUsd: r.geracao.custoUsd,
        chamadas: 1,
      },
      // Mesmo nome do modo de sempre: é a lista do que o CRM NÃO tem, e é por
      // isso que a peça não cita aquilo.
      pendenciasDoProduto: r.ficha.ausentes,
      proximoPasso:
        "As peças aprovadas ficaram como RASCUNHO em creative_assets, com a versão em review_status='draft'. Aprovar a versão é ato da diretoria; publicar é passo posterior.",
    }, meta, { status: 201, headers });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha desconhecida";
    structuredApiLog("warn", "creative_studio.lastro_failed", request, meta, { organizationId, developmentId, motivo: motivo.slice(0, 120) });
    return apiError("CREATIVE_GENERATION_FAILED", "Não foi possível gerar as peças agora. Nenhuma peça foi gravada.", meta, { status: 502, headers });
  }
}
