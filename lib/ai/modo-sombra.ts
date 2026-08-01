/**
 * MODO SOMBRA (4.8) — a IA prepara e registra; nada sai.
 *
 * ── O que existia, medido em 2026-07-30 ───────────────────────────────────
 *
 * Shadow Mode existia PARCIAL: `lib/meta/marketing/campaign-executor.ts` tem
 * `dryRun` (padrão `true`, linha 506) e emite os payloads resolvidos com ids
 * sintéticos. É bom, e é só para campanha da Meta. Nenhuma outra ação da IA —
 * mandar mensagem, redistribuir lead, mudar condição, apagar registro — tinha
 * sombra alguma. Uma busca por `shadow_mode`/`modoSombra` no repositório não
 * devolvia nada.
 *
 * ── O que o dono pediu, e a parte que costuma ser esquecida ────────────────
 *
 * "A IA analisa, classifica, recomenda, PREPARA e REGISTRA o que faria" — e
 * depois "compara recomendação da IA × decisão humana × resultado".
 *
 * A comparação é a parte que decide se o Shadow Mode serve para algo. Sombra que
 * só acumula registro é um diário que ninguém lê: nunca se sai dela, porque não
 * há evidência para sair. A comparação é o que transforma a sombra em decisão de
 * ligar (ou desligar) o agente.
 *
 * ── Por que o padrão é RETER ──────────────────────────────────────────────
 *
 * `reterPorPadrao()` devolve verdade quando o arquivo de declaração não é
 * legível. Sombra que falha ABERTA é pior que não ter sombra: a ação externa
 * acontece exatamente no dia em que a configuração quebrou, e ninguém liga uma
 * coisa à outra.
 *
 * Módulo PURO. O contrato o EXECUTA.
 */

import fs from "node:fs";
import path from "node:path";
import { avaliarAcaoDeAgente, type AprovacaoRegistrada, type VeredictoDeAutonomia } from "./niveis-de-autonomia.ts";

/** As cinco ações que o dono nomeou em 4.8, e que a sombra retém. */
export const ACOES_RETIDAS_PADRAO = [
  "enviar_mensagem",
  "redistribuir_lead",
  "iniciar_campanha",
  "alterar_condicao_comercial",
  "apagar_registro",
] as const;

export type AcaoRetida = (typeof ACOES_RETIDAS_PADRAO)[number];

type Declaracao = { modoSombra?: { ligado?: unknown; acoesRetidas?: unknown } };

let cache: Declaracao | null | undefined;

function declaracao(): Declaracao | null {
  if (cache !== undefined) return cache;
  try {
    const caminho = path.join(import.meta.dirname, "..", "..", "config", "orcamento-e-autonomia-da-ia.json");
    cache = JSON.parse(fs.readFileSync(caminho, "utf8")) as Declaracao;
  } catch {
    cache = null;
  }
  return cache;
}

export function esquecerSombraEmCache() {
  cache = undefined;
}

/**
 * A SOMBRA ESTÁ LIGADA, dado o valor declarado? Só `false` EXPLÍCITO a desliga.
 *
 * Qualquer outra coisa — arquivo ilegível, campo ausente, `"false"` em texto,
 * `0`, `null` — mantém a sombra. Desligar proteção por acidente de digitação é
 * o modo de falha que este produto não pode ter: seria ação externa disparada
 * porque alguém escreveu a palavra errada num JSON.
 *
 * ── Por que esta função existe separada da leitura do arquivo ──────────────
 *
 * Porque a versão anterior era `declaracao()?.modoSombra?.ligado !== false` numa
 * linha só, e a mutação que a trocava por `=== true` SOBREVIVEU à suíte: com o
 * arquivo real dizendo `ligado: true`, as duas formas devolvem verdade, e a
 * diferença só apareceria no dia em que o arquivo sumisse — exatamente o dia em
 * que ninguém está olhando.
 *
 * Falha fechada que não dá para testar não é falha fechada: é intenção. Aqui o
 * predicado recebe o valor e o contrato exercita as formas de "ausente".
 */
export function ligadoDadoValor(valor: unknown): boolean {
  return valor !== false;
}

export function sombraLigada(): boolean {
  return ligadoDadoValor(declaracao()?.modoSombra?.ligado);
}

export function acoesRetidas(): string[] {
  const lista = declaracao()?.modoSombra?.acoesRetidas;
  if (!Array.isArray(lista) || !lista.length) return [...ACOES_RETIDAS_PADRAO];
  const limpa = lista.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return limpa.length ? limpa : [...ACOES_RETIDAS_PADRAO];
}

export function reterPorPadrao(acao: string): boolean {
  if (!sombraLigada()) return false;
  return acoesRetidas().includes(String(acao || "").trim().toLowerCase());
}

export type RegistroDeSombra = {
  /** O que a IA FARIA. Verbo da mesma lista de `niveis-de-autonomia`. */
  acao: string;
  agente: string;
  /** O payload preparado, pronto para um humano conferir e executar. */
  preparado: Record<string, unknown>;
  /** Por que a IA recomenda isso. Sem justificativa não há o que comparar. */
  recomendacao: string;
  /** Confiança declarada pela IA, se houver. Nunca inventada aqui. */
  confianca: number | null;
  entidade: { tipo: string; id: string } | null;
};

export type ResultadoDeSombra = {
  /** Verdade quando a ação foi retida. É o estado normal em sombra. */
  retido: boolean;
  /** Nunca verdade enquanto `retido` — existe para o registro dizer o óbvio. */
  executado: boolean;
  registro: RegistroDeSombra;
  autonomia: VeredictoDeAutonomia;
  motivo: string;
};

/**
 * PREPARA E REGISTRA — o caminho único por onde uma ação de IA passa.
 *
 * Devolve o que FARIA, sem fazer. Duas razões independentes retêm, e as duas são
 * verificadas: a sombra estar ligada, e a autonomia não autorizar. Bastando uma,
 * retém — porque autonomia suficiente com sombra ligada ainda é sombra, e sombra
 * desligada com autonomia insuficiente ainda é falta de autorização.
 */
export function prepararEmSombra(input: {
  agente: string;
  acao: string;
  preparado: Record<string, unknown>;
  recomendacao: string;
  confianca?: number | null;
  entidade?: { tipo: string; id: string } | null;
  aprovacao?: AprovacaoRegistrada | null;
}): ResultadoDeSombra {
  const autonomia = avaliarAcaoDeAgente({ agente: input.agente, acao: input.acao, aprovacao: input.aprovacao });
  const registro: RegistroDeSombra = {
    acao: input.acao,
    agente: input.agente,
    preparado: input.preparado,
    recomendacao: input.recomendacao,
    // Confiança não é inventada: sem valor declarado, é null e o relatório diz
    // "não medida" em vez de exibir um número plausível.
    confianca: typeof input.confianca === "number" && Number.isFinite(input.confianca) ? input.confianca : null,
    entidade: input.entidade ?? null,
  };

  const sombra = reterPorPadrao(input.acao);

  if (sombra) {
    return {
      retido: true,
      executado: false,
      registro,
      autonomia,
      motivo: `Modo sombra ligado: "${input.acao}" foi PREPARADA e REGISTRADA, não executada. Um humano confere e executa. Para sair da sombra, olhe a comparação recomendação × decisão × resultado deste agente.`,
    };
  }

  if (!autonomia.permitido) {
    return { retido: true, executado: false, registro, autonomia, motivo: autonomia.motivo };
  }

  // Sombra desligada E autonomia suficiente. Este módulo não executa nada: quem
  // chamou recebe a autorização e executa. Manter a execução fora daqui é o que
  // impede "modo sombra" de virar o lugar onde a ação externa acontece.
  return {
    retido: false,
    executado: false,
    registro,
    autonomia,
    motivo: `Modo sombra desligado para "${input.acao}" e autonomia suficiente. ${autonomia.motivo} A execução é de quem chamou; este módulo nunca executa.`,
  };
}

export type Confronto = {
  /** O que a IA recomendou. */
  recomendacaoDaIA: string;
  /** O que o humano decidiu. `null` = ainda não decidiu. */
  decisaoHumana: string | null;
  /** O que aconteceu. `null` = ainda não se sabe. */
  resultado: string | null;
};

export type ComparacaoDeSombra = {
  total: number;
  /** Com decisão humana registrada — o único conjunto comparável. */
  comparaveis: number;
  concordou: number;
  discordou: number;
  /** Casos com desfecho conhecido, entre os comparáveis. */
  comResultado: number;
  iaCertaHumanoErrado: number;
  humanoCertoIaErrada: number;
  ambosCertos: number;
  ambosErrados: number;
  /**
   * `null` quando não há caso comparável. NUNCA zero: "0% de acerto" e "não
   * houve o que medir" são afirmações diferentes, e trocar uma pela outra é
   * inventar métrica.
   */
  taxaDeConcordancia: number | null;
  /** O que impede a leitura de valer. Vai no relatório junto com o número. */
  ressalvas: string[];
};

/**
 * A COMPARAÇÃO recomendação × decisão humana × resultado.
 *
 * ── A armadilha que isto evita ────────────────────────────────────────────
 *
 * O jeito natural de escrever isto é dividir concordâncias pelo total e mostrar
 * uma porcentagem. Com 3 casos, um acerto vira "33%" e alguém decide ligar um
 * agente com base nisso.
 *
 * Aqui a amostra insuficiente é dita em voz alta em `ressalvas`, e a taxa é
 * `null` quando não há caso comparável. O número e a ressalva andam juntos.
 */
export function compararSombraComHumano(confrontos: Confronto[], minimoParaConcluir = 20): ComparacaoDeSombra {
  const total = confrontos.length;
  const comparaveis = confrontos.filter((c) => c.decisaoHumana !== null && String(c.decisaoHumana).trim() !== "");
  const iguais = (a: string | null, b: string | null) =>
    String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

  const concordou = comparaveis.filter((c) => iguais(c.recomendacaoDaIA, c.decisaoHumana)).length;
  const discordou = comparaveis.length - concordou;

  const comResultado = comparaveis.filter((c) => c.resultado !== null && String(c.resultado).trim() !== "");
  let iaCertaHumanoErrado = 0, humanoCertoIaErrada = 0, ambosCertos = 0, ambosErrados = 0;
  for (const caso of comResultado) {
    const iaAcertou = iguais(caso.recomendacaoDaIA, caso.resultado);
    const humanoAcertou = iguais(caso.decisaoHumana, caso.resultado);
    if (iaAcertou && humanoAcertou) ambosCertos++;
    else if (iaAcertou) iaCertaHumanoErrado++;
    else if (humanoAcertou) humanoCertoIaErrada++;
    else ambosErrados++;
  }

  const ressalvas: string[] = [];
  if (!comparaveis.length) {
    ressalvas.push("Nenhum caso com decisão humana registrada: não há o que comparar. A taxa é 'não medida', não zero.");
  } else if (comparaveis.length < minimoParaConcluir) {
    ressalvas.push(
      `Amostra insuficiente para concluir: ${comparaveis.length} caso(s) comparável(eis), mínimo declarado ${minimoParaConcluir}. ` +
      `A taxa abaixo descreve estes casos e não sustenta decisão de tirar o agente da sombra.`,
    );
  }
  if (total > comparaveis.length) {
    ressalvas.push(`${total - comparaveis.length} de ${total} registro(s) ainda sem decisão humana — ficaram fora da comparação.`);
  }
  if (comparaveis.length > comResultado.length) {
    ressalvas.push(`${comparaveis.length - comResultado.length} caso(s) comparável(eis) ainda sem desfecho conhecido: concordância dá para medir, acerto não.`);
  }

  return {
    total,
    comparaveis: comparaveis.length,
    concordou,
    discordou,
    comResultado: comResultado.length,
    iaCertaHumanoErrado,
    humanoCertoIaErrada,
    ambosCertos,
    ambosErrados,
    taxaDeConcordancia: comparaveis.length ? concordou / comparaveis.length : null,
    ressalvas,
  };
}
