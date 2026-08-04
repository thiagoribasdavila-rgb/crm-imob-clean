/**
 * A CAUSA DE CADA CARTA MORTA — e se ela ainda está de pé.
 *
 * ── O QUE FOI MEDIDO EM 02/08/2026, no banco vivo ───────────────────────────
 *
 *     dead_letter_events ......... 12 linhas, ZERO resolvidas
 *     mais antiga ................ 31/07 01:50 (três dias parada)
 *     resolved / resolved_at / resolved_by ... as três colunas EXISTEM
 *
 * O desenho previa resolução e nenhuma linha foi resolvida. A rota que resolve
 * (`/api/v3/dlq/retry`) existia desde 16/07 e NINGUÉM a chamava: varrido o
 * repositório inteiro, as duas únicas menções são um portão que lê o arquivo
 * como texto e um comentário. Zero telas. A última linha de defesa da entrega
 * não tinha porta.
 *
 * ── POR QUE ESTE MÓDULO É PURO, E POR QUE ISSO IMPORTA ──────────────────────
 *
 * Três consumidores decidem sobre a MESMA linha: a tela (mostra o botão), a
 * rota de reprocesso (deixa passar) e o vigia (conta o que está preso). Se cada
 * um escrever seu próprio "dá para reprocessar?", eles divergem — é a classe de
 * defeito que este repositório já pagou (RPC e fallback que discordaram da
 * chave). Aqui a regra é escrita UMA vez, sem I/O, e os três a chamam.
 *
 * ── A TRAVA, QUE É O CORAÇÃO DISTO ──────────────────────────────────────────
 *
 * Reprocessar evento cuja causa continua de pé só o mata de novo: ele volta
 * para a fila, falha as mesmas 5 tentativas e cai aqui outra vez — com a idade
 * zerada. O operador acha que agiu, o contador volta a subir, e a carta morta
 * fica MAIS velha por dentro do que aparenta por fora.
 *
 * E a trava não pode conferir só o erro GRAVADO. O erro gravado é a primeira
 * porta que bateu, não a única que existe. Para `meta.conversion.send` o
 * despachante (app/api/v2/outbox/process/route.ts:895-925) atravessa OITO
 * portas antes de falar com a Meta, e o token é a QUINTA. Conferir só o token e
 * reenfileirar é entregar o evento para morrer na sexta.
 *
 * Por isso o veredito recebe as precondições MEDIDAS e exige todas.
 *
 * ── A REGRA MAIS IMPORTANTE: NÃO MEDIDO NÃO É ATENDIDO ──────────────────────
 *
 * `atendida: null` significa "não consegui medir". Ele NUNCA vira verde. Uma
 * precondição ilegível bloqueia o botão exatamente como uma reprovada, e a tela
 * diz que não foi medida. Falha de leitura desenhada como saúde é o defeito que
 * este produto mais paga; seria grotesco cometê-lo no módulo que existe para
 * impedir que um evento morra duas vezes.
 */

/** O prefixo que as duas provas sintéticas de 31/07 carregam no tópico. */
const PREFIXO_DA_PROVA = /^prova\.sintetica\./;

export type FamiliaDaCausa =
  | "credencial_ausente"
  | "prova_sintetica"
  | "topico_desconhecido"
  | "sem_vinculo_outbox"
  | "nao_reconhecida";

/** O que precisa ser verdade para o evento ter chance na volta. */
export type Precondicao = {
  chave: string;
  rotulo: string;
  /** `null` é "não consegui medir" — e não conta como atendida. */
  atendida: boolean | null;
  detalhe?: string;
};

export type LinhaDaCartaMorta = {
  id: string;
  topic: string;
  errorMessage: string;
  outboxEventId: string | null;
  attempts: number;
  createdAt: string;
};

export type Veredito = {
  familia: FamiliaDaCausa;
  /** Frase que o operador lê. Nunca o texto cru do erro. */
  causaLegivel: string;
  /** `null` = não foi possível atestar. Bloqueia igual a `false`. */
  causaResolvida: boolean | null;
  podeReprocessar: boolean;
  /** Por que o botão está desligado. `null` quando ele está ligado. */
  bloqueio: string | null;
  comoResolver: string;
  /** `lixo_de_teste` sai da contagem que cobra ação humana. */
  contagem: "operacional" | "lixo_de_teste";
  precondicoes: Precondicao[];
};

/**
 * CRITÉRIO DAS PROVAS SINTÉTICAS — declarado, e conferido nos dois lados.
 *
 * Duas das doze linhas são lixo de ensaio: tópicos `prova.sintetica.<epoch>`
 * criados em 31/07 para provar que a carta morta recebia escrita. Elas são
 * reconhecíveis por DUAS marcas conferidas juntas, não por uma:
 *
 *   1. o tópico casa com `prova.sintetica.`;
 *   2. `outbox_event_id` é NULO — não há trabalho real atrás delas.
 *
 * Exigir as duas é o que impede que um tópico de produção que um dia se chame
 * parecido some da contagem. Uma linha com vínculo de outbox NUNCA é prova,
 * por mais sintético que o nome pareça.
 *
 * O QUE ACONTECE COM ELAS: saem da contagem OPERACIONAL (a que cobra ação e a
 * que o vigia vigia) e continuam na contagem TOTAL, visíveis na tela em faixa
 * própria e rotulada. NÃO SÃO APAGADAS — apagar dado de produção para melhorar
 * um número é a fraude que este repositório proíbe, e o total continua 12 para
 * quem contar a tabela na mão.
 */
export function ehProvaSintetica(linha: Pick<LinhaDaCartaMorta, "topic" | "outboxEventId">): boolean {
  return PREFIXO_DA_PROVA.test(linha.topic) && !linha.outboxEventId;
}

/** A família da causa, lida do que a linha registrou. Sem I/O. */
export function familiaDaCausa(linha: LinhaDaCartaMorta): FamiliaDaCausa {
  if (ehProvaSintetica(linha)) return "prova_sintetica";
  if (/META_CONVERSIONS_ACCESS_TOKEN\s+n[ãa]o\s+configurado/i.test(linha.errorMessage)) {
    return "credencial_ausente";
  }
  if (/T[óo]pico\s+n[ãa]o\s+suportado/i.test(linha.errorMessage)) return "topico_desconhecido";
  if (!linha.outboxEventId) return "sem_vinculo_outbox";
  return "nao_reconhecida";
}

/** Idade em horas, para a tela e para o vigia usarem o MESMO relógio. */
export function idadeEmHoras(criadoEm: string, agora: number = Date.now()): number | null {
  const nascimento = new Date(criadoEm).getTime();
  if (!Number.isFinite(nascimento)) return null;
  return Math.max(0, (agora - nascimento) / 3_600_000);
}

export function idadeLegivel(criadoEm: string, agora: number = Date.now()): string {
  const horas = idadeEmHoras(criadoEm, agora);
  // Data ilegível não vira "0 h" — zero de idade é a aparência de recém-chegado,
  // e o que está aqui há três dias não pode se passar por novo.
  if (horas === null) return "idade ilegível";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${Math.round(horas)} h`;
  return `${Math.floor(horas / 24)} dias`;
}

/**
 * O veredito. Recebe as precondições JÁ MEDIDAS pelo chamador — este módulo não
 * lê banco nem ambiente, e é isso que o torna testável sem infraestrutura.
 */
export function vereditoDaCartaMorta(
  linha: LinhaDaCartaMorta,
  precondicoes: Precondicao[] = [],
): Veredito {
  const familia = familiaDaCausa(linha);

  const naoMedidas = precondicoes.filter((p) => p.atendida === null);
  const reprovadas = precondicoes.filter((p) => p.atendida === false);

  if (familia === "prova_sintetica") {
    return {
      familia,
      causaLegivel: "Prova sintética de 31/07 — tópico inexistente, sem trabalho real atrás.",
      causaResolvida: null,
      podeReprocessar: false,
      bloqueio: "Lixo de ensaio: não há entrega a recuperar, reprocessar só a mataria de novo.",
      comoResolver:
        "Nada a fazer. Fica registrada e fora da contagem operacional; apagar dado de produção não está autorizado.",
      contagem: "lixo_de_teste",
      precondicoes,
    };
  }

  if (familia === "topico_desconhecido") {
    return {
      familia,
      causaLegivel: `O despachante da fila não conhece o tópico "${linha.topic}".`,
      causaResolvida: false,
      podeReprocessar: false,
      bloqueio: "Nenhum código atende este tópico: na volta ele falharia na mesma linha.",
      comoResolver:
        "Só um deploy que ensine o tópico ao despachante (app/api/v2/outbox/process) muda este estado.",
      contagem: "operacional",
      precondicoes,
    };
  }

  if (familia === "sem_vinculo_outbox") {
    return {
      familia,
      causaLegivel: "A linha não guarda vínculo com a fila de entrega (outbox).",
      causaResolvida: null,
      podeReprocessar: false,
      bloqueio: "Sem `outbox_event_id` não existe o que reenfileirar.",
      comoResolver: "A entrega precisa ser refeita na origem; esta linha é só o registro do óbito.",
      contagem: "operacional",
      precondicoes,
    };
  }

  if (familia === "nao_reconhecida") {
    return {
      familia,
      // O texto cru vai aqui de propósito: quando o catálogo não reconhece a
      // causa, esconder o erro original deixaria o operador sem NADA.
      causaLegivel: `Causa não catalogada. O que a fila registrou: "${linha.errorMessage}"`,
      causaResolvida: null,
      podeReprocessar: false,
      bloqueio:
        "Ninguém consegue afirmar que a causa caiu. Liberar o botão aqui seria chutar com o evento como aposta.",
      comoResolver:
        "Leia o erro acima, corrija na origem e catalogue a causa em lib/integrations/causa-da-carta-morta.ts.",
      contagem: "operacional",
      precondicoes,
    };
  }

  // credencial_ausente — a família das 10 linhas de 02/08.
  const tokenPresente = precondicoes.find((p) => p.chave === "token_de_conversoes");
  if (!tokenPresente || tokenPresente.atendida === null) {
    return {
      familia,
      causaLegivel: "Envio de conversões parou por falta do token da Meta (META_CONVERSIONS_ACCESS_TOKEN).",
      causaResolvida: null,
      podeReprocessar: false,
      bloqueio: "Não foi possível medir se o token existe agora — e não medido não é resolvido.",
      comoResolver: "Confirme a variável no servidor que atende a fila e recarregue esta tela.",
      contagem: "operacional",
      precondicoes,
    };
  }

  if (tokenPresente.atendida === false) {
    return {
      familia,
      causaLegivel: "Envio de conversões parou por falta do token da Meta (META_CONVERSIONS_ACCESS_TOKEN).",
      causaResolvida: false,
      podeReprocessar: false,
      bloqueio: "O token continua ausente: na volta o evento morre na mesma linha.",
      comoResolver:
        "Defina META_CONVERSIONS_ACCESS_TOKEN no servidor que roda a fila e reinicie o processo. Só depois o botão liga.",
      contagem: "operacional",
      precondicoes,
    };
  }

  // O token voltou. Ainda assim, o evento atravessa outras portas — e o veredito
  // exige TODAS antes de liberar.
  if (naoMedidas.length) {
    return {
      familia,
      causaLegivel: "O token da Meta já está configurado; a conversão pode voltar à fila.",
      causaResolvida: null,
      podeReprocessar: false,
      bloqueio: `Não foi possível medir: ${naoMedidas.map((p) => p.rotulo).join(", ")}.`,
      comoResolver: "Recarregue a tela; se persistir, a leitura destas condições é que está quebrada.",
      contagem: "operacional",
      precondicoes,
    };
  }

  if (reprovadas.length) {
    return {
      familia,
      causaLegivel: "O token da Meta voltou, mas outra porta do envio continua fechada.",
      causaResolvida: false,
      podeReprocessar: false,
      bloqueio: `Ainda impede o envio: ${reprovadas.map((p) => p.rotulo).join(", ")}.`,
      comoResolver:
        "Corrija a condição acima. Enquanto ela estiver de pé, reenfileirar só gasta as 5 tentativas de novo.",
      contagem: "operacional",
      precondicoes,
    };
  }

  return {
    familia,
    causaLegivel: "O token da Meta já está configurado — a causa desta morte caiu.",
    causaResolvida: true,
    podeReprocessar: true,
    bloqueio: null,
    comoResolver:
      "Reprocessar devolve a conversão à fila; o worker do outbox a envia no próximo ciclo (a cada 2 min).",
    contagem: "operacional",
    precondicoes,
  };
}
