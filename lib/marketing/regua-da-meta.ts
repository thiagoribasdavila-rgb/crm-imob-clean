/**
 * A RÉGUA DA META — o que a plataforma recusaria, medido ANTES de propor.
 *
 * ── O buraco que isto fecha ────────────────────────────────────────────────
 *
 * Medido no repo em 02/08/2026, a composição de proposta tinha DOIS elos
 * partidos entre o que o produto sabe e o que o produto confere:
 *
 *   1. `validateCopy` (lib/ai/creative-strategist.ts) conhece 9 padrões
 *      proibidos de copy — discriminação HOUSING, atributo pessoal, promessa
 *      financeira. Quem chama: `campaign-intake` e `creative`. Quem NÃO chama:
 *      `app/api/v1/marketing/campanhas-criativos-proposta`, a rota da tela onde
 *      a pessoa DIGITA o texto. O texto gerado por `buildAdCopy` passa pelo
 *      `scrub()` interno; o texto EDITADO na tela não passava por nada. O
 *      caminho seguro e o caminho real divergiram — a mesma classe de defeito
 *      que já custou caro aqui.
 *
 *   2. `validateHousingTargeting` (lib/meta/marketing/housing-audience.ts) era
 *      chamada pela rota, o resultado ia para `violacoesDePublico`, a tela
 *      pintava a linha de vermelho — e o botão "Enviar para aprovação" seguia
 *      habilitado, porque `propostaPronta` só olhava `steps.length && contaId`.
 *      Reprovar sem bloquear é decorar o problema.
 *
 * Este módulo é a régua que faltava: junta texto, política, mídia e público num
 * veredito único, item a item, com FONTE em cada regra.
 *
 * ── Por que a fonte viaja junto com a regra ────────────────────────────────
 *
 * Este produto vende imóvel, e anúncio imobiliário na Meta é categoria especial
 * (HOUSING). Errar aqui não derruba o anúncio: derruba a CONTA. Uma regra sem
 * procedência é um palpite que ninguém consegue auditar depois — por isso cada
 * item carrega `fonte` (url + publicador + data) e a distinção entre o que a
 * Meta DOCUMENTA e o que é piso conservador NOSSO está dita em cada constante.
 *
 * ── Bloqueio vs aviso ──────────────────────────────────────────────────────
 *
 * `bloqueio` = a Meta recusa, ou a política põe a conta em risco.
 * `aviso`    = entrega pior, sem recusa. Aparece, não impede.
 *
 * A separação não é cosmética: a regra dos 20% de texto na imagem FOI REVOGADA
 * pela Meta (set/2020). Tratá-la como bloqueio hoje seria inventar uma recusa
 * que não existe — e produto que reprova o que a plataforma aceita ensina o
 * usuário a ignorar a régua inteira.
 *
 * ── DUAS perguntas, não uma: `impede` ──────────────────────────────────────
 *
 * A primeira versão desta régua tinha um bloqueio só, e ele zerou a emissão de
 * propostas. Medido em 02/08/2026: `creative_assets` e `campaign_assets` têm 0
 * linhas no banco de produção, então TODA composição chega aqui com
 * `midias: []` — e a falta de mídia derrubava `podePropor`. A tela de composição
 * não conseguia emitir NENHUMA proposta, e ninguém tinha declarado isso.
 *
 * O erro foi juntar duas perguntas de naturezas opostas debaixo da mesma
 * palavra:
 *
 *   `impede: "propor"` — A PEÇA ESTÁ ERRADA e nenhuma revisão humana conserta.
 *      Texto fora do limite, promessa proibida, público ilegal, HOUSING não
 *      declarado. Mandar isso para aprovação convida alguém a APROVAR o que não
 *      pode existir — e uma aprovação registrada é exatamente o documento que
 *      autoriza gasto depois.
 *
 *   `impede: "ativar"` — O ARTEFATO AINDA NÃO EXISTE. Mídia, Página,
 *      formulário. Não há nada de errado na peça: falta uma coisa que aparece
 *      DEPOIS, por outra mão (subir imagem é escrita na conta do dono; a Página
 *      é decisão dele). Propor com isso pendente é o fluxo normal — a proposta
 *      pendente é justamente o que faz o dono resolver.
 *
 *   `impede: "nada"` — aviso. Entrega pior, sem recusa.
 *
 * A assimetria já existia e estava dita na rota: faltar Página ou formulário
 * deixava PROPOR e bloqueava a ATIVAÇÃO. Mídia é o mesmo tipo de artefato — o
 * que faltava era a régua dizer isso.
 *
 * O inverso também é proibido, e é o erro mais caro dos dois: a proposta que sai
 * sem mídia NÃO pode chegar ao botão de ativar parecendo pronta. Por isso
 * `podeAtivar` existe neste mesmo veredito, `motivosParaAtivar` carrega o que
 * falta, cada item de artefato traz `ondeResolver`, e quem aprova recebe a
 * mesma lista medida no plano que vai assinar (lib/marketing/pendencias-de-ativacao.ts).
 *
 * ── Purezas e fronteiras ───────────────────────────────────────────────────
 *
 * Módulo PURO: sem rede, sem banco, sem relógio, sem `process.env`, sem `fs`.
 * Importa só `creative-strategist` e `housing-audience`, ambos puros — é o que
 * permite a TELA (client component) usar a mesma régua do servidor.
 *
 * NÃO importa `lib/ai/niveis-de-autonomia.ts` de propósito: aquele módulo lê
 * `fs`/`path` no topo e quebraria o bundle do cliente. O acoplamento com o
 * catálogo do dono é feito pelos IDs de regra (`garantir_preco_ou_estoque`,
 * `prometer_financiamento`, iguais aos de `ACOES_PROIBIDAS_AUTONOMAMENTE`) e
 * VERIFICADO por contrato em tests/contracts/regua-da-meta.test.mjs, que roda em
 * node e pode importar os dois lados. Coupling provado vale mais que import.
 */

import { validateCopy, type FlexibleAdCopy, type CopyViolation } from "../ai/creative-strategist.ts";
import {
  validateHousingTargeting,
  HOUSING_MIN_RADIUS_KM,
  HOUSING_AGE_MIN,
  HOUSING_AGE_MAX,
  type TargetingViolation,
} from "../meta/marketing/housing-audience.ts";

// ---------------------------------------------------------------------------
// Fontes — toda regra abaixo aponta para uma destas
// ---------------------------------------------------------------------------

/**
 * As fontes são constantes exportadas (e não comentários soltos) porque elas
 * VIAJAM no veredito até a tela: quem lê "reprovado" precisa poder conferir a
 * regra sem perguntar a ninguém.
 */
export const FONTES = {
  categoriaEspecial: {
    regra: "Special Ad Category — restrições de segmentação",
    url: "https://developers.facebook.com/docs/marketing-api/audiences/special-ad-category/",
    publicador: "Meta for Developers — Marketing API",
    lidoEm: "2026-08-02",
  },
  discriminacao: {
    regra: "Advertising Standards — Discriminatory Practices",
    url: "https://transparency.meta.com/policies/ad-standards/unacceptable-content/discriminatory-practices/",
    publicador: "Meta Transparency Center",
    lidoEm: "2026-08-02 (política atualizada em 20/12/2024)",
  },
  atributosPessoais: {
    regra: "Advertising Standards — Personal Attributes",
    url: "https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/",
    publicador: "Meta Transparency Center",
    lidoEm: "2026-08-02",
  },
  /**
   * Piso NOSSO, não da Meta. A Meta aceita textos bem mais longos (o campo de
   * texto principal chega a centenas de caracteres) e TRUNCA em silêncio em vez
   * de recusar. Num anúncio imobiliário, a frase truncada costuma ser
   * exatamente a ressalva jurídica ("sujeitas a análise de crédito") — por isso
   * aqui o estouro bloqueia. Estes números vêm do asset_feed_spec e já eram os
   * do produto antes desta régua; mantidos idênticos para não afrouxar portão.
   */
  limitesDoProduto: {
    regra: "Limites de asset_feed_spec adotados pelo Atlas (piso conservador)",
    url: "https://developers.facebook.com/docs/marketing-api/reference/ad-asset-feed-spec/",
    publicador: "Meta for Developers + decisão do produto",
    lidoEm: "2026-08-02",
  },
  /**
   * Truncamento visível por posicionamento. NÃO há página oficial da Meta que
   * publique estes números como contrato — são medidas de mercado, repetidas por
   * várias fontes secundárias. Por isso tudo que depende delas é AVISO, nunca
   * bloqueio: dizer "a Meta recusa com 28 caracteres" seria inventar recusa.
   */
  truncamentoVisivel: {
    regra: "Corte visual por posicionamento (fonte secundária)",
    url: "https://www.facebook.com/business/ads-guide",
    publicador: "Meta Ads Guide + levantamentos de mercado (fonte secundária)",
    lidoEm: "2026-08-02",
  },
  /**
   * A regra dos 20% de texto na imagem foi REVOGADA. Meta anunciou em set/2020
   * que deixaria de penalizar entrega por volume de texto. Continua valendo como
   * recomendação de desempenho — e é só isso que este módulo afirma.
   */
  textoNaImagem: {
    regra: "Texto na imagem — regra dos 20% revogada (set/2020), hoje só desempenho",
    url: "https://www.facebook.com/business/help/980593475366490",
    publicador: "Meta Business Help + anúncio público de set/2020 (fonte secundária)",
    lidoEm: "2026-08-02",
  },
} as const;

export type Fonte = (typeof FONTES)[keyof typeof FONTES];

/** Formata a fonte para a linha da tela — url + publicador + data, sempre. */
export function citar(fonte: Fonte): string {
  return `${fonte.publicador} · ${fonte.url} · ${fonte.lidoEm}`;
}

// ---------------------------------------------------------------------------
// Limites de texto
// ---------------------------------------------------------------------------

/**
 * Piso do produto — o que BLOQUEIA. Fonte: FONTES.limitesDoProduto.
 *
 * Estes três números já viviam em `campanhas-criativos-composicao.ts`. Foram
 * movidos para cá e re-exportados de lá: um limite em dois arquivos é a receita
 * de duas verdades divergindo na próxima edição.
 */
export const LIMITE_TITULO = 40;
export const LIMITE_TEXTO = 200;
export const LIMITE_DESCRICAO = 30;
/** asset_feed_spec aceita no máximo 5 variações por campo. */
export const MAX_VARIACOES_POR_CAMPO = 5;

export type CampoDeTexto = "titulo" | "texto" | "descricao";

/**
 * Quanto o leitor VÊ antes do corte, por posicionamento.
 *
 * `null` = a fonte não afirma nada para aquele campo naquele posicionamento, e
 * ausência de número não vira zero: um item sem medida não é um item reprovado.
 * (Zero desenhado como saúde é proibido neste repositório; zero desenhado como
 * doença é o mesmo erro com o sinal trocado.)
 */
export type Posicionamento = {
  id: string;
  rotulo: string;
  visivel: Record<CampoDeTexto, number | null>;
  nota: string;
};

export const POSICIONAMENTOS: ReadonlyArray<Posicionamento> = [
  {
    id: "feed",
    rotulo: "Feed (Facebook e Instagram)",
    visivel: { titulo: 27, texto: 125, descricao: 30 },
    nota: 'Acima de 125 caracteres o texto principal vira "… ver mais" e a maioria não clica. Títulos passam de 27 caracteres somem em telas pequenas.',
  },
  {
    id: "stories",
    rotulo: "Stories",
    visivel: { titulo: 40, texto: null, descricao: null },
    nota: "Stories dá pouquíssimo espaço a texto fora da peça — o argumento tem de estar na imagem, respeitando as áreas de segurança do topo e do rodapé.",
  },
  {
    id: "reels_overlay",
    rotulo: "Reels (sobreposição)",
    visivel: { titulo: 10, texto: null, descricao: null },
    nota: "A sobreposição de Reels é o corte mais agressivo do inventário: o título praticamente não aparece. Não escreva o argumento decisivo nele.",
  },
] as const;

// ---------------------------------------------------------------------------
// Política de texto — o que o setor imobiliário NÃO pode afirmar
// ---------------------------------------------------------------------------

/**
 * O que `validateCopy` JÁ pega (e por isso não é repetido aqui): "exclusivo/
 * apenas para", "ideal para <grupo>", "não alugamos para", "para você que",
 * "você ganha/tem N anos/está endividado", "sua renda/idade/dívida",
 * "garantido", "sem risco", "retorno/lucro certo".
 *
 * O que ele NÃO pega — e o que este bloco acrescenta:
 *
 *   · a forma INTERROGATIVA de atributo pessoal ("Está negativado?"), que é
 *     literalmente o exemplo da política da Meta ("Are you bankrupt?");
 *   · promessa de crédito sem a ressalva de análise ("crédito aprovado",
 *     "sem consulta ao SPC") — `prometer_financiamento` do catálogo do dono;
 *   · congelamento de preço ("preço travado", "valor não sobe") —
 *     `garantir_preco_ou_estoque` do catálogo do dono.
 *
 * As duas últimas famílias usam como `regra` exatamente o nome da ação proibida
 * em `ACOES_PROIBIDAS_AUTONOMAMENTE` (lib/ai/niveis-de-autonomia.ts). O contrato
 * confere que os nomes batem — se alguém renomear a ação lá, o portão acusa aqui.
 */
export type RegraDeTexto = {
  regra: string;
  re: RegExp;
  severidade: "bloqueio" | "aviso";
  detalhe: string;
  fonte: Fonte;
};

export const REGRAS_DE_TEXTO: ReadonlyArray<RegraDeTexto> = [
  // ── Atributo pessoal na forma interrogativa ──────────────────────────────
  {
    regra: "atributo_pessoal",
    re: /\b(est[áa]|voc[êe]\s+est[áa])\s+(negativad|endividad|desempregad|apertad)\w*\s*\?/i,
    severidade: "bloqueio",
    detalhe:
      'Pergunta sobre situação financeira do leitor ("Está negativado?") afirma atributo pessoal — a política da Meta traz "Are you bankrupt?" como exemplo vetado.',
    fonte: FONTES.atributosPessoais,
  },
  {
    regra: "atributo_pessoal",
    re: /\b(nome\s+sujo|score\s+baixo|negativad[oa]s?\s+(pode|consegue|aprova))/i,
    severidade: "bloqueio",
    detalhe:
      '"Nome sujo"/"score baixo" atribui situação financeira vulnerável a quem vê o anúncio — atributo protegido pela política de Personal Attributes.',
    fonte: FONTES.atributosPessoais,
  },
  {
    regra: "discriminacao_housing",
    re: /\b(primeir[oa]\s+im[óo]vel\s+)?(s[óo]|apenas|somente)\s+(para\s+)?(quem|servidor|militar|funcion[áa]ri)\w*/i,
    severidade: "bloqueio",
    detalhe:
      "Restringir a oferta de moradia a uma categoria de pessoas é prática discriminatória — a Meta veta direcionar ou excluir grupos em anúncio de habitação.",
    fonte: FONTES.discriminacao,
  },
  // ── Promessa de crédito — prometer_financiamento ─────────────────────────
  {
    regra: "prometer_financiamento",
    re: /\b(cr[ée]dito|financiamento|aprova[çc][ãa]o)\s+(aprovad|garantid|certo|imediat|na\s+hora)\w*/i,
    severidade: "bloqueio",
    detalhe:
      "Aprovação de crédito é decisão do banco. Prometê-la no anúncio cria obrigação que a imobiliária não pode cumprir (ação proibida do catálogo: prometer_financiamento).",
    fonte: FONTES.discriminacao,
  },
  {
    regra: "prometer_financiamento",
    re: /\bsem\s+(consulta\s+(ao\s+)?(spc|serasa)|an[áa]lise\s+de\s+cr[ée]dito|burocracia\s+banc[áa]ria)/i,
    severidade: "bloqueio",
    detalhe:
      '"Sem consulta ao SPC/Serasa" ou "sem análise de crédito" promete contornar a análise do banco — promessa que não se cumpre e que sinaliza público por situação financeira.',
    fonte: FONTES.atributosPessoais,
  },
  {
    regra: "prometer_financiamento",
    re: /\b100\s*%\s*financiad|\bfinanciamos\s+100\s*%/i,
    severidade: "bloqueio",
    detalhe:
      'Financiamento integral depende de enquadramento e análise. Afirmá-lo como fato ("100% financiado") promete condição de crédito que só o banco concede.',
    fonte: FONTES.discriminacao,
  },
  // ── Preço e estoque — garantir_preco_ou_estoque ──────────────────────────
  {
    regra: "garantir_preco_ou_estoque",
    re: /\b(pre[çc]o|valor|tabela)\s+(congelad|travad|fix[oa]\s+at[ée]|n[ãa]o\s+(sobe|muda))\w*/i,
    severidade: "bloqueio",
    detalhe:
      "Preço e tabela mudam por fora do anúncio. Garantir que não mudam gera venda que não existe (ação proibida do catálogo: garantir_preco_ou_estoque).",
    fonte: FONTES.discriminacao,
  },
  {
    regra: "garantir_preco_ou_estoque",
    re: /\b([úu]ltim[ao]s?\s+(unidade|apartamento|studio)|resta[m]?\s+\d+\s+unidade)\w*/i,
    severidade: "aviso",
    detalhe:
      "Escassez declarada ('últimas unidades') é afirmação sobre estoque que envelhece: o anúncio continua rodando depois de a informação deixar de ser verdade. Só use com estoque conferido hoje.",
    fonte: FONTES.discriminacao,
  },
] as const;

// ---------------------------------------------------------------------------
// Mídia
// ---------------------------------------------------------------------------

/**
 * A régua de mídia. Note o que NÃO dá para medir aqui: a composição guarda
 * `image_hash`, não a imagem. Largura, altura e proporção de texto só existem
 * depois de uma leitura na Graph API — que é permitida, mas não neste módulo
 * puro. Por isso `conferirMidia` aceita medidas OPCIONAIS e devolve "não medido"
 * quando elas não vêm. Nunca "ok".
 */
export const PROPORCOES_ACEITAS = [
  { id: "1:1", rotulo: "Quadrado 1:1", valor: 1, exemplo: "1080 × 1080", onde: "cobre quase todos os posicionamentos; obrigatório em carrossel" },
  { id: "4:5", rotulo: "Vertical 4:5", valor: 0.8, exemplo: "1080 × 1350", onde: "recomendado no feed — ocupa mais tela no celular" },
  { id: "9:16", rotulo: "Vertical cheio 9:16", valor: 0.5625, exemplo: "1080 × 1920", onde: "Stories e Reels — única que preenche a tela" },
] as const;

/** Lado menor mínimo, em pixels. Abaixo disso a peça sobe borrada. */
export const LADO_MENOR_MINIMO_PX = 1080;
/** Teto de arquivo por imagem, em megabytes. */
export const TAMANHO_MAXIMO_IMAGEM_MB = 30;
/** Fração de texto na imagem a partir da qual a entrega costuma piorar. */
export const TEXTO_NA_IMAGEM_RECOMENDADO = 0.2;
/** Tolerância de proporção: 2% cobre arredondamento de corte, não erro de formato. */
const TOLERANCIA_PROPORCAO = 0.02;

export type MidiaMedida = {
  referencia: string;
  larguraPx?: number | null;
  alturaPx?: number | null;
  tamanhoMb?: number | null;
  /** 0–1. Fração da área da imagem coberta por texto, quando medida. */
  fracaoDeTexto?: number | null;
};

/** A proporção aceita mais próxima, ou null se nenhuma bate dentro da tolerância. */
export function proporcaoMaisProxima(largura: number, altura: number) {
  if (!(largura > 0) || !(altura > 0)) return null;
  const razao = largura / altura;
  let melhor: (typeof PROPORCOES_ACEITAS)[number] | null = null;
  let menorErro = Number.POSITIVE_INFINITY;
  for (const p of PROPORCOES_ACEITAS) {
    const erro = Math.abs(razao - p.valor) / p.valor;
    if (erro < menorErro) {
      menorErro = erro;
      melhor = p;
    }
  }
  return melhor && menorErro <= TOLERANCIA_PROPORCAO ? melhor : null;
}

// ---------------------------------------------------------------------------
// Veredito
// ---------------------------------------------------------------------------

export type EstadoDaRegua = "aprovado" | "reprovado" | "nao_medido";
export type SeveridadeDaRegua = "bloqueio" | "aviso";
export type GrupoDaRegua = "texto" | "politica" | "midia" | "publico";

/**
 * QUANDO o item morde. Ver o bloco "DUAS perguntas" no topo do arquivo.
 *
 * Invariante conferida por contrato: `aviso` ⟺ `nada`. Um aviso que impedisse
 * alguma coisa deixaria de ser aviso, e um bloqueio que não impedisse nada seria
 * um bloqueio decorativo — as duas metades da mesma mentira.
 */
export type MomentoImpedido = "propor" | "ativar" | "nada";

export type ItemDaRegua = {
  chave: string;
  grupo: GrupoDaRegua;
  rotulo: string;
  estado: EstadoDaRegua;
  severidade: SeveridadeDaRegua;
  /** O que este item impede quando reprova. */
  impede: MomentoImpedido;
  /** Por que passou ou por que reprovou — um item que não se explica não serve. */
  detalhe: string;
  /** url + publicador + data. Sem lastro não entra regra nesta régua. */
  fonte: string;
  /** O trecho exato que derrubou o item, quando existe. */
  trecho?: string | null;
  /**
   * Onde o artefato que falta é resolvido. Obrigatório na prática para
   * `impede: "ativar"` — dizer "falta mídia" sem dizer onde resolvê-la produz a
   * lista de queixas que este repositório já proibiu no painel de prontidão.
   */
  ondeResolver?: { rotulo: string; href: string } | null;
};

export type VereditoDaRegua = {
  itens: ItemDaRegua[];
  aprovados: number;
  reprovados: number;
  naoMedidos: number;
  /**
   * TODOS os bloqueios reprovados, dos dois momentos. Continua existindo (e
   * somando os dois) porque encolher um número que a tela já mostrava seria
   * esconder a mudança em vez de declará-la.
   */
  bloqueios: number;
  /** Reprovados que impedem PROPOR — a peça está errada. */
  bloqueiosParaPropor: number;
  /** Reprovados que impedem ATIVAR — o artefato ainda não existe. */
  bloqueiosParaAtivar: number;
  avisos: number;
  /**
   * `false` quando existe bloqueio reprovado com `impede: "propor"`. Item não
   * medido não derruba a proposta (a mídia raramente é medível aqui), mas também
   * nunca conta como aprovado — ele aparece como o que é.
   */
  podePropor: boolean;
  /**
   * `false` quando falta QUALQUER coisa para o anúncio ir ao ar — inclusive o
   * que só impede propor, porque o que não pode ser proposto também não pode ser
   * ativado. É o campo que impede a proposta sem mídia de chegar ao botão de
   * ativar parecendo pronta.
   */
  podeAtivar: boolean;
  /** Por que não pode PROPOR. Vazio quando pode. */
  motivos: string[];
  /** O que ainda falta para ATIVAR — com onde resolver, quando existe. */
  motivosParaAtivar: string[];
};

export type PecaParaConferir = {
  titulos: string[];
  textos: string[];
  descricoes: string[];
  /** Targeting já montado (housingTargetingSpec). Ausente = não medido. */
  targeting?: Record<string, unknown> | null;
  /** `special_ad_categories` da campanha. Ausente = não medido. */
  categoriasEspeciais?: string[] | null;
  /** Mídias com medidas, quando houver. Referências sem medida viram não medido. */
  midias?: MidiaMedida[];
};

const limpar = (lista: unknown): string[] =>
  (Array.isArray(lista) ? lista : []).map((t) => String(t ?? "").trim()).filter((t) => t.length > 0);

/**
 * A régua inteira, item a item.
 *
 * A ordem importa para quem lê: política antes de tamanho. Um texto
 * discriminatório com 39 caracteres não é "quase pronto".
 */
export function conferirPecaNaMeta(peca: PecaParaConferir): VereditoDaRegua {
  const itens: ItemDaRegua[] = [
    ...conferirPolitica(peca),
    ...conferirLimitesDeTexto(peca),
    ...conferirPublico(peca),
    ...conferirMidia(peca.midias ?? []),
  ];
  return fecharVeredito(itens);
}

const frase = (i: ItemDaRegua): string =>
  `${i.rotulo}: ${i.detalhe}${i.ondeResolver ? ` Resolve em ${i.ondeResolver.rotulo} (${i.ondeResolver.href}).` : ""}`;

export function fecharVeredito(itens: ItemDaRegua[]): VereditoDaRegua {
  const reprovados = itens.filter((i) => i.estado === "reprovado");
  const bloqueios = reprovados.filter((i) => i.severidade === "bloqueio");
  const dePropor = bloqueios.filter((i) => i.impede === "propor");
  const deAtivar = bloqueios.filter((i) => i.impede === "ativar");
  return {
    itens,
    aprovados: itens.filter((i) => i.estado === "aprovado").length,
    reprovados: reprovados.length,
    naoMedidos: itens.filter((i) => i.estado === "nao_medido").length,
    bloqueios: bloqueios.length,
    bloqueiosParaPropor: dePropor.length,
    bloqueiosParaAtivar: deAtivar.length,
    avisos: reprovados.filter((i) => i.severidade === "aviso").length,
    podePropor: dePropor.length === 0,
    // Os DOIS entram: o que não pode ser proposto tampouco pode ir ao ar. Somar
    // só `deAtivar` faria uma peça com texto ilegal e imagem anexada aparecer
    // como "pronta para ativar".
    podeAtivar: bloqueios.length === 0,
    motivos: dePropor.map(frase),
    motivosParaAtivar: [...deAtivar, ...dePropor].map(frase),
  };
}

// ── Política ──────────────────────────────────────────────────────────────

const ROTULO_CAMPO: Record<CampoDeTexto, string> = {
  titulo: "título",
  texto: "texto principal",
  descricao: "descrição",
};

function campos(peca: PecaParaConferir): Array<{ campo: CampoDeTexto; itens: string[] }> {
  return [
    { campo: "titulo", itens: limpar(peca.titulos) },
    { campo: "texto", itens: limpar(peca.textos) },
    { campo: "descricao", itens: limpar(peca.descricoes) },
  ];
}

/**
 * Política de conteúdo: o que `validateCopy` já sabe MAIS o que falta.
 *
 * `validateCopy` pede um `FlexibleAdCopy` inteiro; aqui só existem as três
 * listas. Montar o objeto mínimo e chamar a função existente é o ponto —
 * reescrever os 9 padrões produziria uma segunda régua para divergir da
 * primeira.
 */
export function conferirPolitica(peca: PecaParaConferir): ItemDaRegua[] {
  const itens: ItemDaRegua[] = [];
  const titulos = limpar(peca.titulos);
  const textos = limpar(peca.textos);
  const descricoes = limpar(peca.descricoes);

  // ── 1. A régua que já existe ────────────────────────────────────────────
  const copy: FlexibleAdCopy = {
    product: "",
    angles: [],
    primaryTexts: textos,
    headlines: titulos,
    descriptions: descricoes,
    callToAction: "LEARN_MORE",
    complianceNotes: [],
  };
  // `limite_itens`/`limite_caracteres`/`duplicata` são tamanho, não política —
  // saem daqui para não reportar o mesmo defeito em dois lugares com nomes
  // diferentes. Quem cuida de tamanho é conferirLimitesDeTexto.
  const deTamanho = new Set(["limite_itens", "limite_caracteres", "duplicata"]);
  const politicas: CopyViolation[] = validateCopy(copy).filter((v) => !deTamanho.has(v.rule));

  const fonteDaRegraExistente = (regra: string): Fonte =>
    regra === "atributo_pessoal" ? FONTES.atributosPessoais : FONTES.discriminacao;

  for (const [i, v] of politicas.entries()) {
    itens.push({
      chave: `politica_existente_${i}`,
      grupo: "politica",
      rotulo: `Política da Meta — ${v.rule.replace(/_/g, " ")}`,
      estado: "reprovado",
      severidade: "bloqueio",
      impede: "propor",
      detalhe: v.detail,
      fonte: citar(fonteDaRegraExistente(v.rule)),
    });
  }

  // ── 2. O que a régua existente não cobria ───────────────────────────────
  for (const { campo, itens: lista } of campos(peca)) {
    lista.forEach((texto, indice) => {
      for (const regra of REGRAS_DE_TEXTO) {
        const achado = texto.match(regra.re);
        if (!achado) continue;
        itens.push({
          chave: `politica_${regra.regra}_${campo}_${indice}`,
          grupo: "politica",
          rotulo: `Política da Meta — ${regra.regra.replace(/_/g, " ")} (${ROTULO_CAMPO[campo]} ${indice + 1})`,
          estado: "reprovado",
          severidade: regra.severidade,
          // Política é sempre sobre a PEÇA: o texto está errado, e nenhuma
          // revisão humana o conserta sem reescrevê-lo.
          impede: regra.severidade === "bloqueio" ? "propor" : "nada",
          detalhe: regra.detalhe,
          fonte: citar(regra.fonte),
          trecho: achado[0],
        });
      }
    });
  }

  // ── 3. Aprovado é um item, não a ausência de itens ──────────────────────
  // Sem esta linha, uma peça limpa produziria lista vazia — e lista vazia
  // desenhada como saúde é o que este repositório proíbe.
  const houveTexto = titulos.length + textos.length + descricoes.length > 0;
  if (!itens.some((i) => i.severidade === "bloqueio")) {
    itens.push({
      chave: "politica_conteudo",
      grupo: "politica",
      rotulo: "Política de conteúdo (discriminação, atributo pessoal, promessa)",
      estado: houveTexto ? "aprovado" : "nao_medido",
      severidade: "bloqueio",
      impede: "propor",
      detalhe: houveTexto
        ? `${titulos.length + textos.length + descricoes.length} texto(s) conferidos contra ${REGRAS_DE_TEXTO.length + 9} padrões vetados — nenhum vetado encontrado.`
        : "não há texto para conferir — a política não foi medida",
      fonte: citar(FONTES.discriminacao),
    });
  }
  return itens;
}

// ── Limites de texto ──────────────────────────────────────────────────────

const LIMITE_DO_CAMPO: Record<CampoDeTexto, number> = {
  titulo: LIMITE_TITULO,
  texto: LIMITE_TEXTO,
  descricao: LIMITE_DESCRICAO,
};

export function conferirLimitesDeTexto(peca: PecaParaConferir): ItemDaRegua[] {
  const itens: ItemDaRegua[] = [];

  for (const { campo, itens: lista } of campos(peca)) {
    const limite = LIMITE_DO_CAMPO[campo];
    const estouros = lista.filter((t) => t.length > limite);

    itens.push({
      chave: `limite_${campo}`,
      grupo: "texto",
      rotulo: `${ROTULO_CAMPO[campo]} dentro de ${limite} caracteres`,
      estado: lista.length === 0 ? "nao_medido" : estouros.length ? "reprovado" : "aprovado",
      severidade: "bloqueio",
      impede: "propor",
      detalhe:
        lista.length === 0
          ? `nenhum ${ROTULO_CAMPO[campo]} para medir`
          : estouros.length
            ? `${estouros.length} de ${lista.length} acima do limite — o maior tem ${Math.max(...estouros.map((t) => t.length))} caracteres (limite ${limite}). A Meta trunca em silêncio, e no imobiliário a frase cortada costuma ser a ressalva legal.`
            : `${lista.length} item(ns), o maior com ${Math.max(...lista.map((t) => t.length))} de ${limite}`,
      fonte: citar(FONTES.limitesDoProduto),
      trecho: estouros[0] ?? null,
    });

    if (lista.length > MAX_VARIACOES_POR_CAMPO) {
      itens.push({
        chave: `variacoes_${campo}`,
        grupo: "texto",
        rotulo: `Variações de ${ROTULO_CAMPO[campo]}`,
        estado: "reprovado",
        severidade: "bloqueio",
        impede: "propor",
        detalhe: `${lista.length} variações — o asset_feed_spec aceita no máximo ${MAX_VARIACOES_POR_CAMPO} por campo; as excedentes são recusadas.`,
        fonte: citar(FONTES.limitesDoProduto),
      });
    }
  }

  // ── Corte visual por posicionamento — AVISO, nunca bloqueio ─────────────
  for (const posicionamento of POSICIONAMENTOS) {
    const cortados: string[] = [];
    for (const { campo, itens: lista } of campos(peca)) {
      const visivel = posicionamento.visivel[campo];
      if (visivel == null) continue;
      const excedem = lista.filter((t) => t.length > visivel);
      if (excedem.length) {
        cortados.push(`${excedem.length} ${ROTULO_CAMPO[campo]}(s) acima de ${visivel}`);
      }
    }
    itens.push({
      chave: `corte_${posicionamento.id}`,
      grupo: "texto",
      rotulo: `Corte visual em ${posicionamento.rotulo}`,
      estado: cortados.length ? "reprovado" : "aprovado",
      severidade: "aviso",
      impede: "nada",
      detalhe: cortados.length
        ? `${cortados.join(", ")}. ${posicionamento.nota} Não impede publicar — impede ser lido.`
        : `nada é cortado neste posicionamento`,
      fonte: citar(FONTES.truncamentoVisivel),
    });
  }

  return itens;
}

// ── Público ───────────────────────────────────────────────────────────────

/**
 * A parte que derruba a CONTA, não o anúncio.
 *
 * Duas coisas independentes: a campanha precisa declarar HOUSING, e o targeting
 * precisa obedecer às travas. Declarar sem obedecer e obedecer sem declarar são
 * defeitos diferentes, e cada um tem a sua linha.
 */
export function conferirPublico(peca: PecaParaConferir): ItemDaRegua[] {
  const itens: ItemDaRegua[] = [];
  const fonte = citar(FONTES.categoriaEspecial);

  // ── Categoria especial declarada ────────────────────────────────────────
  const categorias = peca.categoriasEspeciais;
  const declarou = Array.isArray(categorias) && categorias.some((c) => String(c).toUpperCase() === "HOUSING");
  itens.push({
    chave: "categoria_especial",
    grupo: "publico",
    rotulo: "Categoria especial HOUSING declarada",
    estado: categorias == null ? "nao_medido" : declarou ? "aprovado" : "reprovado",
    severidade: "bloqueio",
    impede: "propor",
    detalhe:
      categorias == null
        ? "a campanha ainda não foi montada — não dá para afirmar que HOUSING foi declarado"
        : declarou
          ? 'special_ad_categories inclui "HOUSING"'
          : `special_ad_categories não inclui "HOUSING" (veio ${JSON.stringify(categorias)}). Anunciar imóvel fora da categoria especial é violação de política — o risco é a conta, não o anúncio.`,
    fonte,
  });

  // ── Travas de segmentação ───────────────────────────────────────────────
  const targeting = peca.targeting;
  if (targeting == null) {
    itens.push({
      chave: "travas_housing",
      grupo: "publico",
      rotulo: "Travas de segmentação HOUSING",
      estado: "nao_medido",
      severidade: "bloqueio",
      impede: "propor",
      detalhe: "sem targeting montado não há o que conferir",
      fonte,
    });
    return itens;
  }

  const violacoes: TargetingViolation[] = validateHousingTargeting(targeting);
  if (!violacoes.length) {
    itens.push({
      chave: "travas_housing",
      grupo: "publico",
      rotulo: "Travas de segmentação HOUSING",
      estado: "aprovado",
      severidade: "bloqueio",
      impede: "propor",
      detalhe: `idade ${HOUSING_AGE_MIN}–${HOUSING_AGE_MAX}+, sem gênero, sem CEP, sem lookalike, raio ≥ ${HOUSING_MIN_RADIUS_KM} km`,
      fonte,
    });
    return itens;
  }
  for (const [i, v] of violacoes.entries()) {
    itens.push({
      chave: `trava_housing_${i}`,
      grupo: "publico",
      rotulo: `Trava HOUSING — ${v.rule.replace(/_/g, " ")}`,
      estado: "reprovado",
      severidade: "bloqueio",
      impede: "propor",
      detalhe: `${v.detail} (campo ${v.field})`,
      fonte,
    });
  }
  return itens;
}

// ── Mídia ─────────────────────────────────────────────────────────────────

/** Onde a peça visual é resolvida — a mesma tela que importa a biblioteca. */
export const ONDE_RESOLVER_MIDIA = {
  rotulo: "Compor proposta · Importar da biblioteca da Meta",
  href: "/marketing/campanhas-criativos-proposta",
} as const;

export function conferirMidia(midias: MidiaMedida[]): ItemDaRegua[] {
  const itens: ItemDaRegua[] = [];
  const fonteProp = citar(FONTES.truncamentoVisivel);

  if (!midias.length) {
    itens.push({
      chave: "midia_presenca",
      grupo: "midia",
      rotulo: "Peça visual anexada",
      estado: "reprovado",
      severidade: "bloqueio",
      // Bloqueia ATIVAR, não PROPOR. A peça visual é artefato que aparece
      // depois e por outra mão — subir imagem é escrita na conta do dono, e
      // este produto não escreve na Meta. Era "bloqueio de propor" até
      // 02/08/2026, e com `creative_assets` em 0 linhas isso zerou a emissão de
      // propostas: nenhuma composição conseguia sair da tela.
      impede: "ativar",
      detalhe:
        "anúncio sem imagem nem vídeo não é anúncio — a Meta recusa o criativo. Não impede propor: impede ir ao ar, e quem aprova recebe esta linha.",
      fonte: fonteProp,
      ondeResolver: ONDE_RESOLVER_MIDIA,
    });
    return itens;
  }

  for (const midia of midias) {
    const temGeometria = typeof midia.larguraPx === "number" && typeof midia.alturaPx === "number" && midia.larguraPx > 0 && midia.alturaPx > 0;

    // ── Proporção ─────────────────────────────────────────────────────────
    if (!temGeometria) {
      // O caso normal hoje: a composição guarda `image_hash`, e um hash não tem
      // largura. Dizer "ok" aqui seria afirmar o que ninguém mediu.
      itens.push({
        chave: `midia_proporcao_${midia.referencia}`,
        grupo: "midia",
        rotulo: `Proporção e resolução — ${midia.referencia}`,
        estado: "nao_medido",
        severidade: "aviso",
        impede: "nada",
        detalhe: `a peça é referenciada por hash/ID; largura e altura só existem depois de uma leitura na biblioteca da Meta. Formatos aceitos: ${PROPORCOES_ACEITAS.map((p) => `${p.id} (${p.exemplo})`).join(", ")}.`,
        fonte: fonteProp,
      });
    } else {
      const largura = midia.larguraPx as number;
      const altura = midia.alturaPx as number;
      const proporcao = proporcaoMaisProxima(largura, altura);
      itens.push({
        chave: `midia_proporcao_${midia.referencia}`,
        grupo: "midia",
        rotulo: `Proporção — ${midia.referencia}`,
        estado: proporcao ? "aprovado" : "reprovado",
        severidade: "aviso",
        impede: "nada",
        detalhe: proporcao
          ? `${largura} × ${altura} = ${proporcao.rotulo} — ${proporcao.onde}`
          : `${largura} × ${altura} (${(largura / altura).toFixed(3)}:1) não bate com nenhum formato aceito — a Meta corta a peça para caber, e o corte costuma comer o logo ou o preço. Use ${PROPORCOES_ACEITAS.map((p) => p.id).join(", ")}.`,
        fonte: fonteProp,
      });

      const ladoMenor = Math.min(largura, altura);
      itens.push({
        chave: `midia_resolucao_${midia.referencia}`,
        grupo: "midia",
        rotulo: `Resolução — ${midia.referencia}`,
        estado: ladoMenor >= LADO_MENOR_MINIMO_PX ? "aprovado" : "reprovado",
        severidade: "aviso",
        impede: "nada",
        detalhe:
          ladoMenor >= LADO_MENOR_MINIMO_PX
            ? `lado menor de ${ladoMenor} px (mínimo ${LADO_MENOR_MINIMO_PX})`
            : `lado menor de ${ladoMenor} px, abaixo dos ${LADO_MENOR_MINIMO_PX} px recomendados — a peça sobe borrada no celular`,
        fonte: fonteProp,
      });
    }

    // ── Tamanho de arquivo ────────────────────────────────────────────────
    if (typeof midia.tamanhoMb === "number") {
      const ok = midia.tamanhoMb <= TAMANHO_MAXIMO_IMAGEM_MB;
      itens.push({
        chave: `midia_tamanho_${midia.referencia}`,
        grupo: "midia",
        rotulo: `Tamanho do arquivo — ${midia.referencia}`,
        estado: ok ? "aprovado" : "reprovado",
        // Aqui é bloqueio de verdade: acima do teto o upload é recusado.
        severidade: "bloqueio",
        // De ATIVAR, pela mesma razão da ausência: o que falta é um ARQUIVO
        // trocado, não um texto reescrito. Aprovar a proposta não põe no ar um
        // anúncio proibido — põe um anúncio que não sobe até a peça ser trocada.
        impede: "ativar",
        detalhe: ok
          ? `${midia.tamanhoMb.toFixed(1)} MB (teto ${TAMANHO_MAXIMO_IMAGEM_MB} MB)`
          : `${midia.tamanhoMb.toFixed(1)} MB acima do teto de ${TAMANHO_MAXIMO_IMAGEM_MB} MB — a Meta recusa o envio`,
        fonte: fonteProp,
        ondeResolver: ok ? null : ONDE_RESOLVER_MIDIA,
      });
    }

    // ── Texto na imagem ───────────────────────────────────────────────────
    // AVISO por decisão consciente: a regra dos 20% foi revogada em set/2020.
    // Bloquear aqui seria o produto inventando uma recusa que a Meta não faz.
    if (typeof midia.fracaoDeTexto === "number") {
      const ok = midia.fracaoDeTexto <= TEXTO_NA_IMAGEM_RECOMENDADO;
      itens.push({
        chave: `midia_texto_${midia.referencia}`,
        grupo: "midia",
        rotulo: `Texto na imagem — ${midia.referencia}`,
        estado: ok ? "aprovado" : "reprovado",
        severidade: "aviso",
        impede: "nada",
        detalhe: ok
          ? `${Math.round(midia.fracaoDeTexto * 100)}% da área com texto (recomendado ≤ ${Math.round(TEXTO_NA_IMAGEM_RECOMENDADO * 100)}%)`
          : `${Math.round(midia.fracaoDeTexto * 100)}% da área com texto. A regra dos 20% foi REVOGADA pela Meta em set/2020 — não há recusa, mas a entrega piora. Isto é desempenho, não conformidade.`,
        fonte: citar(FONTES.textoNaImagem),
      });
    }
  }

  return itens;
}

// ── Artefatos de destino ──────────────────────────────────────────────────

/**
 * Página e formulário — os outros dois artefatos que só impedem ATIVAR.
 *
 * Por que isto NÃO entra em `conferirPecaNaMeta`: na tela de composição a
 * Página e o formulário já são medidos por `prontidaoDaPublicacao`
 * (lib/marketing/campanhas-criativos-composicao.ts), com o mesmo "onde
 * resolver". Somar aqui produziria duas linhas dizendo a mesma coisa na mesma
 * tela, livres para divergir na próxima edição — a classe de defeito que este
 * repositório já pagou caro.
 *
 * Quem chama é o outro lado da cadeia: a Caixa de Aprovações, onde não existe
 * painel de prontidão da composição e o aprovador precisa ver, no plano que vai
 * assinar, o que ainda falta.
 */
export function conferirArtefatosDeDestino(destino: {
  /** `undefined` = não medido (não havia onde ler). `null`/"" = ausente de verdade. */
  paginaId?: string | null;
  formularioId?: string | null;
}): ItemDaRegua[] {
  const onde = { rotulo: "Integrações · Meta", href: "/integrations/meta" };
  // A mesma convenção que `categoriasEspeciais` já usa nesta régua: `undefined`
  // é "não havia onde ler", e não medido nunca vira falta nem aprovação.
  const medir = (valor: string | null | undefined) =>
    valor === undefined ? null : String(valor ?? "").trim();
  const pagina = medir(destino.paginaId);
  const formulario = medir(destino.formularioId);
  return [
    {
      chave: "artefato_pagina",
      grupo: "midia",
      rotulo: "Página que assina o anúncio",
      estado: pagina === null ? "nao_medido" : pagina ? "aprovado" : "reprovado",
      severidade: "bloqueio",
      impede: "ativar",
      detalhe:
        pagina === null
          ? "não há criativo no plano para ler a Página — isto não é ausência de Página"
          : pagina
            ? `Página ${pagina}`
            : "sem Página o anúncio não tem quem o assine — a Meta recusa o criativo antes de qualquer revisão de conteúdo",
      fonte: citar(FONTES.categoriaEspecial),
      ondeResolver: pagina ? null : onde,
    },
    {
      chave: "artefato_formulario",
      grupo: "midia",
      rotulo: "Formulário instantâneo de leads",
      estado: formulario === null ? "nao_medido" : formulario ? "aprovado" : "reprovado",
      severidade: "bloqueio",
      impede: "ativar",
      detalhe:
        formulario === null
          ? "não há criativo no plano para ler o formulário — isto não é ausência de formulário"
          : formulario
            ? `Formulário ${formulario}`
            : "sem formulário o anúncio de leads não tem onde a pessoa deixar o contato",
      fonte: citar(FONTES.categoriaEspecial),
      ondeResolver: formulario ? null : onde,
    },
  ];
}
