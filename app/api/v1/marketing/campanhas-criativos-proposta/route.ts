/**
 * COMPOSIÇÃO DE PROPOSTA DE ANÚNCIO — contexto (GET) e prévia medida (POST).
 *
 * ── Fronteira, dita uma vez e valendo para o arquivo inteiro ───────────────
 *
 * Esta rota NÃO publica, NÃO cria, NÃO pausa e NÃO gasta. Toda conversa com a
 * Meta aqui é GET: listar contas alcançáveis, listar formulários de uma Página,
 * resolver o nome da cidade para a chave numérica. Nada é escrito no banco —
 * nem uma linha de rascunho. Quem registra a proposta é
 * `POST /api/v1/marketing/proposals` (kind "create"), que insere em
 * `approval_requests` com status "pending"; quem executa é
 * `/api/v1/marketing/execute`, depois da aprovação humana em /approvals.
 *
 * A cadeia PROPOR → APROVAR → ATIVAR não é encurtável, e esta rota é só o
 * primeiro degrau: ela monta o plano e MEDE o que falta.
 *
 * ── Por que a prévia é calculada no servidor ───────────────────────────────
 *
 * O plano (`steps`) que vai para a Caixa de Aprovações precisa ser o MESMO que
 * a tela pré-visualizou. Se o cliente montasse os steps, o aprovador estaria
 * assinando algo que ninguém conferiu — e o payload de uma proposta é o que
 * autoriza gasto real. Aqui o plano nasce de `planFullPublication`, o mesmo
 * construtor que `ready-campaigns` usa.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { contasAlcancaveis } from "@/app/api/v1/marketing/ad-accounts/route";
import { cachedMetaRead } from "@/lib/meta/marketing/insights-cache";
import { buildAdCopy, toAssetFeedSpec, leadCampaignSkeleton, isCreativeAngle, type CreativeAngle, type FlexibleAdCopy } from "@/lib/ai/creative-strategist";
import { housingTargetingSpec, validateHousingTargeting } from "@/lib/meta/marketing/housing-audience";
import { planFullPublication } from "@/lib/meta/marketing/publication-plan";
import { chaveDaCidade, pareceChave } from "@/lib/meta/marketing/geo-resolver";
import {
  OBJETIVOS,
  objetivoValido,
  construtorDePlano,
  angulosSugeridos,
  briefDoEmpreendimento,
  prontidaoDaPublicacao,
  resumoDeProntidao,
  previaDoAnuncio,
  resumoDoPlano,
  type ComposicaoEntrada,
  type EmpreendimentoComposicao,
  type LastroDaIA,
  type ObjetivoAnuncio,
  type OrigemDoTexto,
} from "@/lib/marketing/campanhas-criativos-composicao";

export const dynamic = "force-dynamic";

const LIDERANCA = new Set(["director", "superintendent", "manager"]);
const LEAD_AD_LINK = "http://fb.me/";

/**
 * A tela remede a prontidão a cada pausa de digitação (debounce de 450ms), e
 * cada medição precisa saber se a conta é alcançável. Sem cache isso vira uma
 * listagem na Graph API por pausa — leitura idêntica, repetida, contra o rate
 * limit do token.
 *
 * 60s é curto o bastante para uma conta recém-liberada aparecer na mesma
 * sessão, e longo o bastante para o custo sumir.
 *
 * O detalhe que faz isto ser seguro: `cachedMetaRead` só guarda o que passa em
 * `isCacheable`, cujo padrão é `Array.isArray`. `contasAlcancaveis()` devolve
 * `null` quando a Meta não responde — e `null` NÃO é array, então uma falha
 * jamais fica em cache. "Não medido" nunca envelhece como se fosse medido.
 */
const CONTAS_TTL_MS = 60_000;
const lerContas = () => cachedMetaRead("contas-alcancaveis", contasAlcancaveis, { ttlMs: CONTAS_TTL_MS });

function papelDe(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const lista = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((i) => texto(i)).filter((i) => i.length > 0) : [];

/**
 * Carrega os empreendimentos com o inventário de material vivo.
 *
 * `developments` e `crm_projects` guardam OS MESMOS 4 empreendimentos com IDs
 * DIFERENTES. Aqui só `developments` é lido — é a tabela que `project_materials`
 * referencia por `development_id` e a mesma que campaign-readiness usa. Misturar
 * as duas faria a proposta apontar para um id que a prontidão não reconhece.
 */
async function carregarEmpreendimentos(organizationId: string): Promise<EmpreendimentoComposicao[]> {
  const admin = getSupabaseAdmin();
  const { data: devs, error } = await admin
    .from("developments")
    .select("id,name,developer_name,neighborhood,city,price_min,delivery_date,typologies")
    .eq("organization_id", organizationId)
    .order("name");
  if (error || !devs) return [];

  const ids = devs.map((d) => String(d.id));
  const { data: materiais } = await admin
    .from("project_materials")
    .select("development_id,material_type")
    .in("development_id", ids)
    .eq("is_current", true);

  const porDev = new Map<string, string[]>();
  for (const m of materiais ?? []) {
    const chave = String(m.development_id);
    porDev.set(chave, [...(porDev.get(chave) ?? []), String(m.material_type)]);
  }

  return devs.map((d) => ({
    id: String(d.id),
    nome: String(d.name),
    incorporadora: (d.developer_name as string) ?? null,
    bairro: (d.neighborhood as string) ?? null,
    cidade: (d.city as string) ?? null,
    // `price_min` chega como string numérica do Postgres (numeric). Number("")
    // seria 0 e 0 viraria "a partir de R$ 0" na peça — por isso o guarda.
    precoMin: d.price_min == null || Number.isNaN(Number(d.price_min)) ? null : Number(d.price_min),
    entrega: (d.delivery_date as string) ?? null,
    tipologias: Array.isArray(d.typologies) ? (d.typologies as string[]) : [],
    materiais: porDev.get(String(d.id)) ?? [],
  }));
}

/**
 * GET — tudo que a tela de composição precisa para começar, medido agora.
 *
 * Contas vêm da listagem VIVA do token (nunca de uma lista nossa, que
 * envelheceria); `contasMedidas: false` diz que a Meta não respondeu, e a tela
 * mostra "não medido" em vez de fingir que a conta padrão serve.
 */
export async function GET(request: NextRequest) {
  const limite = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "campanhas-criativos.contexto" });
  if (!limite.ok) return limite.response;
  const identidade = await requireAccessContext(request);
  if (!identidade.ok) return identidade.response;
  if (!LIDERANCA.has(papelDe(identidade.access))) {
    return apiError("FORBIDDEN", "Compor proposta de anúncio é decisão da liderança comercial.", identidade.meta, { status: 403, headers: limite.headers });
  }

  const [empreendimentos, contas] = await Promise.all([
    carregarEmpreendimentos(identidade.access.organization.id),
    lerContas(),
  ]);

  const padrao = process.env.META_AD_ACCOUNT_ID?.trim() || null;
  const paginaPadrao = process.env.META_PAGE_ID?.trim() || null;
  const formularioPadrao = process.env.META_LEAD_FORM_ID?.trim() || null;

  return apiSuccess({
    empreendimentos,
    objetivos: OBJETIVOS,
    contas: contas ?? [],
    // Tri-estado explícito: lista vazia por falha ≠ lista vazia de verdade.
    contasMedidas: contas !== null,
    contaPadrao: padrao,
    contaPadraoAlcancavel: contas === null ? null : padrao ? contas.some((c) => c.id === padrao) : false,
    paginaPadrao,
    formularioPadrao,
    // A tela precisa saber para onde manda o usuário depois de propor.
    cadeia: {
      propor: "/api/v1/marketing/proposals",
      aprovar: "/approvals",
      nota: "A proposta entra pendente. Aprovar e ativar são passos humanos posteriores — nada aqui coloca anúncio no ar.",
    },
  }, identidade.meta, { headers: limite.headers });
}

type CorpoPrevia = {
  objetivo?: unknown;
  developmentId?: unknown;
  contaId?: unknown;
  paginaId?: unknown;
  formularioId?: unknown;
  cidade?: unknown;
  verbaDiariaBrl?: unknown;
  duracaoDias?: unknown;
  angulos?: unknown;
  titulos?: unknown;
  textos?: unknown;
  descricoes?: unknown;
  cta?: unknown;
  imageHashes?: unknown;
  videoIds?: unknown;
  origemDoTexto?: unknown;
  lastroDaIA?: unknown;
};

/**
 * POST — monta a prévia: plano de publicação + prontidão item a item.
 *
 * Nada é gravado. A resposta devolve `steps` prontos para a tela submeter a
 * `/api/v1/marketing/proposals` — e devolve junto o motivo de cada item que
 * ainda impede a ATIVAÇÃO, para que o botão nunca fique morto sem explicação.
 */
export async function POST(request: NextRequest) {
  const limite = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "campanhas-criativos.previa" });
  if (!limite.ok) return limite.response;
  const identidade = await requireAccessContext(request);
  if (!identidade.ok) return identidade.response;
  if (!LIDERANCA.has(papelDe(identidade.access))) {
    return apiError("FORBIDDEN", "Compor proposta de anúncio é decisão da liderança comercial.", identidade.meta, { status: 403, headers: limite.headers });
  }

  let corpo: CorpoPrevia;
  try {
    corpo = (await request.json()) as CorpoPrevia;
  } catch {
    return apiError("INVALID_JSON", "Envie JSON válido.", identidade.meta, { status: 400, headers: limite.headers });
  }

  const objetivo: ObjetivoAnuncio = objetivoValido(corpo.objetivo) ? corpo.objetivo : "gerar_leads";
  const developmentId = texto(corpo.developmentId);
  const contaId = texto(corpo.contaId);
  const paginaId = texto(corpo.paginaId) || null;
  const formularioId = texto(corpo.formularioId) || null;
  const verbaDiariaBrl = Number(corpo.verbaDiariaBrl);
  const duracaoDias = Number(corpo.duracaoDias);
  const origemDoTexto: OrigemDoTexto =
    corpo.origemDoTexto === "ia" || corpo.origemDoTexto === "ia_editado" ? corpo.origemDoTexto : "humano";

  const empreendimentos = await carregarEmpreendimentos(identidade.access.organization.id);
  const empreendimento = empreendimentos.find((e) => e.id === developmentId) ?? null;

  // ── Público: nome da cidade → chave numérica da Meta ───────────────────
  // Escolha da cidade: a do empreendimento, salvo se a tela mandar outra.
  const cidade = texto(corpo.cidade) || empreendimento?.cidade || "";
  let chaveCidade: string | null = null;
  let chaveMedida = false;
  if (cidade) {
    if (pareceChave(cidade)) {
      chaveCidade = cidade;
      chaveMedida = true;
    } else if (process.env.META_ADS_ACCESS_TOKEN) {
      // GET em /search?type=adgeolocation — leitura pura, não gasta verba.
      chaveCidade = await chaveDaCidade(cidade, "BR");
      chaveMedida = true;
    }
  }

  // ── Conta: alcançável por ESTE token? ──────────────────────────────────
  const contas = await lerContas();
  const contaAlcancavel = contas === null ? null : contas.some((c) => c.id === contaId);

  // ── Criativo ───────────────────────────────────────────────────────────
  const angulosPedidos = lista(corpo.angulos).filter((a): a is CreativeAngle => isCreativeAngle(a));
  const angulos = angulosPedidos.length ? angulosPedidos : angulosSugeridos(objetivo);

  let titulos = lista(corpo.titulos);
  let textos = lista(corpo.textos);
  let descricoes = lista(corpo.descricoes);
  const ctaPedido = texto(corpo.cta).toUpperCase();
  const cta: FlexibleAdCopy["callToAction"] =
    ctaPedido === "LEARN_MORE" || ctaPedido === "SIGN_UP" || ctaPedido === "CONTACT_US" ? ctaPedido : "SIGN_UP";

  // Sem texto escrito, o determinístico `buildAdCopy` preenche a partir do
  // brief do EMPREENDIMENTO DO BANCO. Isso não é IA: é regra, e a tela o
  // apresenta como "sugestão do sistema", nunca como proposta de IA — confundir
  // os dois faria a marcação de origem mentir.
  let copyBase: FlexibleAdCopy | null = null;
  if (empreendimento && (!titulos.length || !textos.length || !descricoes.length)) {
    copyBase = buildAdCopy(briefDoEmpreendimento(empreendimento), angulos);
    if (!titulos.length) titulos = copyBase.headlines;
    if (!textos.length) textos = copyBase.primaryTexts;
    if (!descricoes.length) descricoes = copyBase.descriptions;
  }

  const imageHashes = lista(corpo.imageHashes);
  const videoIds = lista(corpo.videoIds);

  const lastroDaIA: LastroDaIA | null =
    origemDoTexto === "humano" || typeof corpo.lastroDaIA !== "object" || corpo.lastroDaIA === null
      ? null
      : (corpo.lastroDaIA as LastroDaIA);

  const entrada: ComposicaoEntrada = {
    objetivo,
    empreendimento,
    contaId,
    contaAlcancavel,
    paginaId,
    formularioId,
    publico: { cidade, chaveCidade, chaveMedida, paisISO2: "BR" },
    verbaDiariaBrl,
    duracaoDias: Number.isFinite(duracaoDias) && duracaoDias > 0 ? duracaoDias : 14,
    criativo: { titulos, textos, descricoes, cta, imageHashes, videoIds },
    origemDoTexto,
    lastroDaIA,
  };

  const itens = prontidaoDaPublicacao(entrada);
  const resumo = resumoDeProntidao(itens);
  const previa = previaDoAnuncio(entrada);

  // ── Plano ──────────────────────────────────────────────────────────────
  // O plano só é montado quando há empreendimento e construtor para o objetivo.
  // Sem isso não existe "plano parcial": existe ausência, e ela é dita.
  let steps: ReturnType<typeof planFullPublication> = [];
  let planoIndisponivel: string | null = null;
  let violacoesDePublico: ReturnType<typeof validateHousingTargeting> = [];

  if (!empreendimento) {
    planoIndisponivel = "sem empreendimento escolhido não há produto para anunciar";
  } else if (!construtorDePlano(objetivo)) {
    planoIndisponivel = `o objetivo “${objetivo}” não tem construtor de plano — só campanha de leads é montada aqui`;
  } else if (!Number.isFinite(verbaDiariaBrl) || verbaDiariaBrl <= 0) {
    planoIndisponivel = "sem verba diária positiva o conjunto não tem orçamento";
  } else {
    const brief = briefDoEmpreendimento(empreendimento);
    const copy = copyBase ?? buildAdCopy(brief, angulos);
    // O texto EDITADO na tela vence o gerado: quem escreveu decide.
    const copyFinal: FlexibleAdCopy = {
      ...copy,
      headlines: titulos.length ? titulos : copy.headlines,
      primaryTexts: textos.length ? textos : copy.primaryTexts,
      descriptions: descricoes.length ? descricoes : copy.descriptions,
      callToAction: cta,
    };

    // Geo: a CHAVE quando resolvida; senão cai para o país inteiro. Nunca o
    // nome da cidade — mandar "São Paulo" onde a Meta espera "269969" faz a
    // campanha nascer e o CONJUNTO ser recusado (ver geo-resolver).
    const targeting = chaveCidade
      ? housingTargetingSpec({ countries: ["BR"], cities: [chaveCidade] })
      : housingTargetingSpec({ countries: ["BR"] });
    violacoesDePublico = validateHousingTargeting(targeting);

    const skeleton = leadCampaignSkeleton(brief, verbaDiariaBrl * 7, targeting);
    const assetFeedSpec = toAssetFeedSpec(copyFinal, {
      linkUrl: LEAD_AD_LINK,
      pageId: paginaId ?? undefined,
      imageHashes,
      videoIds,
    });
    steps = planFullPublication({
      accountId: contaId,
      // Placeholders explícitos: o plano continua legível na Caixa mesmo
      // incompleto, e a prontidão já acusou o que falta. Silenciar aqui
      // produziria um payload que parece pronto.
      pageId: paginaId ?? "<<PAGE_ID>>",
      leadFormId: formularioId ?? "<<LEAD_FORM_ID>>",
      product: brief.product,
      skeleton,
      assetFeedSpec,
      imageHashes,
      videoIds,
      adAngles: copyFinal.angles,
    });
  }

  const plano = resumoDoPlano(steps);

  return apiSuccess({
    previa,
    itens,
    resumo,
    plano,
    steps,
    planoIndisponivel,
    violacoesDePublico,
    // Título que a Caixa de Aprovações vai mostrar — o mesmo do plano.
    titulo: empreendimento
      ? `[Atlas] Leads — ${empreendimento.nome}${empreendimento.cidade ? ` — ${empreendimento.cidade}` : ""}`
      : "[Atlas] Proposta de anúncio",
    /**
     * O corpo pronto para `POST /api/v1/marketing/proposals`. A tela reenvia
     * isto sem remontar nada — se ela remontasse, o que o aprovador assina
     * poderia divergir do que a prévia mostrou.
     */
    propostaPronta: steps.length > 0 && contaId
      ? {
          kind: "create" as const,
          title: empreendimento
            ? `[Atlas] Leads — ${empreendimento.nome}${empreendimento.cidade ? ` — ${empreendimento.cidade}` : ""}`
            : "[Atlas] Proposta de anúncio",
          payload: { accountId: contaId, steps, pageId: paginaId, leadFormId: formularioId },
        }
      : null,
    origemDoTexto,
    lastroDaIA,
  }, identidade.meta, { headers: limite.headers });
}
