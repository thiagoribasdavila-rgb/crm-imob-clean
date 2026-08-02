/**
 * COMPOSIÇÃO DE UMA PROPOSTA DE ANÚNCIO — núcleo puro.
 *
 * ── O buraco que isto fecha ────────────────────────────────────────────────
 *
 * Medido no repo e no banco de produção em 02/08/2026, existiam DUAS metades
 * que nunca se encontraram:
 *
 *   1. `app/(crm)/marketing/nova-campanha` COMPÕE (empreendimento, objetivo,
 *      verba, peças de IA) e termina em "rascunho salvo". Nunca propõe nada:
 *      não chama `/api/v1/marketing/proposals`, e `creative_assets` estava com
 *      0 linhas — nenhuma peça daquele fluxo chegou ao banco até hoje.
 *
 *   2. `components/atlas/CampaignApprovalsPanel` PROPÕE com um clique, mas o
 *      que ele propõe vem de `/api/v1/marketing/ready-campaigns`, que é uma
 *      lista CRAVADA de dois produtos ("Arvo" e "Spin Mood"), com persona,
 *      ângulos e verba (R$ 100 e R$ 60/dia) escritos no código. O banco tem 4
 *      empreendimentos; 2 deles — Inside Perdizes e Tiê Aclimação — não têm
 *      caminho nenhum até a Caixa de Aprovações.
 *
 * Este módulo é a peça que faltava entre as duas: recebe uma composição feita
 * na tela (qualquer um dos 4 empreendimentos, verba escolhida, texto escrito ou
 * proposto por IA) e devolve (a) o plano de publicação e (b) a prontidão medida
 * item a item.
 *
 * ── Por que TRI-ESTADO e não booleano ──────────────────────────────────────
 *
 * Um item de prontidão pode estar OK, FALTANDO, ou NÃO MEDIDO — e os três
 * pedem ações diferentes. "A conta de anúncios é alcançável?" só tem resposta
 * se a listagem viva da Meta respondeu; se ela falhou, `false` diria "a conta
 * não serve" (mentira) e `true` diria "pode publicar" (mentira pior). O terceiro
 * estado é o único honesto, e é o que impede o painel de dizer "pronto" sem ter
 * medido cada linha — `podePublicar` exige ausência de faltas E ausência de
 * não-medidos.
 *
 * Este arquivo é PURO: sem rede, sem banco, sem relógio, sem `process.env`.
 * Quem mede o mundo é a rota; aqui só se decide o que a medição significa.
 */

import type { ExecutionStep } from "../meta/marketing/campaign-executor";
import type { ProductBrief, CreativeAngle } from "../ai/creative-strategist";

// ---------------------------------------------------------------------------
// Objetivos
// ---------------------------------------------------------------------------

export type ObjetivoAnuncio =
  | "gerar_leads"
  | "contato_whatsapp"
  | "gerar_visitas"
  | "divulgar_lancamento"
  | "vender_estoque"
  | "atrair_investidores"
  | "remarketing";

/**
 * Os objetivos oferecidos, e QUAL deles tem construtor de plano de verdade.
 *
 * `planFullPublication` monta uma e só uma coisa: campanha OUTCOME_LEADS com
 * formulário instantâneo (destination_type ON_AD). Oferecer os outros seis sem
 * dizer isso produziria uma tela que aceita a escolha, monta um plano de leads
 * por baixo e chama de "campanha de WhatsApp". A lista dos sete continua aqui
 * porque ela é a linguagem do usuário (é a mesma de nova-campanha) — o que muda
 * é que a prontidão acusa quando não há construtor.
 */
export const OBJETIVOS: ReadonlyArray<{
  valor: ObjetivoAnuncio;
  rotulo: string;
  ajuda: string;
  temConstrutorDePlano: boolean;
}> = [
  { valor: "gerar_leads", rotulo: "Gerar leads", ajuda: "formulário instantâneo da Meta; a lead cai no CRM pelo webhook", temConstrutorDePlano: true },
  { valor: "contato_whatsapp", rotulo: "Contato por WhatsApp", ajuda: "abre conversa no número da equipe", temConstrutorDePlano: false },
  { valor: "gerar_visitas", rotulo: "Gerar visitas", ajuda: "agendamento no decorado", temConstrutorDePlano: false },
  { valor: "divulgar_lancamento", rotulo: "Divulgar lançamento", ajuda: "alcance antes da venda", temConstrutorDePlano: false },
  { valor: "vender_estoque", rotulo: "Vender estoque", ajuda: "unidades remanescentes", temConstrutorDePlano: false },
  { valor: "atrair_investidores", rotulo: "Atrair investidores", ajuda: "rentabilidade e liquidez", temConstrutorDePlano: false },
  { valor: "remarketing", rotulo: "Remarketing", ajuda: "quem já demonstrou interesse", temConstrutorDePlano: false },
];

export function objetivoValido(valor: unknown): valor is ObjetivoAnuncio {
  return OBJETIVOS.some((o) => o.valor === valor);
}

export function construtorDePlano(objetivo: ObjetivoAnuncio): boolean {
  return OBJETIVOS.find((o) => o.valor === objetivo)?.temConstrutorDePlano ?? false;
}

// ---------------------------------------------------------------------------
// Entrada da composição
// ---------------------------------------------------------------------------

/** Empreendimento como ele existe em `developments` — não o catálogo em código. */
export type EmpreendimentoComposicao = {
  id: string;
  nome: string;
  incorporadora: string | null;
  bairro: string | null;
  cidade: string | null;
  precoMin: number | null;
  entrega: string | null;
  tipologias: string[];
  /** `material_type` de project_materials com is_current — origem da peça visual. */
  materiais: string[];
};

/** De onde veio o texto do criativo. Viaja até a Caixa de Aprovações. */
export type OrigemDoTexto = "humano" | "ia" | "ia_editado";

/** O que a IA usou para propor — congelado no instante da proposta. */
export type LastroDaIA = {
  provedor: string;
  modelo: string;
  tokensTotais: number;
  custoEstimadoUsd: number | null;
  /** Campos do empreendimento que ESTAVAM preenchidos quando a IA escreveu. */
  camposUsados: string[];
  /** Campos ausentes — a IA não podia citar preço/prazo que não existem. */
  camposAusentes: string[];
  objetivo: ObjetivoAnuncio;
  geradoEm: string;
};

export type CriativoComposicao = {
  titulos: string[];
  textos: string[];
  descricoes: string[];
  cta: string;
  /** Hashes de imagem já enviados à Meta. Vazio = sem mídia. */
  imageHashes: string[];
  videoIds: string[];
};

export type ComposicaoEntrada = {
  objetivo: ObjetivoAnuncio;
  empreendimento: EmpreendimentoComposicao | null;
  contaId: string;
  /**
   * Tri-estado vindo da listagem viva de contas: `true` a conta apareceu,
   * `false` não apareceu, `null` a Meta não respondeu. Ver o docstring do topo.
   */
  contaAlcancavel: boolean | null;
  paginaId: string | null;
  formularioId: string | null;
  publico: {
    cidade: string;
    /** Chave numérica da Meta resolvida por geo-resolver, ou null. */
    chaveCidade: string | null;
    /** `null` = a resolução não pôde ser tentada (sem token / falha de rede). */
    chaveMedida: boolean;
    paisISO2: string;
  };
  verbaDiariaBrl: number;
  duracaoDias: number;
  criativo: CriativoComposicao;
  origemDoTexto: OrigemDoTexto;
  lastroDaIA: LastroDaIA | null;
};

// ---------------------------------------------------------------------------
// Prontidão — tri-estado
// ---------------------------------------------------------------------------

export type EstadoDoItem = "ok" | "falta" | "nao_medido";

export type ItemDeProntidao = {
  chave: string;
  rotulo: string;
  estado: EstadoDoItem;
  /** Sempre presente: um item sem detalhe é um item que não explica a si mesmo. */
  detalhe: string;
  /** Impede publicar. Item não bloqueante deixa publicar com o anúncio pior. */
  bloqueia: boolean;
  /** Onde o usuário resolve isto. Sem caminho, o painel vira lista de queixas. */
  ondeResolver?: { rotulo: string; href: string } | null;
};

export type ResumoDeProntidao = {
  total: number;
  ok: number;
  faltando: number;
  naoMedidos: number;
  bloqueadores: number;
  /**
   * `true` SÓ quando todo item bloqueante está ok E nenhum item ficou sem
   * medição. Não-medido nunca conta como aprovado.
   */
  podePublicar: boolean;
  /** Por que não pode — vazio quando pode. */
  motivos: string[];
};

/** Limites do asset_feed_spec (mesma régua de creative-strategist). */
export const LIMITE_TITULO = 40;
export const LIMITE_TEXTO = 200;
export const LIMITE_DESCRICAO = 30;
/** Verba mínima aceita — abaixo disso a Meta nem entrega o conjunto. */
export const VERBA_DIARIA_MINIMA_BRL = 20;

const limpar = (lista: string[]): string[] =>
  (Array.isArray(lista) ? lista : []).map((t) => String(t ?? "").trim()).filter((t) => t.length > 0);

/**
 * A prontidão da PUBLICAÇÃO — o que esta composição decidiu.
 *
 * Fronteira deliberada: aqui não se mede produto (materiais do empreendimento)
 * nem CRM (corretor para receber a lead). Isso já é medido por
 * `/api/v1/marketing/campaign-readiness`, e medir de novo criaria duas verdades
 * sobre o mesmo item — a classe de defeito que já custou caro neste repositório.
 * A tela junta as duas listas; cada linha tem UMA fonte.
 */
export function prontidaoDaPublicacao(entrada: ComposicaoEntrada): ItemDeProntidao[] {
  const itens: ItemDeProntidao[] = [];
  const titulos = limpar(entrada.criativo.titulos);
  const textos = limpar(entrada.criativo.textos);
  const descricoes = limpar(entrada.criativo.descricoes);
  const midias = entrada.criativo.imageHashes.length + entrada.criativo.videoIds.length;

  // ── Objetivo ───────────────────────────────────────────────────────────
  const temConstrutor = construtorDePlano(entrada.objetivo);
  itens.push({
    chave: "objetivo",
    rotulo: "Construtor de plano para o objetivo",
    estado: temConstrutor ? "ok" : "falta",
    detalhe: temConstrutor
      ? "Gerar leads — campanha OUTCOME_LEADS com formulário instantâneo"
      : "Só o objetivo “Gerar leads” tem plano de publicação montado hoje. Os outros precisam ser montados no Gerenciador de Anúncios.",
    bloqueia: true,
  });

  // ── Empreendimento ─────────────────────────────────────────────────────
  itens.push({
    chave: "empreendimento",
    rotulo: "Empreendimento da proposta",
    estado: entrada.empreendimento ? "ok" : "falta",
    detalhe: entrada.empreendimento
      ? `${entrada.empreendimento.nome}${entrada.empreendimento.bairro ? ` · ${entrada.empreendimento.bairro}` : ""}`
      : "selecione o empreendimento que o anúncio vai vender",
    bloqueia: true,
  });

  // ── Conta de anúncios ──────────────────────────────────────────────────
  // O ID da conta já custou meses de diagnóstico errado: a Meta responde
  // "(#200) ads_management not granted" quando o problema é o ID, e o dinheiro
  // saiu de uma conta enquanto as leads chegavam por outra.
  itens.push({
    chave: "conta",
    rotulo: "Conta de anúncios (de onde sai a verba)",
    estado: !entrada.contaId ? "falta" : entrada.contaAlcancavel === null ? "nao_medido" : entrada.contaAlcancavel ? "ok" : "falta",
    detalhe: !entrada.contaId
      ? "nenhuma conta escolhida"
      : entrada.contaAlcancavel === null
        ? `${entrada.contaId} — a Meta não respondeu à listagem de contas; não dá para afirmar que este token alcança esta conta`
        : entrada.contaAlcancavel
          ? `${entrada.contaId} — confirmada na listagem viva deste token`
          : `${entrada.contaId} não aparece entre as contas que este token alcança`,
    bloqueia: true,
    ondeResolver: { rotulo: "Integrações · Meta", href: "/integrations/meta" },
  });

  // ── Página ─────────────────────────────────────────────────────────────
  itens.push({
    chave: "pagina",
    rotulo: "Página do Facebook/Instagram",
    estado: entrada.paginaId ? "ok" : "falta",
    detalhe: entrada.paginaId
      ? `Página ${entrada.paginaId}`
      : "sem Página o anúncio não tem quem o assine — a Meta recusa o criativo",
    bloqueia: true,
    ondeResolver: { rotulo: "Integrações · Meta", href: "/integrations/meta" },
  });

  // ── Formulário ─────────────────────────────────────────────────────────
  itens.push({
    chave: "formulario",
    rotulo: "Formulário instantâneo de leads",
    estado: entrada.formularioId ? "ok" : "falta",
    detalhe: entrada.formularioId
      ? `Formulário ${entrada.formularioId}`
      : "sem formulário o anúncio de leads não tem onde a pessoa deixar o contato",
    bloqueia: true,
    ondeResolver: { rotulo: "Integrações · Meta", href: "/integrations/meta" },
  });

  // ── Mídia ──────────────────────────────────────────────────────────────
  // Mídia NÃO é resolvida por esta tela: subir imagem/vídeo é escrita na Meta.
  // O que a tela aceita é o hash/ID de algo já enviado.
  itens.push({
    chave: "midia",
    rotulo: "Imagem ou vídeo do anúncio",
    estado: midias > 0 ? "ok" : "falta",
    detalhe: midias > 0
      ? `${entrada.criativo.imageHashes.length} imagem(ns) e ${entrada.criativo.videoIds.length} vídeo(s) referenciados`
      : "anúncio sem peça não é anúncio. Informe o hash da imagem ou o ID do vídeo já enviado à biblioteca da Meta.",
    bloqueia: true,
  });

  // ── Texto ──────────────────────────────────────────────────────────────
  itens.push({
    chave: "titulo",
    rotulo: "Título",
    estado: titulos.length > 0 ? "ok" : "falta",
    detalhe: titulos.length > 0
      ? `${titulos.length} título(s) — o maior com ${Math.max(...titulos.map((t) => t.length))} de ${LIMITE_TITULO} caracteres`
      : "sem título",
    bloqueia: true,
  });
  itens.push({
    chave: "texto_principal",
    rotulo: "Texto principal",
    estado: textos.length > 0 ? "ok" : "falta",
    detalhe: textos.length > 0
      ? `${textos.length} texto(s) — o maior com ${Math.max(...textos.map((t) => t.length))} de ${LIMITE_TEXTO} caracteres`
      : "sem texto principal",
    bloqueia: true,
  });
  itens.push({
    chave: "descricao",
    rotulo: "Descrição",
    estado: descricoes.length > 0 ? "ok" : "falta",
    detalhe: descricoes.length > 0
      ? `${descricoes.length} descrição(ões)`
      : "sem descrição — o anúncio sobe, mas perde uma linha de argumento",
    bloqueia: false,
  });

  // Estouro de limite é falta bloqueante: a Meta trunca ou recusa.
  const estouros = [
    ...titulos.filter((t) => t.length > LIMITE_TITULO).map(() => "título"),
    ...textos.filter((t) => t.length > LIMITE_TEXTO).map(() => "texto principal"),
    ...descricoes.filter((t) => t.length > LIMITE_DESCRICAO).map(() => "descrição"),
  ];
  itens.push({
    chave: "limites_de_texto",
    rotulo: "Texto dentro do limite da Meta",
    estado: estouros.length === 0 ? "ok" : "falta",
    detalhe: estouros.length === 0
      ? `título ≤ ${LIMITE_TITULO}, texto ≤ ${LIMITE_TEXTO}, descrição ≤ ${LIMITE_DESCRICAO}`
      : `${estouros.length} campo(s) acima do limite (${[...new Set(estouros)].join(", ")})`,
    bloqueia: true,
  });

  // ── Público / geo ──────────────────────────────────────────────────────
  // A cidade vai para a Meta como CHAVE numérica. Mandar o nome ("São Paulo")
  // faz a campanha nascer e o CONJUNTO falhar com "A localização para
  // direcionamento não pode ser usada" — defeito já documentado em
  // lib/meta/marketing/geo-resolver.ts.
  itens.push({
    chave: "geo",
    rotulo: "Cidade resolvida na Meta",
    estado: !entrada.publico.chaveMedida ? "nao_medido" : entrada.publico.chaveCidade ? "ok" : "falta",
    detalhe: !entrada.publico.chaveMedida
      ? `“${entrada.publico.cidade}” não pôde ser resolvida agora (sem token da Meta ou leitura falhou) — sem a chave numérica o conjunto de anúncios é recusado`
      : entrada.publico.chaveCidade
        ? `“${entrada.publico.cidade}” → chave ${entrada.publico.chaveCidade}`
        : `“${entrada.publico.cidade}” não corresponde a nenhuma cidade da Meta em ${entrada.publico.paisISO2}`,
    bloqueia: true,
  });

  // ── Verba ──────────────────────────────────────────────────────────────
  const verbaOk = Number.isFinite(entrada.verbaDiariaBrl) && entrada.verbaDiariaBrl >= VERBA_DIARIA_MINIMA_BRL;
  itens.push({
    chave: "verba",
    rotulo: "Verba diária",
    estado: verbaOk ? "ok" : "falta",
    detalhe: verbaOk
      ? `R$ ${entrada.verbaDiariaBrl.toFixed(2)}/dia por ${entrada.duracaoDias} dia(s)`
      : `mínimo de R$ ${VERBA_DIARIA_MINIMA_BRL},00/dia`,
    bloqueia: true,
  });

  return itens;
}

/**
 * Fecha o painel. `podePublicar` é conservador por construção: qualquer item
 * bloqueante faltando OU qualquer item não medido derruba a conclusão.
 */
export function resumoDeProntidao(itens: ItemDeProntidao[]): ResumoDeProntidao {
  const faltando = itens.filter((i) => i.estado === "falta");
  const naoMedidos = itens.filter((i) => i.estado === "nao_medido");
  const bloqueadores = faltando.filter((i) => i.bloqueia);
  const motivos: string[] = [];
  for (const item of bloqueadores) motivos.push(`${item.rotulo}: ${item.detalhe}`);
  for (const item of naoMedidos) motivos.push(`${item.rotulo}: não medido — ${item.detalhe}`);
  return {
    total: itens.length,
    ok: itens.filter((i) => i.estado === "ok").length,
    faltando: faltando.length,
    naoMedidos: naoMedidos.length,
    bloqueadores: bloqueadores.length,
    podePublicar: bloqueadores.length === 0 && naoMedidos.length === 0,
    motivos,
  };
}

// ---------------------------------------------------------------------------
// Do empreendimento do banco para o brief que o planejador entende
// ---------------------------------------------------------------------------

/**
 * `productBrief()` de developer-portfolio lê um catálogo CRAVADO EM CÓDIGO e
 * cobre só os produtos escritos lá. Aqui o brief nasce da linha de
 * `developments` — é o que permite propor os 4 empreendimentos do banco em vez
 * dos 2 do catálogo.
 *
 * Campo ausente fica ausente: `price_min` nulo NÃO vira 0. Preço zero no brief
 * viraria "a partir de R$ 0" numa peça de anúncio.
 */
export function briefDoEmpreendimento(dev: EmpreendimentoComposicao): ProductBrief {
  const brief: ProductBrief = { product: dev.nome };
  if (dev.incorporadora) brief.developer = dev.incorporadora;
  if (dev.bairro) brief.neighborhood = dev.bairro;
  if (dev.cidade) brief.city = dev.cidade;
  if (typeof dev.precoMin === "number" && dev.precoMin > 0) brief.priceFrom = dev.precoMin;
  if (dev.tipologias.length) brief.differentials = dev.tipologias.slice(0, 4);
  return brief;
}

/** Ângulos padrão por objetivo — ponto de partida, editável na tela. */
export function angulosSugeridos(objetivo: ObjetivoAnuncio): CreativeAngle[] {
  switch (objetivo) {
    case "atrair_investidores":
      return ["investimento", "localizacao"];
    case "vender_estoque":
      return ["entrega_imediata", "localizacao"];
    case "divulgar_lancamento":
      return ["localizacao", "estilo_de_vida"];
    default:
      return ["sair_do_aluguel", "localizacao", "estilo_de_vida"];
  }
}

// ---------------------------------------------------------------------------
// Prévia — o que a pessoa vai ver publicado
// ---------------------------------------------------------------------------

export type PreviaDoAnuncio = {
  paginaId: string | null;
  titulo: string | null;
  textoPrincipal: string | null;
  descricao: string | null;
  cta: string;
  temMidia: boolean;
  midiaResumo: string;
  origemDoTexto: OrigemDoTexto;
};

/** A primeira variação é a que a Meta mostra primeiro — é essa que se pré-vê. */
export function previaDoAnuncio(entrada: ComposicaoEntrada): PreviaDoAnuncio {
  const titulos = limpar(entrada.criativo.titulos);
  const textos = limpar(entrada.criativo.textos);
  const descricoes = limpar(entrada.criativo.descricoes);
  const imagens = entrada.criativo.imageHashes.length;
  const videos = entrada.criativo.videoIds.length;
  return {
    paginaId: entrada.paginaId,
    titulo: titulos[0] ?? null,
    textoPrincipal: textos[0] ?? null,
    descricao: descricoes[0] ?? null,
    cta: entrada.criativo.cta,
    temMidia: imagens + videos > 0,
    midiaResumo:
      imagens + videos === 0
        ? "sem mídia anexada"
        : [imagens ? `${imagens} imagem(ns)` : null, videos ? `${videos} vídeo(s)` : null].filter(Boolean).join(" · "),
    origemDoTexto: entrada.origemDoTexto,
  };
}

// ---------------------------------------------------------------------------
// Resumo do plano técnico
// ---------------------------------------------------------------------------

export type ResumoDoPlano = {
  passos: number;
  campanhas: number;
  conjuntos: number;
  criativos: number;
  anuncios: number;
  /** Toda estrutura nasce PAUSED. Se algum passo não nascer, é defeito grave. */
  todosPausados: boolean;
  statusEncontrados: string[];
};

function coletarStatus(valor: unknown, saida: string[] = []): string[] {
  if (Array.isArray(valor)) {
    for (const item of valor) coletarStatus(item, saida);
    return saida;
  }
  if (typeof valor === "object" && valor !== null) {
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (chave === "status" && typeof v === "string") saida.push(v);
      coletarStatus(v, saida);
    }
  }
  return saida;
}

/**
 * Conta o que o plano vai criar e CONFERE que nada nasce ativo.
 *
 * `planFullPublication` já força PAUSED, mas conferir aqui é barato e a
 * asserção aponta para a propriedade que importa (nenhum ACTIVE), não para a
 * implementação que a produz.
 */
export function resumoDoPlano(passos: ExecutionStep[]): ResumoDoPlano {
  const status = coletarStatus(passos.map((p) => p.payload));
  return {
    passos: passos.length,
    campanhas: passos.filter((p) => p.kind === "create_campaign").length,
    conjuntos: passos.filter((p) => p.kind === "create_adset").length,
    criativos: passos.filter((p) => p.kind === "create_creative").length,
    anuncios: passos.filter((p) => p.kind === "create_ad").length,
    todosPausados: status.every((s) => s.toUpperCase() !== "ACTIVE"),
    statusEncontrados: [...new Set(status)],
  };
}
