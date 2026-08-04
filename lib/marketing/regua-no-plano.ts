/**
 * A RÉGUA APLICADA AO PLANO — ler a publicação que vai ser enviada e medi-la.
 *
 * ── Por que este módulo existe ─────────────────────────────────────────────
 *
 * `conferirPecaNaMeta` (regua-da-meta.ts) mede uma PEÇA: títulos, textos,
 * descrições, público, categoria especial, mídia. Mas o que atravessa a cadeia
 * governada não é uma peça — é um PLANO (`ExecutionStep[]`): a sequência
 * campanha → conjunto → criativo → anúncios que `executeSteps` manda à Meta.
 *
 * Enquanto a régua só sabia ler peça, cada composição tinha de desmontar o
 * próprio plano para conferi-lo. Foi assim que a rota da tela ganhou a régua e
 * `ready-campaigns` — a irmã, a que produz de verdade as propostas Arvo/Spin do
 * painel da Sala de Comando — ficou sem: nenhuma das cinco funções da régua
 * aparecia lá dentro. Um portão que depende de cada porta se lembrar de chamá-lo
 * é um portão que fecha até a próxima porta.
 *
 * Este módulo é o TRADUTOR, não uma segunda régua: ele extrai do plano a peça e
 * chama `conferirPecaNaMeta`. Não conhece um único padrão proibido, um único
 * limite de caractere, uma única trava de público. Se a régua mudar, isto anda
 * junto sem edição — é o teste de que não há régua duplicada aqui.
 *
 * ── O que ele acrescenta e a régua não podia ver ───────────────────────────
 *
 * Um item ESTRUTURAL. A régua trata ausência como "não medido", e não medido
 * não bloqueia — o que está certo para uma peça em composição (a mídia ainda
 * não subiu) e é uma porta escancarada para um plano: `steps: [{ kind:
 * "create_ad" }]` não tem campanha nem conjunto, logo não tem categoria especial
 * nem público, logo passa em tudo por ausência. Ausência de plano não é plano
 * limpo. Por isso `conferirPlanoNaMeta` exige campanha e conjunto declarados
 * antes de dizer qualquer outra coisa.
 *
 * ── Purezas ────────────────────────────────────────────────────────────────
 *
 * PURO: sem rede, sem banco, sem relógio, sem `process.env`. O tipo do passo
 * entra por `import type` (apagado no strip de tipos), então os checks
 * adversariais carregam este arquivo sem arrastar o executor efetful junto.
 */

import type { ExecutionStep } from "../meta/marketing/campaign-executor.ts";
import {
  conferirPecaNaMeta,
  citar,
  FONTES,
  fecharVeredito,
  type ItemDaRegua,
  type MidiaMedida,
  type PecaParaConferir,
  type VereditoDaRegua,
} from "./regua-da-meta.ts";

type Registro = Record<string, unknown>;

function comoRegistro(valor: unknown): Registro | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? (valor as Registro) : null;
}

/** Os `text` de uma lista do asset_feed_spec (`titles`, `bodies`, `descriptions`). */
function textosDe(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((item) => {
      const rec = comoRegistro(item);
      return typeof rec?.text === "string" ? rec.text : "";
    })
    .filter((t) => t.trim().length > 0);
}

function passo(steps: ExecutionStep[], kind: ExecutionStep["kind"]): Registro | null {
  const achado = steps.find((s) => s?.kind === kind);
  return achado ? comoRegistro(achado.payload) : null;
}

/**
 * A peça que o plano vai publicar — lida do PLANO, nunca remontada.
 *
 * Remontar a peça a partir dos mesmos insumos produziria um parente do que vai
 * ser enviado, e é exatamente entre o parente e o original que este repositório
 * já perdeu dinheiro. Aqui tudo sai dos `payload` que seguem para a Graph:
 * `special_ad_categories` da campanha, `targeting` do conjunto, textos e mídia
 * do `asset_feed_spec` do criativo.
 */
export function pecaDoPlano(steps: ExecutionStep[]): PecaParaConferir {
  const lista = Array.isArray(steps) ? steps : [];
  const campanha = passo(lista, "create_campaign");
  const conjunto = passo(lista, "create_adset");
  const criativo = passo(lista, "create_creative");
  const feed = comoRegistro(criativo?.asset_feed_spec) ?? {};

  const categorias = campanha ? campanha.special_ad_categories : undefined;
  const targeting = conjunto ? comoRegistro(conjunto.targeting) : null;

  const imagens = Array.isArray(feed.images) ? feed.images : [];
  const videos = Array.isArray(feed.videos) ? feed.videos : [];

  /**
   * ── A MÍDIA MORA EM DOIS LUGARES, E LER SÓ UM É DIZER "SEM MÍDIA" ──────────
   *
   * Esta função lia mídia SÓ do `asset_feed_spec`. Mas o link ad clássico — o
   * formato mais comum — carrega a peça em
   * `object_story_spec.link_data.image_hash`, sem `asset_feed_spec` nenhum.
   *
   * O efeito medido: `validateExecutionPlan` (o lado do executor) ACEITAVA esse
   * criativo, e `pendenciasDeAtivacao` (o lado da régua) dizia "sem peça visual"
   * sobre o MESMO plano. Dois leitores do mesmo fato discordando — e o que
   * perdia era o que decide se a proposta pode ir ao ar.
   *
   * Um plano com mídia sendo reportado como sem mídia é pior que o inverso:
   * manda o dono produzir uma imagem que já está anexada.
   *
   * As duas leituras agora olham os dois lugares, e a deduplicação por hash
   * impede que a mesma peça declarada nos dois seja contada duas vezes.
   */
  const story = comoRegistro(criativo?.object_story_spec) ?? {};
  const linkData = comoRegistro(story.link_data) ?? {};
  const videoData = comoRegistro(story.video_data) ?? {};
  const hashDoStory = String(linkData.image_hash ?? "").trim();
  const videoDoStory = String(videoData.video_id ?? "").trim();

  const vistos = new Set<string>();
  const midias: MidiaMedida[] = [];
  const somar = (chave: string, referencia: string) => {
    if (chave && vistos.has(chave)) return;
    if (chave) vistos.add(chave);
    midias.push({ referencia });
  };

  imagens.forEach((img, i) => {
    const hash = String(comoRegistro(img)?.hash ?? "").trim();
    somar(hash, hash ? `imagem ${hash.slice(0, 12)}` : `imagem ${i + 1}`);
  });
  videos.forEach((vid, i) => {
    const id = String(comoRegistro(vid)?.video_id ?? "").trim();
    somar(id, id ? `vídeo ${id}` : `vídeo ${i + 1}`);
  });
  if (hashDoStory) somar(hashDoStory, `imagem ${hashDoStory.slice(0, 12)}`);
  if (videoDoStory) somar(videoDoStory, `vídeo ${videoDoStory}`);

  return {
    titulos: textosDe(feed.titles),
    textos: textosDe(feed.bodies),
    descricoes: textosDe(feed.descriptions),
    // `undefined` e `null` dizem coisas diferentes para a régua: sem campanha no
    // plano a categoria não foi MEDIDA; com campanha e sem o campo ela está
    // ausente de verdade, e ausente é reprovação.
    categoriasEspeciais: campanha ? (Array.isArray(categorias) ? categorias.map((c) => String(c)) : []) : null,
    targeting,
    midias,
  };
}

/**
 * Os passos que um plano de criação PRECISA declarar para poder ser conferido.
 * Sem campanha não há categoria especial; sem conjunto não há público. São
 * justamente os dois campos cuja violação custa a CONTA, não o anúncio.
 */
const PASSOS_EXIGIDOS: ReadonlyArray<{ kind: ExecutionStep["kind"]; rotulo: string; porque: string }> = [
  {
    kind: "create_campaign",
    rotulo: "Campanha declarada no plano",
    porque:
      "sem o passo create_campaign o plano não declara special_ad_categories, e a categoria HOUSING é o que separa anunciar imóvel de violar a política — o risco é a conta, não o anúncio",
  },
  {
    kind: "create_adset",
    rotulo: "Conjunto declarado no plano",
    porque:
      "sem o passo create_adset o plano não carrega targeting, e as travas HOUSING (idade, gênero, geo) não têm o que conferir",
  },
];

function conferirEstrutura(steps: ExecutionStep[]): ItemDaRegua[] {
  const lista = Array.isArray(steps) ? steps : [];
  const fonte = citar(FONTES.categoriaEspecial);
  return PASSOS_EXIGIDOS.map(({ kind, rotulo, porque }) => {
    const presente = lista.some((s) => s?.kind === kind);
    return {
      chave: `plano_${kind}`,
      grupo: "publico" as const,
      rotulo,
      estado: presente ? ("aprovado" as const) : ("reprovado" as const),
      severidade: "bloqueio" as const,
      // "propor": um plano sem estes passos não é um plano incompleto que o
      // tempo resolve — é um plano que ninguém consegue conferir. E o que não
      // se confere não vai para a Caixa de Aprovações, porque a assinatura de
      // lá é o documento que autoriza gasto depois.
      impede: "propor" as const,
      detalhe: presente ? `o plano traz ${kind}` : `plano sem ${kind}: ${porque}`,
      fonte,
    };
  });
}

/**
 * O veredito da régua sobre um plano de publicação inteiro.
 *
 * Mesmíssima régua da tela de composição — `conferirPecaNaMeta` — só que
 * alimentada pelo plano em vez de pelos campos do formulário. `podePropor` e
 * `podeAtivar` mantêm o significado que a régua lhes deu: falta de mídia impede
 * ATIVAR e não impede propor; texto, política, público e estrutura impedem
 * propor.
 */
export function conferirPlanoNaMeta(steps: ExecutionStep[]): VereditoDaRegua {
  const estrutura = conferirEstrutura(steps);
  const daPeca = conferirPecaNaMeta(pecaDoPlano(steps));
  return fecharVeredito([...estrutura, ...daPeca.itens]);
}
