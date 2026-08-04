/**
 * DA BIBLIOTECA DA META PARA `creative_assets` — o núcleo puro da importação.
 *
 * ── O que esta importação resolve ───────────────────────────────────────────
 *
 * Medido em 02/08/2026: 25 imagens ACTIVE na conta `act_2169318190556460`, 0
 * vídeos, e `creative_assets` com 0 linhas. A peça existia e o CRM não tinha
 * como citá-la — a composição da proposta exigia que alguém digitasse o hash,
 * copiado à mão do Gerenciador de Anúncios. Depois desta importação, a lista
 * substitui a digitação.
 *
 * ── Este arquivo é PURO ─────────────────────────────────────────────────────
 *
 * Sem rede, sem banco, sem relógio (`agoraIso` entra por parâmetro), sem
 * `process.env`, sem `@/`. Quem lê a Meta é `lerBibliotecaDaConta`; quem grava
 * é a rota. Aqui só se DECIDE o que virá linha, o que fica de fora e por quê —
 * e é isso que permite ao contrato EXECUTAR a decisão em vez de procurar
 * strings no fonte. Este repositório já viu asserção por grep sobreviver a
 * código morto.
 *
 * ── As três armadilhas que este módulo carrega escritas ─────────────────────
 *
 * 1. `campaign_id` NASCE NULO, e não é descuido. `creative_assets.campaign_id`
 *    referencia `campaigns(id)` — tabela com 0 linhas — e NÃO
 *    `marketing_campaigns(id)`. Gravar o id da segunda ali devolve SQLSTATE
 *    23503 e derruba a gravação inteira. Foi por isso que `creative_assets`
 *    ficou vazia enquanto `marketing_campaigns` tinha 8 linhas.
 *
 * 2. A CHAVE DE IDENTIDADE É `conta + referência`, nunca a referência sozinha.
 *    O hash de uma imagem é derivado dos BYTES: a mesma arte subida em duas
 *    contas tem o mesmo hash. Mas um `image_hash` só vale dentro da conta que o
 *    hospeda — citar o hash da conta A num criativo da conta B é recusado pela
 *    Meta. Deduplicar só pelo hash faria a segunda conta parecer já importada e
 *    a peça sumiria da lista dela.
 *
 * 3. PEÇA SEM `asset_url` ENTRA MESMO ASSIM, e é contada à parte. É `asset_url`
 *    que o item `midia_referenciavel_pelo_crm` conta na prontidão para
 *    publicar. Seria fácil "resolver" o item forçando qualquer texto naquele
 *    campo — e aí o medidor mediria a si mesmo. O que vale é o hash; peça sem
 *    endereço permanente é importada (dá para citar), fica visível na lista e é
 *    reportada em `semEndereco`, para ninguém se espantar quando a prontidão
 *    contar menos do que a importação trouxe.
 */

/* A MESMA validação de URL do caminho de upload — reaproveitada, não reescrita.
   Duas noções de "URL aceitável" divergiriam, e a que divergisse seria a que
   grava. Só a validação PURA entra: as funções de upload são escrita na conta
   do dono e não têm o que fazer numa importação. */
import { isHttpsUrl } from "../meta/marketing/media-upload.ts";
import { pecaCitavel, type PecaDaBiblioteca, type TipoDePeca } from "../meta/marketing/biblioteca-de-midia.ts";

/** Marca de origem gravada em `metadata.origem`. Distingue peça importada de peça escrita por IA. */
export const ORIGEM_BIBLIOTECA = "biblioteca_meta";

/** `format` de `creative_assets` por tipo de peça — o mesmo vocabulário de `salvarCriativos`. */
const FORMATO: Record<TipoDePeca, string> = { imagem: "single_image", video: "single_video" };

export type LinhaDeAtivo = {
  organization_id: string;
  /** Sempre `null`. Ver armadilha 1 no topo do arquivo. */
  campaign_id: null;
  name: string;
  format: string;
  channel: "meta";
  asset_url: string | null;
  status: "draft";
  created_by: string;
  metadata: {
    origem: typeof ORIGEM_BIBLIOTECA;
    importadoEm: string;
    meta: {
      tipo: TipoDePeca;
      referencia: string;
      contaId: string;
      situacao: string | null;
      largura: number | null;
      altura: number | null;
      criadaEm: string | null;
      /** Link de CDN com prazo. Está aqui para olhar, nunca como endereço da peça. */
      miniaturaTemporaria: string | null;
    };
  };
};

/**
 * A identidade de uma peça dentro do CRM: conta + referência.
 *
 * Uma função só, usada pelo importador E por quem lê a lista. Duas montagens da
 * mesma chave divergem na primeira edição, e a divergência aparece como
 * "importei e a peça não apareceu" — sem erro em lugar nenhum.
 */
export function chaveDaPeca(contaId: string, referencia: string): string {
  // O `act_` é normalizado: a mesma conta escrita com e sem prefixo tem de
  // produzir UMA chave. Sem isto, `2169318190556460` e `act_2169318190556460`
  // seriam duas contas diferentes e a importação duplicaria a biblioteca
  // inteira na primeira vez que alguém digitasse o id sem o prefixo.
  return `act_${String(contaId).trim().replace(/^act_/, "")}:${referencia}`;
}

/** A chave de um ativo já gravado. `null` quando a linha não veio da biblioteca. */
export function chaveDoAtivo(linha: { metadata?: unknown }): string | null {
  const metadata = linha.metadata;
  if (typeof metadata !== "object" || metadata === null) return null;
  const meta = (metadata as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return null;
  const registro = meta as { referencia?: unknown; contaId?: unknown };
  const referencia = typeof registro.referencia === "string" ? registro.referencia.trim() : "";
  const contaId = typeof registro.contaId === "string" ? registro.contaId.trim() : "";
  if (!referencia || !contaId) return null;
  return chaveDaPeca(contaId, referencia);
}

/**
 * A peça vira linha de `creative_assets`.
 *
 * `asset_url` só recebe endereço https de verdade — `isHttpsUrl` é a MESMA
 * validação que o caminho de upload usa antes de tocar a Meta. Reaproveitá-la
 * aqui é o que impede um `permalink_url` estranho (http, vazio, `data:`) de
 * virar o endereço que a prontidão conta e que a tela vira link.
 */
export function linhaDoAtivo(
  peca: PecaDaBiblioteca,
  ctx: { organizationId: string; contaId: string; createdBy: string; agoraIso: string },
): LinhaDeAtivo {
  const endereco = peca.endereco && isHttpsUrl(peca.endereco) ? peca.endereco : null;
  return {
    organization_id: ctx.organizationId,
    campaign_id: null,
    name: peca.nome.slice(0, 255),
    format: FORMATO[peca.tipo],
    channel: "meta",
    asset_url: endereco,
    status: "draft",
    created_by: ctx.createdBy,
    metadata: {
      origem: ORIGEM_BIBLIOTECA,
      importadoEm: ctx.agoraIso,
      meta: {
        tipo: peca.tipo,
        referencia: peca.referencia,
        contaId: ctx.contaId,
        situacao: peca.situacao,
        largura: peca.largura,
        altura: peca.altura,
        criadaEm: peca.criadaEm,
        miniaturaTemporaria: peca.miniaturaTemporaria,
      },
    },
  };
}

export type PecaDescartada = { referencia: string; tipo: TipoDePeca; nome: string; motivo: string };

export type PlanoDeImportacao = {
  /** O que será inserido. Vazio não significa erro: pode ser que já esteja tudo lá. */
  linhas: LinhaDeAtivo[];
  /** Referências que o CRM já tinha para ESTA conta — a importação é idempotente. */
  jaRegistradas: string[];
  /** Peças que a Meta tem e que não podem ser citadas hoje, com o motivo de cada uma. */
  descartadas: PecaDescartada[];
  /** Importadas SEM endereço permanente — citáveis, mas fora da conta da prontidão. */
  semEndereco: string[];
};

/**
 * Decide o que importar.
 *
 * `jaNoCrm` é o conjunto de chaves (`chaveDoAtivo`) que já existem. Peça
 * repetida não vira linha nova: rodar a importação dez vezes tem de deixar o
 * banco igual à primeira — e é isso que permite oferecer o botão sem medo.
 *
 * Nada aqui APAGA: uma peça que sumiu da biblioteca continua registrada no CRM.
 * Ela pode estar citada numa proposta pendente, e apagar a linha faria a
 * proposta perder o nome da própria peça. Quem some da lista some por ser
 * `DELETED` na Meta — e isso a lista mostra, em vez de esconder.
 */
export function planejarImportacao(
  pecas: readonly PecaDaBiblioteca[],
  jaNoCrm: Iterable<string>,
  ctx: { organizationId: string; contaId: string; createdBy: string; agoraIso: string },
): PlanoDeImportacao {
  const existentes = new Set(jaNoCrm);
  const linhas: LinhaDeAtivo[] = [];
  const jaRegistradas: string[] = [];
  const descartadas: PecaDescartada[] = [];
  const semEndereco: string[] = [];
  // Guarda contra a mesma referência aparecer duas vezes na MESMA leitura: o
  // insert iria em lote e criaria dois ativos idênticos de uma só vez, que
  // nenhuma execução seguinte desfaria.
  const nesteLote = new Set<string>();

  for (const peca of pecas) {
    const chave = chaveDaPeca(ctx.contaId, peca.referencia);
    if (existentes.has(chave)) {
      jaRegistradas.push(peca.referencia);
      continue;
    }
    if (nesteLote.has(chave)) continue;

    const { citavel, motivo } = pecaCitavel(peca);
    if (!citavel) {
      descartadas.push({ referencia: peca.referencia, tipo: peca.tipo, nome: peca.nome, motivo: motivo ?? "peça não citável" });
      continue;
    }

    const linha = linhaDoAtivo(peca, ctx);
    if (linha.asset_url === null) semEndereco.push(peca.referencia);
    nesteLote.add(chave);
    linhas.push(linha);
  }

  return { linhas, jaRegistradas, descartadas, semEndereco };
}

export type ResumoDaImportacao = {
  /** Quantas peças a conta tem. `null` quando algum lado da leitura falhou. */
  naBiblioteca: number | null;
  aImportar: number;
  jaRegistradas: number;
  descartadas: number;
  semEndereco: number;
  /** Erros de leitura, um por lado que não respondeu. Vazio = leitura completa. */
  erros: string[];
  /**
   * `true` só quando os DOIS lados foram lidos e nada ficou para importar. Um
   * lado no escuro nunca vira "está tudo importado" — a peça que falta pode
   * estar justamente na metade que não respondeu.
   */
  bibliotecaInteiraNoCrm: boolean;
  frase: string;
};

/**
 * A frase que a tela mostra — e que nunca afirma mais do que foi medido.
 *
 * O caso que ela existe para não estragar: `adimages` responde e `advideos`
 * falha. Um resumo ingênuo diria "25 peças na biblioteca, 25 importadas, tudo
 * pronto". Aqui `naBiblioteca` fica `null`, `bibliotecaInteiraNoCrm` fica
 * `false` e a frase diz qual metade não foi lida.
 */
export function resumirImportacao(
  plano: PlanoDeImportacao,
  medidas: { naBiblioteca: number | null; erros: string[] },
): ResumoDaImportacao {
  const leituraCompleta = medidas.erros.length === 0 && medidas.naBiblioteca !== null;
  const bibliotecaInteiraNoCrm = leituraCompleta && plano.linhas.length === 0 && plano.descartadas.length === 0;

  const partes: string[] = [];
  if (plano.linhas.length) partes.push(`${plano.linhas.length} peça(s) nova(s)`);
  if (plano.jaRegistradas.length) partes.push(`${plano.jaRegistradas.length} já registrada(s)`);
  if (plano.descartadas.length) partes.push(`${plano.descartadas.length} fora de uso na Meta`);
  if (plano.semEndereco.length) {
    partes.push(`${plano.semEndereco.length} sem endereço permanente (a prontidão não as conta)`);
  }

  const cabeca = medidas.naBiblioteca === null
    ? "Não foi possível ler a biblioteca inteira"
    : `Biblioteca lida: ${medidas.naBiblioteca} peça(s)`;

  const corpo = partes.length ? ` — ${partes.join(", ")}.` : leituraCompleta ? " — nada a importar." : ".";
  const rabo = medidas.erros.length ? ` ${medidas.erros.join(" · ")}. Isto não é zero.` : "";

  return {
    naBiblioteca: medidas.naBiblioteca,
    aImportar: plano.linhas.length,
    jaRegistradas: plano.jaRegistradas.length,
    descartadas: plano.descartadas.length,
    semEndereco: plano.semEndereco.length,
    erros: medidas.erros,
    bibliotecaInteiraNoCrm,
    frase: `${cabeca}${corpo}${rabo}`,
  };
}

/**
 * A peça como a tela de composição a oferece — e como a proposta a cita.
 *
 * `referencia` é o que vai para `imageHashes`/`videoIds`. `contaId` viaja junto
 * porque a lista TEM de ser filtrada pela conta escolhida: oferecer o hash de
 * outra conta é oferecer um criativo que a Meta recusa (ver armadilha 2).
 */
export type PecaOferecida = {
  id: string;
  tipo: TipoDePeca;
  referencia: string;
  contaId: string;
  nome: string;
  endereco: string | null;
  situacao: string | null;
  dimensoes: string | null;
  importadoEm: string | null;
};

/**
 * Converte a linha gravada em peça oferecível. `null` quando a linha não veio
 * da biblioteca (as peças de texto do Creative Studio moram na mesma tabela e
 * não têm referência nenhuma para citar).
 */
export function pecaOferecida(linha: {
  id?: unknown;
  name?: unknown;
  asset_url?: unknown;
  metadata?: unknown;
}): PecaOferecida | null {
  if (chaveDoAtivo(linha) === null) return null;
  const meta = (linha.metadata as { meta: Record<string, unknown>; importadoEm?: unknown }).meta;
  const id = typeof linha.id === "string" ? linha.id : "";
  if (!id) return null;
  const tipo: TipoDePeca = meta.tipo === "video" ? "video" : "imagem";
  const largura = typeof meta.largura === "number" ? meta.largura : null;
  const altura = typeof meta.altura === "number" ? meta.altura : null;
  const importadoEm = (linha.metadata as { importadoEm?: unknown }).importadoEm;
  return {
    id,
    tipo,
    referencia: String(meta.referencia),
    contaId: String(meta.contaId),
    nome: typeof linha.name === "string" && linha.name.trim() ? linha.name : String(meta.referencia),
    endereco: typeof linha.asset_url === "string" && linha.asset_url ? linha.asset_url : null,
    situacao: typeof meta.situacao === "string" ? meta.situacao : null,
    dimensoes: largura && altura ? `${largura}×${altura}` : null,
    importadoEm: typeof importadoEm === "string" ? importadoEm : null,
  };
}
