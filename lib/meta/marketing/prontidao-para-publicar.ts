/**
 * O QUE FALTA PARA O DONO APERTAR O BOTÃO — item a item, com dono e com número
 * medido.
 *
 * ── A DIFERENÇA PARA `prontidao-para-ligar.ts` ──────────────────────────────
 *
 * Aquele módulo responde "por que a IA não fala com ninguém?". Este responde
 * "por que ninguém publicou um anúncio?". A FORMA é deliberadamente a mesma —
 * `Medida` com `valor: number | null`, os quatro estados, a cadeira que resolve,
 * o que ainda dá para fazer sem o item — e não é imitação: os tipos e as
 * explicações são IMPORTADOS de lá. Duas telas que dissessem "não medido" com
 * sentidos diferentes seriam duas verdades sobre a mesma palavra, e este
 * repositório já pagou por isso.
 *
 * O que muda é o PREDICADO, e a razão é medida.
 *
 * ── POR QUE EXISTE UM SEGUNDO CRITÉRIO ──────────────────────────────────────
 *
 * "Ligar a IA" só faz perguntas de existência: há template? há número? Um `0`
 * sempre significa falta.
 *
 * "Publicar" faz duas perguntas de naturezas opostas:
 *
 *   - existência — "há imagem para subir?"  → `0` é BLOQUEIO
 *   - divergência — "a conta que gasta é a mesma de onde vêm as leads?"
 *                                            → `0` é PRONTO
 *
 * O mesmo zero, dois significados contrários. Um painel que pinta por número em
 * vez de pintar pela PERGUNTA acerta um e erra o outro — e o que ele erra é
 * justamente o item que já custou dinheiro aqui. Por isso `criterio` é um campo
 * declarado no catálogo e executado no motor, não uma convenção de nome.
 *
 * ── A REGRA QUE ESTE MÓDULO ACRESCENTA ──────────────────────────────────────
 *
 * `prontidao-para-ligar.ts` ensinou que **falha de leitura não é zero**. A
 * publicação obriga a dizer a versão dela para comparações:
 *
 *   **comparar nada não produz "nenhuma divergência".**
 *
 * Se não houver anúncio ativo para inspecionar, o número de páginas
 * desconhecidas é zero — trivialmente, e um painel ingênuo pintaria de verde o
 * item mais perigoso da lista. Por isso `medirDivergencias` exige o TAMANHO da
 * amostra e devolve `null` quando ela é vazia: eu não comparei, e não comparar
 * não é concordar. Foi assim que 21 anúncios ativos publicando numa Página que o
 * CRM não conhece passariam despercebidos no dia em que a listagem viesse vazia.
 *
 * ── O QUE ESTE MÓDULO NUNCA FAZ ─────────────────────────────────────────────
 *
 * Não publica, não ativa, não gasta. Ele nem sequer fala com a Meta: recebe
 * medidas por parâmetro e devolve veredito por valor. Puro — sem `fs`, sem rede,
 * sem relógio, sem `process.env`, sem `server-only`, sem `@/` — para o contrato
 * EXECUTAR a precedência em vez de procurar strings no fonte. Este repositório
 * já viu asserção por grep sobreviver a `if (false)`.
 */

import {
  EXPLICACAO_DO_ESTADO,
  EXPLICACAO_DO_GERAL,
  QUEM_RESOLVE,
  type EstadoDoItem,
  type EstadoGeral,
  type Medida,
  type QuemResolve,
} from "../../ai/prontidao-para-ligar.ts";

export {
  EXPLICACAO_DO_ESTADO,
  EXPLICACAO_DO_GERAL,
  QUEM_RESOLVE,
  type EstadoDoItem,
  type EstadoGeral,
  type Medida,
  type QuemResolve,
};

/* ── OS DOIS CRITÉRIOS ──────────────────────────────────────────────────────
   `existe`         — pronto quando `valor >= minimoParaPublicar`.
   `sem_divergencia`— pronto quando `valor === 0`. A unidade é sempre uma
                      contagem de DESACORDOS; nunca de acertos. Contar acertos
                      esconderia o caso "10 de 11 conferem", que é uma
                      divergência com aparência de maioria. */

export type Criterio = "existe" | "sem_divergencia";

export const EXPLICACAO_DO_CRITERIO: Record<Criterio, string> = {
  existe:
    "Pergunta de existência: o item precisa aparecer pelo menos uma vez. Aqui zero é falta.",
  sem_divergencia:
    "Pergunta de divergência: o item conta desacordos entre duas fontes que deveriam concordar. " +
    "Aqui zero é o resultado bom — e só vale depois de ter comparado alguma coisa.",
};

/* ── OS GRUPOS ──────────────────────────────────────────────────────────────
   A tela precisa agrupar, porque quinze linhas seguidas viram parede. O grupo
   não altera nenhuma decisão: é rótulo de leitura, e está aqui para não nascer
   uma segunda lista na interface — o lugar onde as duas listas divergem. */

export type GrupoDePublicacao = "conta" | "destino" | "midia" | "conversao" | "decisao";

export const TITULO_DO_GRUPO: Record<GrupoDePublicacao, string> = {
  conta: "Conta de anúncios — de onde sai a verba",
  destino: "Página e formulário — para onde a lead vai",
  midia: "Mídia — a peça que sobe",
  conversao: "Conversão — o que a Meta aprende com a venda",
  decisao: "Decisão — verba e objetivo de quem manda",
};

/* ── ADAPTADORES DE MEDIDA ──────────────────────────────────────────────────
   Moram aqui, e não na rota, pela mesma razão do módulo irmão: é nesta
   fronteira que o zero falso nasce, e código que a rota guarda para si é código
   que o contrato não consegue executar. */

const semMedida = (comoFoiMedido: string, motivoSemMedida: string): Medida => ({
  valor: null,
  fonte: "banco",
  comoFoiMedido,
  motivoSemMedida,
});

/**
 * Uma lista lida com sucesso vira contagem; `null`/`undefined` vira "não medido".
 *
 * A checagem é `Array.isArray` e não `lista?.length ?? 0`: o `?? 0` parece
 * equivalente e transforma "a Graph não respondeu" em "a biblioteca está
 * vazia" — que é o mesmo defeito do `Number(null)` já documentado no módulo
 * irmão, cometido com outra sintaxe.
 */
export function medirLista(
  lista: readonly unknown[] | null | undefined,
  comoFoiMedido: string,
  oQue: string,
): Medida {
  if (!Array.isArray(lista)) {
    return semMedida(comoFoiMedido, `não foi possível listar ${oQue} — a leitura falhou, e isto não é zero`);
  }
  return { valor: lista.length, fonte: "banco", comoFoiMedido };
}

/** Presença de variáveis de ambiente. O VALOR nunca sai daqui — só a presença. */
export function medirVariaveis(
  nomes: readonly string[],
  env: Record<string, string | undefined>,
  comoFoiMedido: string,
): Medida {
  const presentes = nomes.every((nome) => String(env[nome] ?? "").trim().length > 0);
  return { valor: presentes ? 1 : 0, fonte: "ambiente", comoFoiMedido };
}

/**
 * A medida de DIVERGÊNCIA, e o motivo de ela precisar de um adaptador próprio.
 *
 * `comparados` é o tamanho da amostra que foi de fato confrontada. Sem ele,
 * `divergentes.length === 0` é ambíguo entre duas frases opostas:
 *
 *   "comparei 21 anúncios e todos usam página conhecida"   → pronto
 *   "não havia anúncio nenhum para comparar"               → não medido
 *
 * A segunda é a que aparece quando a Graph devolve lista vazia por rate limit,
 * por token de outra conta, ou porque a campanha foi pausada. Deixar as duas
 * colapsarem em `0` publica saúde por ausência de evidência — exatamente o que
 * este arquivo existe para impedir.
 *
 * `comparados: null` significa que nem a amostra pôde ser lida.
 */
export function medirDivergencias(
  divergentes: readonly string[] | null | undefined,
  comparados: number | null,
  comoFoiMedido: string,
  oQueSeCompara: string,
): Medida {
  if (comparados === null || !Array.isArray(divergentes)) {
    return semMedida(comoFoiMedido, `não foi possível comparar ${oQueSeCompara} — a leitura falhou, e isto não é "sem divergência"`);
  }
  if (comparados <= 0) {
    return semMedida(
      comoFoiMedido,
      `não havia ${oQueSeCompara} para comparar. Zero desacordos numa amostra vazia não é acordo`,
    );
  }
  return { valor: divergentes.length, fonte: "banco", comoFoiMedido };
}

/* ── O CATÁLOGO ─────────────────────────────────────────────────────────────
   A ordem é a ordem em que a PUBLICAÇÃO tropeça, não a ordem em que a gente
   pensa. Quem começa pela mídia sobe imagem para uma conta que o token não
   alcança; quem começa pela conta descobre em dez segundos que o resto é
   consequência.

   `semEleDaPara` NUNCA é vazio: um painel de bloqueios que só diz "não dá"
   ensina a pessoa a fechar a aba. */

export type ItemDePublicacao = {
  id: string;
  titulo: string;
  grupo: GrupoDePublicacao;
  criterio: Criterio;
  /** Só usado quando `criterio` é `existe`. Quase sempre 1: existir ou não. */
  minimoParaPublicar: number;
  /** O que o número conta, no plural, para a frase sair legível. */
  unidade: string;
  quemResolve: QuemResolve;
  oQueFazer: string;
  semEleDaPara: string;
  /** Ids cujo bloqueio EXPLICA este resultado. Vazio = causa própria. */
  decorreDe: string[];
};

export const CATALOGO_DE_PUBLICACAO: ItemDePublicacao[] = [
  /* ── CONTA ──────────────────────────────────────────────────────────── */
  {
    id: "conta_configurada",
    titulo: "Conta de anúncios escolhida no servidor",
    grupo: "conta",
    criterio: "existe",
    minimoParaPublicar: 1,
    unidade: "variável(is) preenchida(s)",
    quemResolve: "servidor",
    oQueFazer:
      "Publicar `META_AD_ACCOUNT_ID` com o identificador `act_…` da conta que vai pagar a verba. " +
      "Sem ela nenhuma outra medida desta lista tem sujeito: não há conta para perguntar nada a respeito.",
    semEleDaPara:
      "Compor a proposta inteira e deixá-la pendente em /approvals. Proposta pendente não gasta, " +
      "e a composição (empreendimento, público, texto, verba) não depende da conta estar escolhida.",
    decorreDe: [],
  },
  {
    id: "conta_alcancavel",
    titulo: "A conta responde a ESTE token",
    grupo: "conta",
    criterio: "existe",
    minimoParaPublicar: 1,
    unidade: "conta(s) alcançada(s) na listagem viva",
    quemResolve: "dono",
    oQueFazer:
      "Dar ao System User acesso de ads_management à conta, no Business Manager. Atenção ao " +
      "diagnóstico: a Meta responde “(#200) Ad account owner has NOT grant ads_management” tanto " +
      "quando falta permissão quanto quando o ID é de outra conta — e neste repositório já foi o ID " +
      "as duas vezes. Confira o `act_…` contra a listagem antes de pedir permissão a alguém.",
    semEleDaPara:
      "Ler tudo o que já está no CRM: leads, atribuição, funil e custo histórico continuam medidos, " +
      "porque eles vêm do banco e do webhook, não desta credencial.",
    decorreDe: ["conta_configurada"],
  },
  {
    id: "conta_da_lead_confere",
    titulo: "A conta que gasta é a mesma de onde vieram as leads",
    grupo: "conta",
    criterio: "sem_divergencia",
    minimoParaPublicar: 0,
    unidade: "campanha(s) de lead fora de toda conta alcançável",
    quemResolve: "dono",
    oQueFazer:
      "Descobrir em qual Business Manager vive a campanha que trouxe as leads e ligar a MESMA " +
      "conta ao servidor — ou aceitar, explicitamente, que a publicação vai para outro lugar. " +
      "Enquanto as duas pontas não se cruzarem, o custo é medido numa conta e o resultado noutra: " +
      "todo CPL calculado por aqui é um número sem denominador comum.",
    semEleDaPara:
      "Contar leads, qualificação e venda por campanha — a atribuição por `campaign_external_id` " +
      "funciona sem a conta. O que fica impossível é dividir custo por resultado.",
    decorreDe: ["conta_alcancavel"],
  },

  /* ── DESTINO ────────────────────────────────────────────────────────── */
  {
    id: "pagina_configurada",
    titulo: "Página do Facebook escolhida no servidor",
    grupo: "destino",
    criterio: "existe",
    minimoParaPublicar: 1,
    unidade: "variável(is) preenchida(s)",
    quemResolve: "servidor",
    oQueFazer:
      "Publicar `META_PAGE_ID`. Sem Página o anúncio não tem quem o assine e a Meta recusa o " +
      "criativo antes de qualquer revisão de conteúdo.",
    semEleDaPara:
      "Escrever e revisar a peça. Texto, título e ângulo não dependem da Página — só a publicação depende.",
    decorreDe: [],
  },
  {
    id: "pagina_dos_anuncios_reconhecida",
    titulo: "A Página onde os anúncios já publicam é conhecida pelo CRM",
    grupo: "destino",
    criterio: "sem_divergencia",
    minimoParaPublicar: 0,
    unidade: "Página(s) em uso que o CRM não conhece",
    quemResolve: "operacao",
    oQueFazer:
      "Cadastrar a fonte em `meta_lead_sources` com a Página que os anúncios ATIVOS realmente " +
      "assinam, com dono e empreendimento. O webhook casa a lead pela Página ANTES de olhar o " +
      "formulário: Página desconhecida faz a lead paga cair em `meta_leads_sem_destino` — a verba " +
      "sai, a lead entra, e nenhuma tela acusa nada.",
    semEleDaPara:
      "Trabalhar as leads que já chegaram por fontes cadastradas. Elas continuam entrando normalmente; " +
      "o que se perde é a lead da Página nova.",
    decorreDe: ["conta_alcancavel"],
  },
  {
    id: "formulario_configurado",
    titulo: "Formulário instantâneo escolhido no servidor",
    grupo: "destino",
    criterio: "existe",
    minimoParaPublicar: 1,
    unidade: "variável(is) preenchida(s)",
    quemResolve: "servidor",
    oQueFazer:
      "Publicar `META_LEAD_FORM_ID` com o formulário que vai receber o contato. Formulário é onde a " +
      "pessoa deixa o telefone; sem ele o objetivo “gerar leads” não tem destino.",
    semEleDaPara:
      "Publicar por outro objetivo no Gerenciador de Anúncios, à mão. O que não dá é montar o plano " +
      "de leads por aqui.",
    decorreDe: [],
  },
  {
    id: "formulario_ligado_ao_crm",
    titulo: "O formulário escolhido está cadastrado, ativo e com empreendimento",
    grupo: "destino",
    criterio: "existe",
    minimoParaPublicar: 1,
    unidade: "fonte(s) cadastrada(s) e completa(s)",
    quemResolve: "operacao",
    oQueFazer:
      "Cadastrar o formulário em `meta_lead_sources` com `active = true` e `development_id` " +
      "preenchido. Fonte sem empreendimento faz a lead nascer sem destino comercial, e fonte " +
      "desativada represa a lead depois de a verba já ter sido gasta por ela.",
    semEleDaPara:
      "Receber a lead mesmo assim, se a Página for conhecida — ela entra e alguém distribui à mão. " +
      "O que se perde é o roteamento automático para o empreendimento certo.",
    decorreDe: ["formulario_configurado"],
  },

  /* ── MÍDIA ──────────────────────────────────────────────────────────── */
  {
    id: "midia_na_biblioteca_da_meta",
    titulo: "Há imagem ou vídeo aprovado na biblioteca da conta",
    grupo: "midia",
    criterio: "existe",
    minimoParaPublicar: 1,
    unidade: "peça(s) na biblioteca da conta",
    quemResolve: "dono",
    oQueFazer:
      "Subir a peça pelo Gerenciador de Anúncios, ou aprovar que alguém a suba. Este produto não " +
      "envia mídia para a Meta por conta própria — enviar é escrita, e escrita na conta do dono é " +
      "decisão dele.",
    semEleDaPara:
      "Fechar o texto e o público. A peça é o último item a entrar no criativo, e tudo o mais pode " +
      "estar decidido antes dela.",
    decorreDe: [],
  },
  {
    id: "midia_referenciavel_pelo_crm",
    titulo: "O CRM tem o hash/ID da peça para montar o criativo",
    grupo: "midia",
    criterio: "existe",
    minimoParaPublicar: 1,
    unidade: "peça(s) registrada(s) no CRM",
    /**
     * Era `codigo` até 02/08/2026, e mudou de cadeira quando a importação
     * passou a existir (`/api/v1/marketing/biblioteca-de-midia`). Um item que
     * continuasse mandando escrever código já escrito é um painel que envelhece
     * mentindo — e manda a liderança pedir a alguém o que ela mesma resolve com
     * um clique.
     */
    quemResolve: "operacao",
    oQueFazer:
      "Abrir a composição da proposta e clicar em “Importar da biblioteca da Meta”: a importação lê " +
      "`/adimages` e `/advideos` (só GET) e grava em `creative_assets` o hash/ID de cada peça, com a " +
      "conta a que ela pertence. Repare na diferença que este par de itens revela: o item acima pode " +
      "estar PRONTO e este BLOQUEADO ao mesmo tempo — a peça existe na Meta e o CRM não tem como " +
      "citá-la. Um painel de um item só leria “0 mídias” e mandaria o dono produzir uma imagem que já " +
      "está pronta há semanas.",
    semEleDaPara:
      "Publicar informando o hash à mão na composição da proposta: o campo aceita o identificador " +
      "que o Gerenciador de Anúncios mostra, e continua aceitando depois da importação.",
    decorreDe: ["midia_na_biblioteca_da_meta"],
  },

  /* ── CONVERSÃO ──────────────────────────────────────────────────────── */
  {
    id: "dataset_configurado",
    titulo: "Dataset de conversão configurado para esta organização",
    grupo: "conversao",
    criterio: "existe",
    minimoParaPublicar: 1,
    unidade: "configuração(ões) habilitada(s)",
    quemResolve: "operacao",
    oQueFazer:
      "Cadastrar o Dataset em Integrações › Meta e habilitá-lo. Sem ele a Meta otimiza para quem " +
      "preenche formulário, não para quem compra.",
    semEleDaPara:
      "Publicar e captar lead normalmente. O que falta é o aprendizado: a Meta continua caçando " +
      "volume de formulário em vez de perfil de comprador.",
    decorreDe: [],
  },
  {
    id: "dataset_recebendo",
    titulo: "Evento de conversão chegou à Meta na janela",
    grupo: "conversao",
    criterio: "existe",
    minimoParaPublicar: 1,
    unidade: "evento(s) entregue(s) na janela",
    quemResolve: "servidor",
    oQueFazer:
      "Conferir o token de conversões e o Dataset. Configuração habilitada não é envio: só conta " +
      "linha com `status = 'delivered'` dentro da janela.",
    semEleDaPara:
      "Medir a venda dentro do CRM, que é onde ela é apurada de verdade. O envio à Meta melhora a " +
      "entrega dela; não melhora o número do diretor.",
    decorreDe: ["dataset_configurado"],
  },
  {
    id: "dataset_sem_evento_morto",
    titulo: "Nenhum evento de conversão morreu na fila",
    grupo: "conversao",
    criterio: "sem_divergencia",
    minimoParaPublicar: 0,
    unidade: "evento(s) em dead_letter na janela",
    quemResolve: "servidor",
    oQueFazer:
      "Ler `last_error` das linhas mortas em `meta_conversion_events` e corrigir a causa antes de " +
      "subir verba — a mais comum é `META_CONVERSIONS_ACCESS_TOKEN` ausente no servidor que roda o " +
      "worker, que não é o mesmo lugar onde alguém testou. Este item existe separado do anterior " +
      "porque os dois podem ser verdade juntos: alguns eventos entregam e outros morrem, e um " +
      "painel que só perguntasse “chegou algum?” responderia SIM e esconderia a maioria que não " +
      "chegou.",
    semEleDaPara:
      "Continuar publicando — evento morto não impede anúncio. O que ele estraga é a otimização, em " +
      "silêncio e para pior.",
    decorreDe: ["dataset_configurado"],
  },
  {
    id: "dataset_fora_do_modo_de_teste",
    titulo: "O dataset saiu do modo de teste",
    grupo: "conversao",
    criterio: "sem_divergencia",
    minimoParaPublicar: 0,
    unidade: "configuração(ões) presa(s) ao modo de teste",
    quemResolve: "dono",
    oQueFazer:
      "Era um bloqueio de DUAS pontas e uma delas caiu em 02/08/2026: o remetente já aceita o modo " +
      "de produção — enfileirar passou a depender de `enabled`, não do modo, e o `test_event_code` " +
      "só acompanha o evento quando o modo é de teste. Falta a ponta que é decisão, não código: " +
      "promover o dataset. Isso é um ato de diretoria, pela ação `conversion_go_live` em " +
      "`/api/v1/integrations/meta` — ela confere que o dataset já foi configurado e provado em " +
      "teste antes de virar. Enquanto o modo for de teste, o evento sai com `test_event_code` e a " +
      "Meta não o usa para otimizar entrega: o dataset recebe e não aprende nada.",
    semEleDaPara:
      "Continuar em teste, que é o que está no ar e de fato entrega evento — dá para provar que o " +
      "encanamento funciona ponta a ponta. O que não dá é esperar que a entrega dos anúncios melhore " +
      "por causa disso.",
    decorreDe: ["dataset_configurado"],
  },

  /* ── DECISÃO ────────────────────────────────────────────────────────── */
  {
    id: "verba_e_objetivo_aprovados",
    titulo: "Verba e objetivo aprovados por quem decide",
    grupo: "decisao",
    criterio: "existe",
    minimoParaPublicar: 1,
    unidade: "proposta(s) aprovada(s)",
    quemResolve: "dono",
    oQueFazer:
      "Abrir /approvals e decidir uma proposta pendente. Aprovar é o ato que declara verba e " +
      "objetivo; nada neste sistema publica sem ele, e nada aqui deve tentar adivinhá-lo.",
    semEleDaPara:
      "Compor e propor quantas campanhas quiser. Proposta pendente é gratuita, e é ela que dá ao " +
      "dono o que decidir.",
    decorreDe: [],
  },
  {
    id: "proposta_aponta_para_conta_alcancavel",
    titulo: "A proposta pendente aponta para uma conta que este token alcança",
    grupo: "decisao",
    criterio: "sem_divergencia",
    minimoParaPublicar: 0,
    unidade: "proposta(s) pendente(s) apontando para conta inalcançável",
    quemResolve: "operacao",
    oQueFazer:
      "Recompor a proposta com a conta atual antes de aprovar, ou dar acesso à conta que ela " +
      "carrega. Uma proposta guarda o `accountId` do dia em que foi criada: aprovar hoje uma " +
      "proposta de semanas atrás executa contra a conta de então. É o único item desta lista que " +
      "falha DEPOIS do clique do dono — e por isso o mais caro de descobrir tarde.",
    semEleDaPara:
      "Aprovar as propostas cuja conta confere, se houver. E recompor as demais custa uma tela, não " +
      "uma permissão.",
    decorreDe: ["conta_alcancavel"],
  },
];

/* ── O VEREDITO DE CADA ITEM ────────────────────────────────────────────── */

export type VereditoDoItem = ItemDePublicacao & {
  estado: EstadoDoItem;
  medida: Medida;
  /** A frase pronta para a tela. Nunca afirma mais do que a medida sustenta. */
  frase: string;
  /** Ids que explicam este resultado. Só preenchido quando `estado` é `consequencia`. */
  bloqueadoPor: string[];
};

const MEDIDA_AUSENTE: Medida = {
  valor: null,
  fonte: "codigo",
  comoFoiMedido: "medida não reportada pela rota",
  motivoSemMedida:
    "A rota não enviou esta medida. Não é zero e não é pronto: é um item que ninguém mediu.",
};

/**
 * O predicado, e o único lugar onde `criterio` muda alguma coisa.
 *
 * `null` vence antes de qualquer critério: não medi, não decido. Depois disso,
 * `existe` compara com o mínimo e `sem_divergencia` exige exatamente zero.
 */
function estadoBase(item: ItemDePublicacao, medida: Medida | undefined): EstadoDoItem {
  if (!medida || medida.valor === null) return "nao_medido";
  if (item.criterio === "sem_divergencia") return medida.valor === 0 ? "pronto" : "bloqueia";
  return medida.valor >= item.minimoParaPublicar ? "pronto" : "bloqueia";
}

/**
 * Avalia o catálogo inteiro contra as medidas de agora.
 *
 * Dois passes, e o segundo lê o estado do PRIMEIRO — a mesma construção do
 * módulo irmão, pelas mesmas duas razões: não há ordem de avaliação para
 * acertar, e não há ciclo possível. Consequência de consequência não encadeia:
 * um item que depende de um sintoma tem a dependência declarada errada, e é
 * melhor que ele apareça como causa — visível e questionável — do que sumir
 * atrás de dois níveis de "não é comigo".
 */
export function avaliarProntidaoParaPublicar(
  medidas: Record<string, Medida>,
  catalogo: ItemDePublicacao[] = CATALOGO_DE_PUBLICACAO,
): VereditoDoItem[] {
  const base = new Map<string, EstadoDoItem>();
  for (const item of catalogo) base.set(item.id, estadoBase(item, medidas[item.id]));

  return catalogo.map((item): VereditoDoItem => {
    const medida = medidas[item.id] ?? MEDIDA_AUSENTE;
    const estadoInicial = base.get(item.id)!;

    // Só um item que está de fato bloqueando pode ser rebaixado a sintoma.
    // `nao_medido` NUNCA vira consequência: não sei o valor dele, e explicá-lo
    // pela causa de outro seria inventar a razão de um número que não li.
    const bloqueadoPor =
      estadoInicial === "bloqueia"
        ? item.decorreDe.filter((antecedente) => base.get(antecedente) !== "pronto")
        : [];

    const estado: EstadoDoItem = bloqueadoPor.length ? "consequencia" : estadoInicial;

    // A frase recebe TÍTULOS, não ids: o dono não deveria ter de traduzir
    // `conta_alcancavel` para saber o que está esperando. `bloqueadoPor`
    // continua com os ids, porque quem consome o JSON precisa da chave estável.
    const titulos = bloqueadoPor.map(
      (antecedente) => catalogo.find((outro) => outro.id === antecedente)?.titulo ?? antecedente,
    );

    return { ...item, estado, medida, bloqueadoPor, frase: fraseDoItem(item, estado, medida, titulos) };
  });
}

function fraseDoItem(
  item: ItemDePublicacao,
  estado: EstadoDoItem,
  medida: Medida,
  bloqueadoPor: string[],
): string {
  if (estado === "nao_medido") {
    return (
      `${item.titulo}: NÃO MEDIDO — ${medida.motivoSemMedida ?? "a leitura falhou e não disse por quê"}. ` +
      "Isto não é zero."
    );
  }
  const contagem = `${medida.valor} ${item.unidade}`;
  if (estado === "pronto") {
    // A frase do item de divergência precisa dizer que zero é o resultado BOM.
    // "0 páginas desconhecidas: pronto" lido rápido parece um bloqueio escrito
    // ao contrário, e um painel que confunde os dois perde exatamente o leitor
    // apressado para quem ele foi feito.
    return item.criterio === "sem_divergencia"
      ? `${item.titulo}: confere — ${contagem} (${medida.comoFoiMedido}).`
      : `${item.titulo}: pronto — ${contagem} (${medida.comoFoiMedido}).`;
  }
  if (estado === "consequencia") {
    return (
      `${item.titulo}: ${contagem} — e isto é consequência de ${bloqueadoPor.join(", ")}. ` +
      "Não é uma tarefa própria."
    );
  }
  const abertura =
    item.criterio === "sem_divergencia"
      ? `${item.titulo}: DIVERGE — ${contagem} (${medida.comoFoiMedido}).`
      : `${item.titulo}: BLOQUEIA com ${contagem} (${medida.comoFoiMedido}).`;
  return `${abertura} Resolve: ${QUEM_RESOLVE[item.quemResolve]}.`;
}

/* ── O VEREDITO GERAL ───────────────────────────────────────────────────── */

export type VereditoDePublicacao = {
  estado: EstadoGeral;
  itens: VereditoDoItem[];
  bloqueios: number;
  naoMedidos: number;
  consequencias: number;
  prontos: number;
  /** Quantas CAUSAS cada cadeira tem na mão. Sintoma não entra na conta de ninguém. */
  porQuemResolve: Record<QuemResolve, number>;
  /** A primeira causa na ordem em que a publicação tropeça. `null` quando não há causa. */
  primeiroPasso: VereditoDoItem | null;
  /** O que continua possível hoje. Nunca vazio enquanto houver bloqueio. */
  oQueDaParaFazerHoje: string[];
  /**
   * `true` só quando TODO item foi medido e nenhum bloqueia. Um único item no
   * escuro derruba a conclusão — "não sei" nunca vira "sim".
   */
  podePublicar: boolean;
  frase: string;
};

export function resumirProntidaoParaPublicar(
  medidas: Record<string, Medida>,
  catalogo: ItemDePublicacao[] = CATALOGO_DE_PUBLICACAO,
): VereditoDePublicacao {
  const itens = avaliarProntidaoParaPublicar(medidas, catalogo);
  const conta = (estado: EstadoDoItem) => itens.filter((item) => item.estado === estado).length;

  const bloqueios = conta("bloqueia");
  const naoMedidos = conta("nao_medido");
  const consequencias = conta("consequencia");
  const prontos = conta("pronto");

  const porQuemResolve: Record<QuemResolve, number> = { dono: 0, operacao: 0, servidor: 0, codigo: 0 };
  // Só CAUSA entra. Somar sintoma faria a fila do dono parecer maior do que é,
  // e uma fila inflada é uma fila em que ele para de acreditar.
  for (const item of itens) if (item.estado === "bloqueia") porQuemResolve[item.quemResolve] += 1;

  const estado: EstadoGeral =
    naoMedidos === itens.length && itens.length > 0
      ? "sem_leitura"
      : bloqueios > 0
        ? "bloqueada"
        : naoMedidos > 0
          ? "incerta"
          : "pronta";

  const primeiroPasso = itens.find((item) => item.estado === "bloqueia") ?? null;

  const oQueDaParaFazerHoje = [
    ...new Set(itens.filter((item) => item.estado === "bloqueia").map((item) => item.semEleDaPara)),
  ];

  return {
    estado,
    itens,
    bloqueios,
    naoMedidos,
    consequencias,
    prontos,
    porQuemResolve,
    primeiroPasso,
    oQueDaParaFazerHoje,
    // Consequência NÃO entra: um sintoma some quando a causa é resolvida, e
    // exigi-lo aqui seria pedir duas vezes a mesma coisa. Mas bloqueio e não
    // medido derrubam, e é por isso que esta linha não é `bloqueios === 0`.
    podePublicar: estado === "pronta",
    frase: fraseGeral({ estado, bloqueios, naoMedidos, consequencias, prontos, primeiroPasso }),
  };
}

function fraseGeral(dados: {
  estado: EstadoGeral;
  bloqueios: number;
  naoMedidos: number;
  consequencias: number;
  prontos: number;
  primeiroPasso: VereditoDoItem | null;
}): string {
  if (dados.estado === "sem_leitura") {
    return (
      "Não consegui medir nenhum item da publicação. Não estou dizendo que falta tudo — estou " +
      "dizendo que não li nada."
    );
  }
  if (dados.estado === "pronta") {
    return `Os ${dados.prontos} itens foram medidos e nenhum bloqueia. O botão pode ser apertado.`;
  }
  if (dados.estado === "incerta") {
    return (
      `Nenhum bloqueio medido, e ${dados.naoMedidos} item(ns) não pôde(puderam) ser lido(s). ` +
      "Não dá para chamar isso de pronta para publicar."
    );
  }
  const partes = [`${dados.bloqueios} bloqueio(s) medido(s)`];
  if (dados.consequencias) partes.push(`${dados.consequencias} que são consequência deles`);
  if (dados.prontos) partes.push(`${dados.prontos} item(ns) já pronto(s)`);
  if (dados.naoMedidos) partes.push(`${dados.naoMedidos} não lido(s)`);
  const primeiro = dados.primeiroPasso
    ? ` O primeiro é "${dados.primeiroPasso.titulo}" — resolve ${QUEM_RESOLVE[dados.primeiroPasso.quemResolve]}.`
    : "";
  return `Ninguém deveria apertar o botão: ${partes.join(", ")}.${primeiro}`;
}
