/**
 * O QUE FALTA PARA LIGAR A IA — item a item, com dono e com número medido.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * A resposta para "por que a IA não fala com ninguém?" existia espalhada em
 * cinco lugares que não se encontram: o template mora no Business Manager da
 * Meta, o número mora no ambiente do servidor, a jornada mora numa tabela, o
 * percentual do diretor não mora em lugar nenhum, e a chave do provedor mora
 * num `.env` que o dono não abre. Ninguém conseguia olhar UMA tela e saber.
 *
 * O pior é que cada uma dessas fontes, sozinha, responde com um zero — e zero
 * desenhado sem causa lê-se como calma. `ai_sales_journeys` tem 0 linhas; um
 * painel ingênuo escreveria "0 jornadas" ao lado de "0 erros" e o dono
 * concluiria que está tudo em ordem e vazio. Está bloqueado, e a diferença é
 * tudo.
 *
 * ── A REGRA QUE DEFINE ESTE MÓDULO ──────────────────────────────────────────
 *
 * **Ausência nunca é saúde.** Um item com zero não devolve um número neutro:
 * devolve `bloqueia`, com QUEM resolve e O QUE ainda dá para fazer sem ele.
 *
 * E o inverso, que é onde a maioria dos painéis honestos ainda mente: **falha
 * de leitura não é zero**. Toda medida é `number | null`. `0` quer dizer
 * "contei, não havia nenhum". `null` quer dizer "não consegui contar" — e vira
 * `nao_medido`, que não é verde nem é bloqueio, é a confissão de que a tela não
 * sabe. Colapsar os dois faria a tela mostrar tudo zerado, com cara de pronto,
 * exatamente no dia em que o banco não respondeu.
 *
 * ── POR QUE `consequencia` É UM ESTADO SEPARADO ─────────────────────────────
 *
 * Medido no banco de produção em 02/08/2026: `ai_sales_journeys` = 0. É
 * verdade, e mandar o dono "resolver as jornadas" seria mandá-lo ao lugar
 * errado — não nasce jornada sem envio, e não há envio sem template. A jornada
 * zerada é SINTOMA.
 *
 * Sem essa distinção o painel vira uma parede de seis vermelhos com seis donos,
 * quando existem três causas. Uma lista de pendências que não separa causa de
 * sintoma não é uma lista de pendências: é um ruído com aparência de rigor.
 *
 * ── MÓDULO PURO, E POR QUE ISSO IMPORTA AQUI ────────────────────────────────
 *
 * Sem `fs`, sem rede, sem `server-only`, sem `@/`. As medições entram por
 * parâmetro e a decisão sai por valor, então o contrato EXECUTA a precedência
 * em vez de procurar strings no fonte. Este repositório já viu duas vezes uma
 * proteção por grep sobreviver a `if (false)` — a asserção continuava verde com
 * o código morto. Aqui não há o que grepar: há o que rodar.
 *
 * O import relativo com extensão `.ts` é deliberado: `node --test` não conhece
 * os caminhos do tsconfig, e o atalho `@/` tornaria este módulo inalcançável
 * pelo contrato.
 */

import { MODELO_DE_FALLBACK, PROVEDOR_DE_FALLBACK } from "./prontidao-generativa.ts";

/* ── QUEM RESOLVE ──────────────────────────────────────────────────────────
   Quatro responsáveis, porque são quatro pessoas diferentes com quatro
   agendas diferentes. "Está pendente" sem dono é o mesmo que não estar na
   lista: cada item aqui nomeia a cadeira que destrava, e nenhuma delas é
   "alguém". */

export type QuemResolve = "dono" | "operacao" | "servidor" | "codigo";

export const QUEM_RESOLVE: Record<QuemResolve, string> = {
  dono: "o dono — decisão ou cadastro fora deste sistema (Meta, contrato, política)",
  operacao: "a operação — trabalho de gente no CRM, com os dados que já existem",
  servidor: "quem opera o servidor — variável de ambiente e reinício, sem código novo",
  codigo: "código — falta construir; nenhuma configuração destrava isto",
};

/* ── A MEDIDA ──────────────────────────────────────────────────────────────
   `fonte` existe para o leitor saber o peso do número sem perguntar. Um `0`
   vindo de `banco` é uma contagem; um `0` vindo de `codigo` é uma varredura no
   repositório. São afirmações de força diferente e o painel mostra qual é. */

export type FonteDaMedida = "banco" | "ambiente" | "codigo";

export type Medida = {
  /**
   * O valor contado. `null` = NÃO consegui contar.
   *
   * A distinção é o coração deste módulo. `0` é uma afirmação sobre o mundo;
   * `null` é uma afirmação sobre a leitura. Trocar um pelo outro é como
   * "ausência de dado" vira "zero" numa tela sem ninguém escrever número errado.
   */
  valor: number | null;
  fonte: FonteDaMedida;
  /** A consulta ou a variável, em uma frase. É o que torna o número auditável. */
  comoFoiMedido: string;
  /** Obrigatório quando `valor` é `null`: por que a leitura não aconteceu. */
  motivoSemMedida?: string;
};

/* ── OS ADAPTADORES DE MEDIDA ──────────────────────────────────────────────
   Onde a resposta do banco vira `Medida`. Moram AQUI, e não na rota, porque é
   exatamente nesta fronteira que o zero falso nasce — e código que a rota
   guarda para si é código que o contrato não consegue executar.

   O caso que obrigou a mudança foi encontrado nesta entrega, no próprio
   painel: `Number(resultado.data)` parecia inofensivo e `Number(null)` é `0`.
   Uma função SQL que respondesse `null` sem erro viraria uma contagem zero
   bem formatada — a mentira que este arquivo existe para impedir, cometida
   dentro dele. Agora o contrato exercita esse caso. */

export type RespostaDeContagem = { count?: number | null; error?: unknown } | null | undefined;
export type RespostaDeFuncao = { data?: unknown; error?: unknown } | null | undefined;

const semMedida = (comoFoiMedido: string, motivoSemMedida: string): Medida => ({
  valor: null,
  fonte: "banco",
  comoFoiMedido,
  motivoSemMedida,
});

/**
 * `count` do PostgREST vira medida. Erro ou ausência de resposta vira `null`
 * com motivo — jamais `0`, que afirmaria uma contagem que não aconteceu.
 */
export function medirContagem(
  resposta: RespostaDeContagem,
  comoFoiMedido: string,
  oQue: string,
): Medida {
  if (!resposta || resposta.error || typeof resposta.count !== "number") {
    return semMedida(
      comoFoiMedido,
      `não foi possível contar ${oQue} — a leitura falhou, e isto não é zero`,
    );
  }
  return { valor: resposta.count, fonte: "banco", comoFoiMedido };
}

/**
 * Retorno de função SQL, que chega em `data` e não em `count`.
 *
 * A checagem é `typeof === "number"` e NÃO `Number(...)`: a conversão parece
 * equivalente e não é. `Number(null)` é `0` e `Number("")` também. Função
 * ausente, permissão negada, retorno inesperado e `null` são todos "não sei", e
 * nenhum deles pode virar contagem.
 */
export function medirRetornoDeFuncao(
  resposta: RespostaDeFuncao,
  comoFoiMedido: string,
  oQue: string,
  ondeSeInstala?: string,
): Medida {
  const bruto = resposta && !resposta.error ? resposta.data : undefined;
  if (typeof bruto !== "number" || !Number.isFinite(bruto)) {
    return semMedida(
      comoFoiMedido,
      `não foi possível contar ${oQue} — a função SQL não respondeu` +
        (ondeSeInstala ? ` (${ondeSeInstala})` : "") +
        ". Isto não é zero",
    );
  }
  return { valor: bruto, fonte: "banco", comoFoiMedido };
}

/**
 * Presença de variáveis de ambiente. Conta 1 quando TODAS estão preenchidas.
 *
 * O `env` entra por parâmetro para o contrato conseguir montar ambientes à mão.
 * O VALOR da variável nunca sai daqui — só a presença, porque um painel que
 * ecoasse token seria um vazamento com cara de diagnóstico.
 */
export function medirVariaveisDeAmbiente(
  nomes: string[],
  env: Record<string, string | undefined>,
  comoFoiMedido: string,
): Medida {
  const presentes = nomes.every((nome) => String(env[nome] ?? "").trim().length > 0);
  return { valor: presentes ? 1 : 0, fonte: "ambiente", comoFoiMedido };
}

/* ── O CATÁLOGO ────────────────────────────────────────────────────────────
   Cada item declara: o que é, quanto basta, quem resolve, o que fazer, e o que
   continua possível sem ele.

   `semEleDaPara` NUNCA é vazio, e isso é uma regra e não um acaso. Um painel de
   bloqueios que só diz "não dá" ensina a pessoa a fechar a aba. O degrau 1 do
   modelo (modo sombra) foi desenhado justamente para operar sem template, sem
   número e sem aprovação — então em todo item bloqueado existe uma resposta
   verdadeira para "e enquanto isso?". */

export type ItemDeProntidao = {
  id: string;
  titulo: string;
  /** O mínimo para o item deixar de bloquear. Quase sempre 1: existir ou não. */
  minimoParaLigar: number;
  /** O que o número conta, no plural, para a frase sair legível. */
  unidade: string;
  quemResolve: QuemResolve;
  oQueFazer: string;
  semEleDaPara: string;
  /**
   * Ids cujo bloqueio EXPLICA o zero deste item. Vazio = causa própria.
   * Ver a nota sobre `consequencia` no topo do arquivo.
   */
  decorreDe: string[];
};

/**
 * A ordem é a ordem em que o motor tropeça, não a ordem em que a gente pensa.
 *
 * Medido em `app/api/v2/ai/nightly-sales/route.ts`: o consentimento é a
 * PRIMEIRA porta do laço por lead (`if (!consentBasis) { blocked += 1;
 * continue; }`) e roda ANTES da consulta ao template. Listar o template em
 * primeiro lugar — que é a ordem intuitiva, e a que o pedido sugeria — faria o
 * dono aprovar o template na Meta e continuar com zero jornadas no dia
 * seguinte, sem entender por quê.
 */
export const CATALOGO_DE_PRONTIDAO: ItemDeProntidao[] = [
  {
    id: "consentimento_legivel",
    titulo: "Consentimento que o trabalhador noturno consegue ler",
    minimoParaLigar: 1,
    unidade: "lead(s)",
    quemResolve: "codigo",
    oQueFazer:
      "Unificar a leitura da base de consentimento. O trabalhador noturno lê " +
      "`metadata.reactivation.consentBasis` e `metadata.messagingConsent`; a entrada da Meta " +
      "grava em `metadata.meta.consentBasis`. São duas chaves para o mesmo fato, e o " +
      "consumidor só conhece uma. Nenhuma configuração conserta isto.",
    semEleDaPara:
      "Tudo em modo sombra: a IA prepara a mensagem, registra o que faria e não envia. " +
      "Sombra não toca no cliente, então não depende de base de consentimento.",
    decorreDe: [],
  },
  {
    id: "template_aprovado",
    titulo: "Template de WhatsApp aprovado pela Meta",
    minimoParaLigar: 1,
    unidade: "template(s)",
    quemResolve: "dono",
    oQueFazer:
      "Submeter o template de primeira abordagem no WhatsApp Manager e aguardar a " +
      "aprovação da Meta. Aprovado, ele precisa existir em `message_templates` com " +
      "`channel='whatsapp'` e `status='approved'`. Ninguém dentro deste sistema aprova " +
      "por ela — o prazo é da Meta.",
    semEleDaPara:
      "Modo sombra roda inteiro, e a comparação IA × humano que o dono pediu sai dela: " +
      "a IA registra o que teria mandado, o corretor registra o que fez.",
    decorreDe: [],
  },
  {
    id: "numero_oficial",
    titulo: "Número oficial do WhatsApp em operação",
    minimoParaLigar: 1,
    unidade: "número(s)",
    quemResolve: "dono",
    oQueFazer:
      "Ter um número verificado na conta oficial e publicar `WHATSAPP_PHONE_NUMBER_ID` e " +
      "`WHATSAPP_ACCESS_TOKEN` no servidor. O rodízio de dez números existe em código " +
      "(`lib/whatsapp/pool-de-numeros.ts`) e hoje não tem de onde ler número nenhum: " +
      "nenhuma tabela e nenhuma rota o alimentam.",
    semEleDaPara:
      "Preparar e priorizar a fila de quem falar primeiro. A fila é útil mesmo quando " +
      "quem envia é o corretor pelo telefone dele.",
    decorreDe: [],
  },
  {
    id: "nome_do_template_no_servidor",
    titulo: "Nome do template publicado no servidor",
    minimoParaLigar: 1,
    unidade: "variável(is)",
    quemResolve: "servidor",
    oQueFazer:
      "Publicar `WHATSAPP_NIGHTLY_APPROACH_TEMPLATE` com o nome exato do template " +
      "aprovado. Sem ela o trabalhador noturno responde 503 e desiste ANTES de olhar o " +
      "banco — template aprovado e variável vazia produzem o mesmo silêncio.",
    semEleDaPara:
      "Nada muda no modo sombra: ele não usa template. Este item só entra em jogo no " +
      "dia em que o envio for ligado.",
    decorreDe: [],
  },
  {
    id: "percentual_do_diretor",
    titulo: "Percentual da operação que o diretor entrega à IA",
    minimoParaLigar: 1,
    unidade: "lugar(es) para declarar",
    quemResolve: "codigo",
    oQueFazer:
      "Construir onde o percentual é declarado e onde o braço (`ia` ou `humano`) fica " +
      "gravado na lead. Hoje o diretor não tem como dizer o número: não existe coluna, " +
      "campo de configuração nem rota que o receba. É o item 7.2 de " +
      "`docs/design/ATENDIMENTO_AUTONOMO_MODELO.md`, e ele vem ANTES da decisão do dono.",
    semEleDaPara:
      "Comparar IA e humano nos casos que a sombra já registra. Sem sorteio a comparação " +
      "não é um experimento controlado, e o painel precisa dizer isso junto com o número.",
    decorreDe: [],
  },
  {
    id: "provedor_generativo",
    titulo: "Provedor de IA que responde de verdade",
    minimoParaLigar: 1,
    unidade: "chamada(s) real(is) na janela",
    quemResolve: "servidor",
    oQueFazer:
      "Manter pelo menos um provedor com saldo e chave publicada. Chave presente não " +
      "conta: só conta resposta registrada em `ai_usage_events` dentro da janela, " +
      "excluindo o fallback determinístico local.",
    semEleDaPara:
      "As regras determinísticas continuam — fila, priorização e alerta não dependem de " +
      "modelo generativo. O que some é a redação da mensagem.",
    decorreDe: [],
  },
  {
    id: "jornadas_de_venda",
    titulo: "Jornadas de venda criadas pela IA",
    minimoParaLigar: 1,
    unidade: "jornada(s)",
    quemResolve: "codigo",
    oQueFazer:
      "Nada diretamente: jornada nasce de envio. Enquanto template, número e " +
      "consentimento estiverem parados, este número fica em zero por construção.",
    semEleDaPara:
      "A entrega matinal ao corretor pode ser montada a partir da sombra, com o que a IA " +
      "prepararia — sem jornada e sem envio.",
    decorreDe: ["consentimento_legivel", "template_aprovado", "numero_oficial"],
  },
];

/* ── OS QUATRO ESTADOS ─────────────────────────────────────────────────────── */

export type EstadoDoItem = "pronto" | "bloqueia" | "consequencia" | "nao_medido";

export const EXPLICACAO_DO_ESTADO: Record<EstadoDoItem, string> = {
  pronto: "Medido e suficiente. Este item não segura mais nada.",
  bloqueia:
    "Medido e ausente. É uma CAUSA: enquanto estiver assim, a IA não opera — e o zero " +
    "não é um número neutro, é o bloqueio.",
  consequencia:
    "Está em zero porque outro item está bloqueado. NÃO é uma tarefa: resolver a causa " +
    "resolve este. Tratá-lo como pendência manda a pessoa ao lugar errado.",
  nao_medido:
    "A leitura falhou. Isto NÃO significa que está tudo bem e NÃO significa zero — " +
    "significa que esta tela não sabe, e prefere dizer isso a desenhar um número calmo.",
};

export type VereditoDoItem = ItemDeProntidao & {
  estado: EstadoDoItem;
  medida: Medida;
  /** A frase pronta para a tela. Nunca afirma mais do que a medida sustenta. */
  frase: string;
  /** Ids que explicam este zero. Só preenchido quando `estado` é `consequencia`. */
  bloqueadoPor: string[];
};

/**
 * A janela padrão de evidência do provedor, em dias. Igual à de
 * `estado-de-credencial.ts` de propósito: duas janelas diferentes para a mesma
 * pergunta fariam duas telas discordarem sobre o mesmo provedor.
 */
export const JANELA_DE_PROVEDOR_DIAS = 7;

/**
 * O filtro que conta chamada REAL de LLM, em SQL.
 *
 * Exportado como texto para a rota e o contrato usarem a MESMA regra que
 * `prontidao-generativa.ts` aplica em memória. A exclusão é dupla — pelo
 * provedor e pelo modelo — porque o roteador grava o fallback determinístico em
 * `ai_usage_events` como se fosse uso normal, e quem contasse "existe linha
 * recente" concluiria "IA viva" justamente nas chamadas em que nenhuma IA
 * respondeu.
 *
 * As duas constantes vêm de `prontidao-generativa.ts`: se o rótulo do fallback
 * mudar lá, muda aqui junto, e não há uma segunda cópia para esquecer.
 */
export const FILTRO_DE_CHAMADA_REAL =
  `provider <> '${PROVEDOR_DE_FALLBACK}' and model <> '${MODELO_DE_FALLBACK}'`;

/* ── A DECISÃO ─────────────────────────────────────────────────────────────── */

function estadoBase(item: ItemDeProntidao, medida: Medida | undefined): EstadoDoItem {
  // Medida que a rota não reportou é medida que não existe. O desfecho seguro é
  // `nao_medido` — o inseguro seria o item sumir da lista ou nascer pronto, que
  // é como um painel perde um bloqueio inteiro sem nenhum erro aparecer.
  if (!medida || medida.valor === null) return "nao_medido";
  return medida.valor >= item.minimoParaLigar ? "pronto" : "bloqueia";
}

const MEDIDA_AUSENTE: Medida = {
  valor: null,
  fonte: "codigo",
  comoFoiMedido: "medida não reportada pela rota",
  motivoSemMedida:
    "A rota não enviou esta medida. Não é zero e não é pronto: é um item que ninguém mediu.",
};

/**
 * Avalia o catálogo inteiro contra as medidas de agora.
 *
 * ── Por que dois passes, e por que o segundo lê o estado BASE ──────────────
 *
 * O primeiro passe decide cada item isolado. O segundo rebaixa `bloqueia` para
 * `consequencia` quando um antecedente não está pronto — e consulta os estados
 * do PRIMEIRO passe, nunca os do segundo.
 *
 * Isso mata dois problemas de uma vez: não há ordem de avaliação para acertar,
 * e não há ciclo possível. Consequência de consequência não encadeia, e isso é
 * intencional: um item que depende de um sintoma tem a dependência declarada
 * errada, e prefiro que ele apareça como causa — visível e questionável — a
 * desaparecer atrás de dois níveis de "não é comigo".
 */
export function avaliarProntidaoParaLigar(
  medidas: Record<string, Medida>,
  catalogo: ItemDeProntidao[] = CATALOGO_DE_PRONTIDAO,
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

    // A frase recebe TÍTULOS, não ids. Um id (`consentimento_legivel`) é nome de
    // chave, e o dono não deveria ter de traduzi-lo para saber o que está
    // esperando. `bloqueadoPor` continua com os ids, porque quem consome o JSON
    // precisa da chave estável.
    const titulos = bloqueadoPor.map(
      (antecedente) => catalogo.find((outro) => outro.id === antecedente)?.titulo ?? antecedente,
    );

    return { ...item, estado, medida, bloqueadoPor, frase: fraseDoItem(item, estado, medida, titulos) };
  });
}

function fraseDoItem(
  item: ItemDeProntidao,
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
  if (estado === "pronto") return `${item.titulo}: pronto — ${contagem} (${medida.comoFoiMedido}).`;
  if (estado === "consequencia") {
    return (
      `${item.titulo}: ${contagem} — e este zero é consequência de ${bloqueadoPor.join(", ")}. ` +
      "Não é uma tarefa própria."
    );
  }
  return (
    `${item.titulo}: BLOQUEIA com ${contagem} (${medida.comoFoiMedido}). ` +
    `Resolve: ${QUEM_RESOLVE[item.quemResolve]}.`
  );
}

/* ── O VEREDITO GERAL ──────────────────────────────────────────────────────── */

export type EstadoGeral = "sem_leitura" | "bloqueada" | "incerta" | "pronta";

export const EXPLICACAO_DO_GERAL: Record<EstadoGeral, string> = {
  sem_leitura:
    "Nenhum item pôde ser medido. A tela não está dizendo que a IA está parada — está " +
    "dizendo que não conseguiu olhar. São coisas diferentes.",
  bloqueada: "Há causa medida impedindo a IA de operar, e cada uma tem dono nomeado.",
  incerta:
    "Nenhum bloqueio medido, mas há item que não foi lido. Não dá para dizer pronta com " +
    "parte da lista no escuro — 'não sei' não vira 'sim'.",
  pronta: "Todo item do catálogo foi medido e é suficiente.",
};

export type VereditoDeProntidao = {
  estado: EstadoGeral;
  itens: VereditoDoItem[];
  bloqueios: number;
  naoMedidos: number;
  consequencias: number;
  prontos: number;
  /** Quantas CAUSAS cada cadeira tem na mão. Sintoma não entra na conta de ninguém. */
  porQuemResolve: Record<QuemResolve, number>;
  /** A primeira causa na ordem em que o motor tropeça. `null` quando não há causa. */
  primeiroPasso: VereditoDoItem | null;
  /** O que continua possível hoje. Nunca vazio enquanto houver bloqueio. */
  oQueDaParaFazerHoje: string[];
  frase: string;
};

export function resumirProntidaoParaLigar(
  medidas: Record<string, Medida>,
  catalogo: ItemDeProntidao[] = CATALOGO_DE_PRONTIDAO,
): VereditoDeProntidao {
  const itens = avaliarProntidaoParaLigar(medidas, catalogo);
  const conta = (estado: EstadoDoItem) => itens.filter((item) => item.estado === estado).length;

  const bloqueios = conta("bloqueia");
  const naoMedidos = conta("nao_medido");
  const consequencias = conta("consequencia");
  const prontos = conta("pronto");

  const porQuemResolve: Record<QuemResolve, number> = { dono: 0, operacao: 0, servidor: 0, codigo: 0 };
  // Só CAUSA entra. Somar sintoma faria a fila do dono parecer maior do que é, e
  // uma fila inflada é uma fila que ele para de acreditar.
  for (const item of itens) if (item.estado === "bloqueia") porQuemResolve[item.quemResolve] += 1;

  // A precedência. `sem_leitura` vem antes de tudo porque, sem nenhuma leitura,
  // qualquer outra palavra seria invenção. `bloqueada` vem antes de `incerta`
  // porque bloqueio medido é acionável e não pode esperar a parte não lida.
  // `incerta` existe para `pronta` nunca sair com item no escuro — é a mesma
  // recusa que `estado-da-prontidao.ts` já faz com `unknown`.
  const estado: EstadoGeral =
    naoMedidos === itens.length && itens.length > 0
      ? "sem_leitura"
      : bloqueios > 0
        ? "bloqueada"
        : naoMedidos > 0
          ? "incerta"
          : "pronta";

  const primeiroPasso = itens.find((item) => item.estado === "bloqueia") ?? null;

  // Duas frases idênticas viram uma. Não é enfeite: repetir "dá para rodar em
  // sombra" cinco vezes ensina a pular a lista inteira.
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
    return "Não consegui medir nenhum item. Não estou dizendo que falta tudo — estou dizendo que não li nada.";
  }
  if (dados.estado === "pronta") {
    return `Os ${dados.prontos} itens foram medidos e nenhum bloqueia. A IA pode operar.`;
  }
  if (dados.estado === "incerta") {
    return (
      `Nenhum bloqueio medido, e ${dados.naoMedidos} item(ns) não pôde(puderam) ser lido(s). ` +
      "Não dá para chamar isso de pronta."
    );
  }
  const partes = [`${dados.bloqueios} bloqueio(s) medido(s)`];
  if (dados.consequencias) partes.push(`${dados.consequencias} zero(s) que são consequência deles`);
  if (dados.prontos) partes.push(`${dados.prontos} item(ns) já pronto(s)`);
  if (dados.naoMedidos) partes.push(`${dados.naoMedidos} não lido(s)`);
  const primeiro = dados.primeiroPasso
    ? ` O primeiro é "${dados.primeiroPasso.titulo}" — resolve ${QUEM_RESOLVE[dados.primeiroPasso.quemResolve]}.`
    : "";
  return `A IA não opera: ${partes.join(", ")}.${primeiro}`;
}
