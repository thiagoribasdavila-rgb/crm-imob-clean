/**
 * A BIBLIOTECA DE MÍDIA DA CONTA — leitura, e só leitura.
 *
 * ── O buraco que isto fecha (medido em 02/08/2026) ──────────────────────────
 *
 * `act_2169318190556460/adimages` respondia 25 imagens ACTIVE, `advideos`
 * respondia 0 vídeos, e `creative_assets` tinha 0 linhas. A peça EXISTIA na
 * conta e o CRM não tinha como citá-la: para publicar, alguém copiava o hash à
 * mão do Gerenciador de Anúncios para um campo de texto da composição. Um
 * dígito trocado num hash de 32 caracteres não é recusado por ninguém até a
 * hora de subir o anúncio — que é tarde.
 *
 * ── A fronteira, dita uma vez e valendo para o arquivo inteiro ──────────────
 *
 * GET, sempre. Este módulo não sobe mídia, não cria, não edita e não apaga nada
 * na conta do dono. Subir mídia é ESCRITA, e é por isso que `media-upload.ts`
 * nasceu com `dryRun` default TRUE — daqui só se OLHA. A única coisa que este
 * arquivo escreve é o retorno da função.
 *
 * ── Por que cada lado carrega o erro dele ───────────────────────────────────
 *
 * Imagem e vídeo são duas edges independentes e falham independentemente. Uma
 * leitura que somasse as duas listas devolveria "3 peças" no dia em que
 * `advideos` desse rate limit e `adimages` respondesse 3 de 25 — um número
 * menor que a verdade, com toda a aparência de contagem. Por isso o retorno é
 * `{ imagens, videos }` com `pecas: null` + `erro` em cada lado, e quem soma é
 * `totalDePecas`, que devolve `null` se QUALQUER lado não foi lido.
 *
 * É a mesma regra que a rota de prontidão já executa, escrita aqui uma vez para
 * as duas não divergirem: **falha de leitura não é zero.**
 */

/* Extensão explícita no import de VALOR: é o que permite ao contrato carregar
   este módulo direto do .ts (o Node apaga os tipos, mas não adivinha extensão).
   Mesmo motivo pelo qual `campanhas-criativos-composicao.ts` importa a régua
   assim. */
import { graphGetAll, type GraphReadError } from "./graph-client.ts";

const GRAPH = "https://graph.facebook.com";

/**
 * Os campos pedidos a cada edge. São CONFERIDOS contra a Graph antes de entrar
 * aqui: um campo inexistente não devolve `null` naquele campo — devolve erro
 * 100 e derruba a leitura inteira.
 */
export const CAMPOS_DE_IMAGEM = "hash,name,url,permalink_url,url_128,width,height,status,created_time";
export const CAMPOS_DE_VIDEO = "id,title,created_time,status,picture,permalink_url";

/** Quantas peças cabem numa página, e quantas páginas se segue. 100 × 10. */
const POR_PAGINA = 100;
const MAX_PAGINAS = 10;
export const TETO_DE_LEITURA = POR_PAGINA * MAX_PAGINAS;

export type TipoDePeca = "imagem" | "video";

export type PecaDaBiblioteca = {
  tipo: TipoDePeca;
  /**
   * O hash da imagem ou o id do vídeo. É ISTO que o criativo cita — o resto
   * desta ficha é para o humano reconhecer a peça na lista.
   */
  referencia: string;
  nome: string;
  /**
   * `ACTIVE`/`DELETED` na imagem, `ready`/`processing`/`error` no vídeo.
   * `null` = a Meta não disse, e não dizer não é o mesmo que dizer que está
   * ruim (ver `pecaCitavel`).
   */
  situacao: string | null;
  /** Endereço estável da peça (permalink). `null` quando a Meta não devolveu. */
  endereco: string | null;
  /**
   * Miniatura vinda do CDN. EXPIRA — o link carrega assinatura com prazo. Serve
   * para olhar hoje, nunca como endereço permanente da peça.
   */
  miniaturaTemporaria: string | null;
  largura: number | null;
  altura: number | null;
  criadaEm: string | null;
};

/** Um lado da biblioteca. `pecas: null` é "não li", nunca "não há". */
export type LadoDaBiblioteca = { pecas: PecaDaBiblioteca[] | null; erro: string | null };

export type BibliotecaLida = { contaId: string; imagens: LadoDaBiblioteca; videos: LadoDaBiblioteca };

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const numero = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function accPath(contaId: string): string {
  return `act_${String(contaId).replace(/^act_/, "")}`;
}
function versao(v?: string): string {
  return v || process.env.META_GRAPH_API_VERSION || "v23.0";
}

/**
 * Uma linha de `/adimages` vira peça. Sem `hash` devolve `null`: uma peça que
 * não pode ser citada não é uma peça — é uma linha que encheria a lista do
 * usuário com algo que não dá para escolher.
 */
export function normalizarImagem(linha: Record<string, unknown>): PecaDaBiblioteca | null {
  const hash = texto(linha.hash);
  if (!hash) return null;
  return {
    tipo: "imagem",
    referencia: hash,
    nome: texto(linha.name) || `imagem ${hash.slice(0, 8)}`,
    situacao: texto(linha.status) || null,
    // permalink primeiro: `url` é CDN assinado e expira. Guardar o efêmero como
    // endereço da peça produziria um link morto semanas depois, sem aviso.
    endereco: texto(linha.permalink_url) || null,
    miniaturaTemporaria: texto(linha.url_128) || texto(linha.url) || null,
    largura: numero(linha.width),
    altura: numero(linha.height),
    criadaEm: texto(linha.created_time) || null,
  };
}

/**
 * O `status` do vídeo NÃO é string: `/advideos` devolve `{video_status:"ready"}`.
 * Ler como string devolveria `"[object Object]"` — ou, pior, vazio — e o vídeo
 * ainda em codificação passaria por pronto.
 */
export function situacaoDoVideo(status: unknown): string | null {
  if (typeof status === "string") return status.trim() || null;
  if (typeof status === "object" && status !== null) {
    const bruto = (status as { video_status?: unknown }).video_status;
    if (typeof bruto === "string" && bruto.trim()) return bruto.trim();
  }
  return null;
}

/** Uma linha de `/advideos` vira peça. Sem `id` devolve `null`, pela mesma razão. */
export function normalizarVideo(linha: Record<string, unknown>): PecaDaBiblioteca | null {
  const id = texto(linha.id);
  if (!id) return null;
  return {
    tipo: "video",
    referencia: id,
    nome: texto(linha.title) || `vídeo ${id}`,
    situacao: situacaoDoVideo(linha.status),
    endereco: texto(linha.permalink_url) || null,
    miniaturaTemporaria: texto(linha.picture) || null,
    largura: null,
    altura: null,
    criadaEm: texto(linha.created_time) || null,
  };
}

/**
 * A peça pode ser citada num criativo AGORA?
 *
 * Três respostas, não duas, e a terceira é a que evita jogar peça boa fora:
 * situação `null` significa que a Meta não informou o estado — e não informar
 * não é motivo para descartar. Descartar por silêncio seria a mesma inversão
 * que este repositório já pagou noutro lugar: ausência de leitura tratada como
 * leitura negativa.
 *
 * Vídeo em `processing` é o caso caro: o id JÁ existe, então um importador
 * ingênuo o registraria, e o criativo montado com ele nasce quebrado. Ele volta
 * na próxima importação, pronto.
 */
export function pecaCitavel(peca: PecaDaBiblioteca): { citavel: boolean; motivo: string | null } {
  if (peca.situacao === null) return { citavel: true, motivo: null };
  const situacao = peca.situacao.toUpperCase();
  if (peca.tipo === "imagem") {
    if (situacao === "ACTIVE") return { citavel: true, motivo: null };
    return {
      citavel: false,
      motivo: `a Meta marca esta imagem como "${peca.situacao}" — ela não pode entrar num criativo novo`,
    };
  }
  if (situacao === "READY") return { citavel: true, motivo: null };
  if (situacao === "PROCESSING") {
    return {
      citavel: false,
      motivo: "o vídeo ainda está sendo processado pela Meta — o id existe, mas o criativo montado com ele nasce quebrado. Importe de novo quando terminar",
    };
  }
  return { citavel: false, motivo: `a Meta reporta o vídeo como "${peca.situacao}"` };
}

/** Mensagem legível de um erro da Graph, já sem token (o cliente sanitiza). */
function mensagemDoErro(erro: GraphReadError, oQue: string): string {
  return `não foi possível listar ${oQue}: ${erro.message} (código ${erro.code}${erro.subcode ? `/${erro.subcode}` : ""}, família ${erro.kind})`;
}

/** Rede injetável — é o que permite ao contrato PROVAR que só se faz GET aqui. */
type OpcoesDeLeitura = {
  graphVersion?: string;
  fetcher?: typeof fetch;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
};

async function lerLado(
  url: string,
  token: string,
  normalizar: (linha: Record<string, unknown>) => PecaDaBiblioteca | null,
  oQue: string,
  opts: OpcoesDeLeitura = {},
): Promise<LadoDaBiblioteca> {
  const linhas = await graphGetAll<Record<string, unknown>>(url, token, {
    maxPages: MAX_PAGINAS,
    fetcher: opts.fetcher,
    retries: opts.retries,
    sleep: opts.sleep,
  });
  if (!Array.isArray(linhas)) return { pecas: null, erro: mensagemDoErro(linhas, oQue) };

  // Dedupe por referência: a mesma imagem pode reaparecer entre páginas quando
  // a biblioteca muda durante a varredura. Duas linhas do mesmo hash viram dois
  // ativos no CRM, e a lista da tela oferece a mesma peça duas vezes.
  const vistas = new Set<string>();
  const pecas: PecaDaBiblioteca[] = [];
  for (const linha of linhas) {
    const peca = normalizar(linha);
    if (!peca || vistas.has(peca.referencia)) continue;
    vistas.add(peca.referencia);
    pecas.push(peca);
  }
  return { pecas, erro: null };
}

/**
 * Lê a biblioteca inteira da conta — imagens e vídeos — em GETs paginados.
 *
 * Os dois lados são lidos em paralelo e falham em separado, de propósito: no
 * dia em que `advideos` recusar o campo `permalink_url` (a Graph derruba a
 * chamada inteira por um campo inexistente), as 25 imagens continuam chegando e
 * a tela diz exatamente qual metade não foi lida.
 */
export async function lerBibliotecaDaConta(
  contaId: string,
  token: string,
  opts: OpcoesDeLeitura = {},
): Promise<BibliotecaLida> {
  const base = `${GRAPH}/${versao(opts.graphVersion)}/${accPath(contaId)}`;
  const [imagens, videos] = await Promise.all([
    lerLado(
      `${base}/adimages?fields=${CAMPOS_DE_IMAGEM}&limit=${POR_PAGINA}`,
      token,
      normalizarImagem,
      "as imagens da biblioteca",
      opts,
    ),
    lerLado(
      `${base}/advideos?fields=${CAMPOS_DE_VIDEO}&limit=${POR_PAGINA}`,
      token,
      normalizarVideo,
      "os vídeos da biblioteca",
      opts,
    ),
  ]);
  return { contaId: accPath(contaId), imagens, videos };
}

/**
 * As peças dos dois lados numa lista só — e `null` se QUALQUER lado falhou.
 *
 * Concatenar o que respondeu produziria uma lista curta com cara de completa, e
 * o usuário procuraria na tela uma peça que a Meta tem e a leitura perdeu.
 */
export function pecasDaBiblioteca(biblioteca: BibliotecaLida): PecaDaBiblioteca[] | null {
  const { imagens, videos } = biblioteca;
  if (imagens.pecas === null || videos.pecas === null) return null;
  return [...imagens.pecas, ...videos.pecas];
}

/** Quantas peças a conta tem. `null` = não sei, e não saber não é zero. */
export function totalDePecas(biblioteca: BibliotecaLida): number | null {
  return pecasDaBiblioteca(biblioteca)?.length ?? null;
}

/** Os erros de leitura, prontos para a tela. Vazio = os dois lados responderam. */
export function errosDaLeitura(biblioteca: BibliotecaLida): string[] {
  return [biblioteca.imagens.erro, biblioteca.videos.erro].filter((e): e is string => Boolean(e));
}
