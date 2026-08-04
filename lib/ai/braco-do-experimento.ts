/**
 * O BRAÇO DO EXPERIMENTO — o sorteio CEGO que a comparação IA × humano exige.
 *
 * ── O que estava medido em 02/08/2026, no banco de produção ─────────────────
 *
 *     ai_sales_journeys ......... 0 linhas
 *     nightly_broker_handoffs ... 0 linhas
 *     message_templates ......... 0 linhas de QUALQUER status
 *
 * O zero das duas primeiras é honesto e é CONSEQUÊNCIA: o único escritor de
 * `ai_sales_journeys` no repositório é `app/api/v2/ai/nightly-sales/route.ts`,
 * e ele nasce depois de duas portas que não são dele:
 *
 *   1. `WHATSAPP_NIGHTLY_APPROACH_TEMPLATE` ausente → a rota devolve 503 ANTES
 *      de ler uma lead (conferido: a variável não existe em `.env.local`);
 *   2. `message_templates` com `status='approved'` em zero → mesmo com a
 *      variável posta, `evaluateNightlyEligibility` barraria toda lead com
 *      `approved_template_missing`.
 *
 * Então não é "construído e nunca ligado": é ESCRITOR ACOPLADO AO ENVIO. A
 * jornada — que é a unidade do experimento — só existia como efeito colateral
 * de uma mensagem que sai. Enquanto o dono não aprovar um template na Meta, o
 * experimento não pode nem começar a acumular caso.
 *
 * ── O que este módulo desacopla ─────────────────────────────────────────────
 *
 * O braço (`ia` ou `humano`) NÃO depende de template, de número, nem de
 * aprovação. Ele é uma função pura do id da lead. Sorteá-lo e gravá-lo é o
 * degrau 1 de `docs/design/ATENDIMENTO_AUTONOMO_MODELO.md` — modo sombra: a IA
 * prepara e NADA sai.
 *
 * ── Por que CEGO, e por que DETERMINÍSTICO (§3 do desenho) ──────────────────
 *
 * Cego: se o gestor escolher quais leads vão para a IA, ele manda o que parece
 * frio e guarda o quente para a equipe. A comparação passa a medir a triagem
 * dele. Esse modo de falhar não dá erro — dá um resultado bonito e falso.
 *
 * Determinístico: a mesma lead cai sempre no mesmo braço. Reprocessar não a
 * move, e o braço é auditável depois só com o id e a semente.
 *
 * A consequência boa disso é que o braço não é ATRIBUÍDO, é DERIVADO. Gravá-lo
 * é cache, não decisão — e por isso abrir a jornada de uma lead antiga não é
 * "rotular depois do fato": o valor sempre foi esse. O que separa o que pode
 * entrar na comparação é a COORTE, abaixo.
 *
 * Módulo PURO: sem banco, sem rede, sem `server-only`. Quem executa é o
 * chamador; quem grava é `lib/ai/jornada-em-sombra.ts`.
 */

/* Import RELATIVO com extensão, como `lib/crm/redistribuicao-em-sombra.ts`: os
   módulos puros deste repositório rodam sob `node --test`, que não conhece o
   alias `@/`. O vocabulário de status é lido de onde ele já é canônico — uma
   segunda lista de "o que é ganho" é a classe de defeito que este repositório
   mais pagou. */
import { canonicalLeadStatus } from "../compat/legacy-v2.ts";

export const BRACOS = ["ia", "humano"] as const;
export type Braco = (typeof BRACOS)[number];

export const FAIXAS = ["fora_do_expediente", "expediente_lead_nova", "negociacao_aberta"] as const;
export type Faixa = (typeof FAIXAS)[number];

export const COORTES = ["entrada", "acervo"] as const;
export type Coorte = (typeof COORTES)[number];

/**
 * O TETO. Declarado aqui em texto e cobrado pelo banco: a coluna
 * `maximum_automated_stage` de `ai_sales_journeys` tem CHECK de igualdade com
 * `'qualification'`. Proposta, condição comercial e preço são humanos.
 */
export const TETO_DA_IA = "qualification";

/** As etapas que a jornada pode ocupar sem passar do teto. Em ordem. */
export const ETAPAS_ATE_O_TETO = ["approach", "discovery", "qualification"] as const;

/**
 * ESTADOS TERMINAIS — lead que já acabou não entra em jornada nenhuma.
 *
 * `comprou_outro` e `arquivado` entram junto de ganho/perdido porque a pergunta
 * é a mesma: existe atendimento pela frente? Não existe. Deixá-los de fora faria
 * a IA preparar abordagem para quem já comprou de um concorrente — o pior
 * cartão de visita possível se um dia a sombra for desligada.
 */
export const STATUS_TERMINAIS = ["ganho", "perdido", "comprou_outro", "arquivado"] as const;

/** Fim do expediente comercial. §1 do desenho mede a demanda noturna em 19h–7h59. */
export const HORA_FIM_DO_EXPEDIENTE = 19;
/** Início do expediente. */
export const HORA_INICIO_DO_EXPEDIENTE = 8;

export const FUSO_DA_OPERACAO = "America/Sao_Paulo";

/* ── O SORTEIO ─────────────────────────────────────────────────────────────── */

/**
 * FNV-1a de 32 bits. Escolhido por ser reproduzível em qualquer linguagem em
 * dez linhas: o braço precisa poder ser CONFERIDO fora deste código — em SQL,
 * numa planilha, por quem duvidar do resultado. Um hash criptográfico daria a
 * mesma distribuição e tiraria essa auditabilidade.
 *
 * `Math.imul` e `>>> 0` existem porque a multiplicação de 32 bits em JavaScript
 * estoura o inteiro seguro e passa a arredondar: sem eles, o hash diverge do de
 * qualquer outra implementação e o braço deixa de ser conferível.
 */
export function digestaoFnv1a(texto: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * O BILHETE da lead: 0 a 99, estável para sempre.
 *
 * A semente entra na frente do id para que trocar de semente (recomeçar o
 * experimento) reembaralhe a base inteira. Sem semente, o único experimento
 * possível seria o primeiro.
 */
export function bilheteDoSorteio(leadId: string, semente: string): number {
  return digestaoFnv1a(`${String(semente)}:${String(leadId).trim().toLowerCase()}`) % 100;
}

/**
 * O PERCENTUAL, saneado — e a única direção segura de falhar é ZERO.
 *
 * Valor ilegível (arquivo corrompido, campo ausente, texto no lugar de número)
 * NÃO pode mandar cliente para a IA. Zero é também o botão de parada do §5 do
 * desenho: o diretor zera a fatia e o efeito é imediato, sem deploy.
 */
export function percentualDeclarado(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return 0;
  return Math.min(100, Math.max(0, Math.trunc(valor)));
}

/**
 * O SORTEIO. `bilhete < percentual` — nada mais.
 *
 * Com percentual 0 nenhum bilhete passa (o mínimo é 0 e a comparação é
 * estrita); com 100 todos passam (o máximo é 99). Os dois extremos caem do
 * mesmo predicado, de propósito: um `if` a mais para cada extremo seria um ramo
 * que nenhum teste conseguiria distinguir do comportamento normal.
 */
export function sortearBraco(leadId: string, semente: string, percentualIa: unknown): Braco {
  return bilheteDoSorteio(leadId, semente) < percentualDeclarado(percentualIa) ? "ia" : "humano";
}

/* ── A FAIXA (§3 do desenho: a fatia é por FAIXA, não global) ──────────────── */

/** A hora do relógio da operação, ou `null` quando a data não é legível. */
export function horaDaOperacao(instante: string | null | undefined): number | null {
  if (!instante) return null;
  const data = new Date(instante);
  if (Number.isNaN(data.getTime())) return null;
  const hora = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: FUSO_DA_OPERACAO, hour: "2-digit", hourCycle: "h23" }).format(data),
  );
  return Number.isFinite(hora) ? hora : null;
}

export function ehStatusTerminal(status: unknown): boolean {
  return (STATUS_TERMINAIS as readonly string[]).includes(canonicalLeadStatus(status));
}

/** A lead já passou do teto da IA? Aí a faixa é 0% por construção. */
export function passouDoTetoDaIa(status: unknown): boolean {
  const canonico = canonicalLeadStatus(status);
  if (ehStatusTerminal(canonico)) return true;
  return !["novo", "contato", "qualificacao"].includes(canonico);
}

/**
 * A faixa da lead.
 *
 * ── Data ilegível NUNCA compra a faixa de 100% ────────────────────────────
 *
 * Cai em `expediente_lead_nova`. A faixa noturna é a de 100%, e deixar que a
 * ausência de dado compre a fatia inteira seria transformar defeito de gravação
 * em autorização.
 *
 * ── O ACERVO NÃO TEM HORA DE CHEGADA, E ISSO ESTÁ MEDIDO ──────────────────
 *
 * A faixa noturna é COBERTURA: "esta lead chegou quando não havia ninguém para
 * responder". Isso só faz sentido para quem chegou de verdade agora.
 *
 * Ensaio a seco contra a produção em 02/08/2026, sobre as 51 leads elegíveis:
 * 37 caíram em `fora_do_expediente`, e 22 delas têm `created_at` idêntico —
 * `2026-07-28T22:06:08.208Z`, que é 19h06 em São Paulo. Não é demanda noturna:
 * é o instante em que uma PLANILHA foi importada. O próprio desenho já exclui a
 * hora 19 da medição de demanda por causa desse pico.
 *
 * Sem esta guarda, uma importação rodada às 19h05 mandaria a base legada
 * inteira para o braço `ia` no dia em que o envio for ligado — 100% comprado
 * por um carimbo de importação. O sorteio deixaria de ser cego: ele estaria
 * seguindo o horário de quem clicou em "importar".
 *
 * Lead de acervo cai na faixa do expediente, que é a conservadora e a única com
 * grupo de controle.
 */
export function faixaDaEntrada(input: { status: unknown; entradaEm: string | null | undefined; coorte: Coorte }): Faixa {
  if (passouDoTetoDaIa(input.status)) return "negociacao_aberta";
  if (input.coorte === "acervo") return "expediente_lead_nova";
  const hora = horaDaOperacao(input.entradaEm);
  if (hora === null) return "expediente_lead_nova";
  return hora >= HORA_FIM_DO_EXPEDIENTE || hora < HORA_INICIO_DO_EXPEDIENTE
    ? "fora_do_expediente"
    : "expediente_lead_nova";
}

/**
 * A COORTE — e é ela que impede o experimento de mentir.
 *
 * `entrada`: a lead chegou DEPOIS que o experimento começou. O relógio do
 * primeiro toque dela começou a correr com o sorteio já valendo, então ela pode
 * entrar na comparação de §4.
 *
 * `acervo`: a lead já estava na base. O braço dela é o mesmo (é função do id),
 * e abrir a jornada dela é útil — a sombra prepara —, mas o tempo até o primeiro
 * toque dela já vinha correndo sob tratamento humano. Contá-la na comparação
 * seria inventar um comparativo.
 *
 * Fronteira ilegível ou data ilegível caem em `acervo`: na dúvida, FORA da
 * comparação. Deixar entrar por omissão contamina o único número que o volume
 * desta base sustenta.
 */
export function coorteDaLead(entradaEm: string | null | undefined, iniciadoEm: string | null | undefined): Coorte {
  if (!entradaEm || !iniciadoEm) return "acervo";
  const entrada = Date.parse(entradaEm);
  const inicio = Date.parse(iniciadoEm);
  if (!Number.isFinite(entrada) || !Number.isFinite(inicio)) return "acervo";
  return entrada >= inicio ? "entrada" : "acervo";
}

/* ── A ABERTURA DA JORNADA ─────────────────────────────────────────────────── */

export type LeadNaPorta = {
  id: string | null | undefined;
  organizacaoId: string | null | undefined;
  corretorId: string | null | undefined;
  status: unknown;
  entradaEm: string | null | undefined;
};

export type ImpedimentoDeAbertura = "sem_id" | "sem_organizacao" | "sem_corretor" | "lead_terminal";

export type Abertura = {
  pode: boolean;
  impedimento: ImpedimentoDeAbertura | null;
  motivo: string;
  /** Quem destrava. `null` quando NÃO há o que destravar — a recusa está certa. */
  quemResolve: string | null;
};

const texto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

/**
 * Pode abrir jornada para esta lead?
 *
 * Cada recusa diz o MOTIVO e QUEM resolve. Recusa sem dono vira número na tela
 * que ninguém consegue transformar em ação — e é assim que zero vira "saúde".
 */
export function avaliarAbertura(lead: LeadNaPorta): Abertura {
  if (!texto(lead.id)) {
    return {
      pode: false,
      impedimento: "sem_id",
      motivo: "Lead sem identificador: o braço é sorteado sobre o id e sem ele o sorteio não é reproduzível.",
      quemResolve: "time de produto — a origem que criou esta lead não devolveu o id da escrita.",
    };
  }
  if (!texto(lead.organizacaoId)) {
    return {
      pode: false,
      impedimento: "sem_organizacao",
      motivo: "Lead sem organização: `ai_sales_journeys.organization_id` é NOT NULL e a cerca de leitura é por organização.",
      quemResolve: "time de produto — lead sem organização não deveria existir.",
    };
  }
  if (!texto(lead.corretorId)) {
    return {
      pode: false,
      impedimento: "sem_corretor",
      motivo: "Lead sem corretor dono: `ai_sales_journeys.broker_id` é NOT NULL, e a regra de uma lead por corretor é o que torna a comparação atribuível.",
      quemResolve: "gestor comercial — distribua a lead antes; a IA não escolhe dono.",
    };
  }
  if (ehStatusTerminal(lead.status)) {
    return {
      pode: false,
      impedimento: "lead_terminal",
      motivo: `Lead em estado terminal (${canonicalLeadStatus(lead.status)}): não há atendimento pela frente para preparar.`,
      quemResolve: null,
    };
  }
  return {
    pode: true,
    impedimento: null,
    motivo: "Lead viva, com dono e com organização: a jornada pode nascer em sombra.",
    quemResolve: null,
  };
}

export type PoliticaDoExperimento = {
  semente: string;
  percentualPorFaixa: Record<Faixa, number>;
  /** Fronteira entre `entrada` e `acervo`. ISO, ou `null` quando não declarada. */
  iniciadoEm: string | null;
};

/**
 * A SEMENTE de recuo. Só entra quando a declarada não é legível — e junto dela
 * a política inteira já caiu para 0%, então ela nunca manda ninguém para a IA.
 * Existe para que o braço continue REPRODUTÍVEL mesmo com o arquivo quebrado:
 * sorteio sem semente estável não é sorteio, é ruído.
 */
export const SEMENTE_DE_RECUO = "atlas-experimento-sem-declaracao";

/**
 * A POLÍTICA, lida de um valor qualquer — e SEMPRE fechada quando algo falta.
 *
 * Esta função existe separada da leitura do arquivo pela mesma razão que
 * `ligadoDadoValor` em `modo-sombra.ts`: o que precisa de teste é a decisão
 * diante de um valor ausente/torto, não o `readFileSync`. Arquivo apagado,
 * campo faltando, texto no lugar de número — tudo cai em 0% para as três
 * faixas, e nenhuma lead vai para o braço `ia`.
 *
 * Falhar ABERTO aqui seria mandar cliente para a IA porque alguém errou uma
 * vírgula num JSON.
 */
export function politicaDeclarada(declaracao: unknown): PoliticaDoExperimento {
  const raiz = declaracao && typeof declaracao === "object" ? (declaracao as Record<string, unknown>) : {};
  const fatia = raiz.fatiaDaIa && typeof raiz.fatiaDaIa === "object" ? (raiz.fatiaDaIa as Record<string, unknown>) : {};
  const semente = texto(raiz.semente) || SEMENTE_DE_RECUO;
  const iniciadoEm = texto(raiz.iniciadoEm);
  const percentualPorFaixa = {} as Record<Faixa, number>;
  for (const faixa of FAIXAS) percentualPorFaixa[faixa] = percentualDeclarado(fatia[faixa]);
  return {
    semente,
    percentualPorFaixa,
    iniciadoEm: iniciadoEm && Number.isFinite(Date.parse(iniciadoEm)) ? iniciadoEm : null,
  };
}

export type PlanoDeJornada = {
  abertura: Abertura;
  faixa: Faixa;
  percentualDaFaixa: number;
  braco: Braco;
  bilhete: number;
  coorte: Coorte;
  /** A etapa em que a jornada nasce. Nunca passa de `TETO_DA_IA`. */
  etapa: (typeof ETAPAS_ATE_O_TETO)[number];
  tetoDaIa: string;
};

/**
 * O PLANO da jornada — tudo o que a linha vai carregar, decidido sem tocar em
 * banco algum.
 *
 * O braço é calculado MESMO quando a abertura é recusada, e isso é intencional:
 * ele é função do id, existe independentemente de haver linha gravada, e poder
 * exibi-lo numa recusa é o que permite auditar "esta lead teria ido para qual
 * lado" sem precisar criar a jornada para descobrir.
 */
export function planejarJornada(lead: LeadNaPorta, politica: PoliticaDoExperimento): PlanoDeJornada {
  // A COORTE VEM PRIMEIRO porque ela decide se a hora de chegada vale alguma
  // coisa: em lead de acervo, `created_at` pode ser o instante da importação, e
  // não o da chegada. Ver `faixaDaEntrada`.
  const coorte = coorteDaLead(lead.entradaEm, politica.iniciadoEm);
  const faixa = faixaDaEntrada({ status: lead.status, entradaEm: lead.entradaEm, coorte });
  const percentualDaFaixa = percentualDeclarado(politica.percentualPorFaixa?.[faixa]);
  const id = texto(lead.id);
  return {
    abertura: avaliarAbertura(lead),
    faixa,
    percentualDaFaixa,
    braco: sortearBraco(id, politica.semente, percentualDaFaixa),
    bilhete: bilheteDoSorteio(id, politica.semente),
    coorte,
    etapa: ETAPAS_ATE_O_TETO[0],
    tetoDaIa: TETO_DA_IA,
  };
}

/* ── A LINHA QUE VAI PARA O BANCO ──────────────────────────────────────────
   Construída AQUI, e não dentro do módulo que escreve, por uma razão prática:
   `lib/ai/jornada-em-sombra.ts` importa `server-only` e `@/lib/supabase/admin`,
   e nenhum contrato consegue carregá-lo. As três propriedades que mantêm esta
   feature honesta — não enviou, não vai para a entrega matinal, não passa do
   teto — ficariam vigiadas só por `grep` no fonte, que é a asserção que este
   repositório já provou ser frágil (ela sobrevive à mutação e quebra no
   primeiro reflow). Aqui elas são EXECUTADAS pelo contrato. */

/** Uma jornada em sombra não pede consentimento porque não envia nada. */
export const CONSENTIMENTO_DA_SOMBRA = "modo_sombra:sem_envio";

export type LinhaDeJornada = {
  organization_id: string;
  lead_id: string;
  broker_id: string;
  development_id: string | null;
  stage: string;
  status: string;
  consent_basis: string;
  context_snapshot: Record<string, unknown>;
  policy_version: number;
  maximum_automated_stage: string;
  outbound_count: number;
  morning_handoff_required: boolean;
};

/**
 * A linha da jornada em sombra.
 *
 * ── As três declarações que impedem esta feature de mentir ─────────────────
 *
 * `outbound_count: 0` — é por este campo que `/api/ia-autonoma-estado` separa
 * jornada que AGIU de jornada preparada. Sem o zero, a primeira lead que
 * entrasse viraria a postura do painel para "executando" e a frase «executei N
 * ações, todas com aprovação nomeada» sairia sobre um banco em que nada saiu.
 *
 * `morning_handoff_required: false` e `status: 'eligible'` — a entrega matinal
 * (`/api/v2/ai/nightly-handoff`) filtra por esses dois campos. Nada foi enviado
 * ao cliente, então não existe atendimento noturno para o corretor "assumir" de
 * manhã. Deixar a jornada em sombra cair lá encheria a tela dele de cartões que
 * prometem uma conversa que nunca houve.
 *
 * `maximum_automated_stage` — o teto, também cobrado por CHECK no banco.
 */
export function linhaDaJornadaEmSombra(input: {
  organizacaoId: string;
  leadId: string;
  corretorId: string;
  empreendimentoId?: string | null;
  plano: PlanoDeJornada;
  semente: string;
  nome?: string | null;
  origem?: string | null;
}): LinhaDeJornada {
  return {
    organization_id: input.organizacaoId,
    lead_id: input.leadId,
    broker_id: input.corretorId,
    development_id: input.empreendimentoId ?? null,
    stage: input.plano.etapa,
    status: "eligible",
    consent_basis: CONSENTIMENTO_DA_SOMBRA,
    context_snapshot: {
      modo: "sombra",
      /* O braço vive no retrato porque a tabela não tem coluna para ele. A
         migration que a cria está ESCRITA e NÃO APLICADA
         (supabase/migrations/20260802210000_braco_do_experimento.sql) — aplicar
         em produção é decisão do dono. Gravar no jsonb funciona HOJE, contra o
         banco que existe. */
      braco: input.plano.braco,
      faixa: input.plano.faixa,
      coorte: input.plano.coorte,
      bilhete: input.plano.bilhete,
      percentualDaFaixa: input.plano.percentualDaFaixa,
      semente: input.semente,
      tetoDaIa: TETO_DA_IA,
      envio: "retido_pelo_modo_sombra",
      lead: { nome: input.nome ?? null, origem: input.origem ?? null },
    },
    policy_version: 1,
    maximum_automated_stage: TETO_DA_IA,
    outbound_count: 0,
    morning_handoff_required: false,
  };
}

/* ── O ESTADO DO EXPERIMENTO — a frase que a tela NÃO pode inventar ───────── */

export type BloqueioDoExperimento = { id: string; motivo: string; quemResolve: string };

export type EstadoDoExperimento = {
  /** Verdade só quando o braço `ia` PRODUZ tratamento diferente do `humano`. */
  ativo: boolean;
  /** Degrau de `docs/design/ATENDIMENTO_AUTONOMO_MODELO.md` §2. */
  degrau: 1 | 2;
  bloqueios: BloqueioDoExperimento[];
  frase: string;
};

/**
 * O EXPERIMENTO ESTÁ RODANDO?
 *
 * ── A mentira que esta função existe para impedir ──────────────────────────
 *
 * Assim que `ai_sales_journeys` sair do zero, a leitura natural de qualquer
 * painel é "o experimento começou". Ele NÃO começou. Em modo sombra o braço é
 * sorteado, gravado e auditável — e as duas pontas recebem exatamente o mesmo
 * tratamento, porque nada sai. Um painel que mostrasse "IA × humano" com esses
 * dados estaria comparando duas metades do mesmo grupo de controle.
 *
 * Enquanto houver bloqueio, a resposta honesta é: degrau 1, sombra, e o nome de
 * quem destrava cada item.
 */
export function estadoDoExperimento(input: {
  sombraRetemEnvio: boolean;
  /** Templates aprovados na Meta. `null` = não consegui contar (≠ zero). */
  templatesAprovados: number | null;
  /** Número oficial e token configurados. */
  envioConfigurado: boolean;
}): EstadoDoExperimento {
  const bloqueios: BloqueioDoExperimento[] = [];

  if (input.sombraRetemEnvio) {
    bloqueios.push({
      id: "modo_sombra",
      motivo:
        "O modo sombra retém `enviar_mensagem`: a IA prepara a abordagem, grava o braço e NÃO envia. Os dois braços recebem o mesmo tratamento — não há experimento, há preparação.",
      quemResolve:
        "o dono — tirar `enviar_mensagem` de `modoSombra.acoesRetidas` em config/orcamento-e-autonomia-da-ia.json, depois de olhar a comparação recomendação × decisão × resultado.",
    });
  }
  if (input.templatesAprovados === null) {
    bloqueios.push({
      id: "templates_nao_medidos",
      motivo: "Não consegui contar os templates aprovados. Não estou dizendo que não há — estou dizendo que não sei.",
      quemResolve: "time de banco — a leitura de `message_templates` falhou.",
    });
  } else if (input.templatesAprovados === 0) {
    bloqueios.push({
      id: "sem_template",
      motivo:
        "Nenhum template aprovado em `message_templates`. Sem template oficial a IA não fala com ninguém, e nenhum degrau acima de sombra é alcançável.",
      quemResolve: "o dono — submeter e aprovar o template na conta oficial da Meta.",
    });
  }
  if (!input.envioConfigurado) {
    bloqueios.push({
      id: "sem_canal",
      motivo: "Número oficial e token do WhatsApp não estão configurados: não existe por onde sair.",
      quemResolve: "o dono — WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN no ambiente.",
    });
  }

  const ativo = bloqueios.length === 0;
  return {
    ativo,
    degrau: ativo ? 2 : 1,
    bloqueios,
    frase: ativo
      ? "Braço sorteado e envio liberado: a partir daqui os dois braços recebem tratamentos diferentes e a comparação começa a valer."
      : `Braço sorteado, nada enviado. ${bloqueios.length} bloqueio(s) mantêm a IA no degrau 1 — a preparação acumula, a comparação ainda não.`,
  };
}
