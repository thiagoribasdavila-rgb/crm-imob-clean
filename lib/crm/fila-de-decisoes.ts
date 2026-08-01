/**
 * A FILA DE DECISÕES QUE A IA JÁ TOMOU E NINGUÉM VIU.
 *
 * ── O que foi medido, e por que este arquivo existe ─────────────────────────
 *
 * Em 01/08/2026 a tabela `ai_shadow_decisions` tinha 20 linhas, todas com
 * `retido=true`, `executado=false` e `decisao_humana=null` — vinte
 * redistribuições que o agente de SLA preparou, gravou, e que nenhuma tela do
 * produto lia. As três funções que fechariam o ciclo (`registrarDecisaoHumana`,
 * `registrarResultado`, `compararSombra`) estavam escritas em
 * `lib/ai/registro-de-sombra.ts` com ZERO chamadores.
 *
 * O modo sombra tem uma condição de saída escrita no próprio motivo que ele
 * grava: *"para sair da sombra, olhe a comparação recomendação × decisão ×
 * resultado"*. Sem uma tela que colete a decisão humana, `decisao_humana` fica
 * nula para sempre, a comparação nunca acumula caso, e a IA nunca sai da
 * sombra. Não era um recurso faltando — era um **laço aberto**.
 *
 * ── Por que módulo puro ────────────────────────────────────────────────────
 *
 * Tudo aqui é decisão, não I/O: o que pode ser decidido, como se descreve para
 * um humano, e em que ordem as decisões chegam. Vive separado para poder ser
 * exercitado por contrato — a regra que mora dentro de uma rota só é testável
 * levantando a rota, e por isso costuma não ser testada.
 */

/** Como a linha chega do banco. Campos que não usamos ficam de fora de propósito. */
export type LinhaDeSombra = {
  id: string;
  agent?: unknown;
  acao?: unknown;
  recomendacao?: unknown;
  motivo?: unknown;
  entidade_tipo?: unknown;
  entidade_id?: unknown;
  retido?: unknown;
  executado?: unknown;
  decisao_humana?: unknown;
  created_at?: unknown;
  preparado?: unknown;
};

export type DecisaoPendente = {
  id: string;
  agente: string;
  acao: string;
  /** Frase para humano — nunca contém identificador técnico. */
  frase: string;
  porque: string;
  leadId: string | null;
  deQuem: string | null;
  paraQuem: string | null;
  paraQuemRotulo: string;
  atrasoHoras: number | null;
  criadoEm: string | null;
  /** Falso quando algo impede decidir; `porqueNaoPode` diz o quê. */
  podeDecidir: boolean;
  porqueNaoPode: string | null;
};

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Parece um UUID? Então NÃO é nome de gente.
 *
 * Esta é a função que impede o defeito que motivou o arquivo. Medido na linha
 * real: `recomendacao` dizia *"Passar a lead Tatiane Camargo para
 * 240a6bc5-5163-42ab-9d0f-729c7d0b0d35"* — porque quem montou a frase usou
 * `destino.nome || destino.brokerId`, e o `||` entregou o identificador quando
 * o nome era nulo.
 *
 * Um UUID numa frase não informa nada e ainda parece defeito de sistema. O
 * fallback honesto é dizer que o cadastro está incompleto: isso é acionável, o
 * UUID não é.
 */
export function pareceIdentificador(valor: string): boolean {
  const v = valor.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
  // Cadeia longa de hex sem espaço também é identificador, não nome.
  return v.length >= 16 && !v.includes(" ") && /^[0-9a-f-]+$/i.test(v);
}

/** O rótulo que uma pessoa lê no lugar de um destino. */
export function rotularPessoa(nome: unknown, id: unknown): string {
  const n = texto(nome);
  if (n && !pareceIdentificador(n)) return n;
  const i = texto(id);
  if (!i) return "corretor não identificado";
  // Últimos 4 caracteres dão ao suporte como achar a linha sem despejar o UUID
  // inteiro numa frase de negócio.
  return `corretor sem nome cadastrado (…${i.slice(-4)})`;
}

/**
 * Reescreve a frase gravada trocando qualquer identificador vazado pelo rótulo.
 *
 * Reescrever em vez de regravar: a linha do banco é o registro histórico do que
 * a IA disse, e adulterá-la apagaria a evidência. A correção é de apresentação.
 */
export function limparFrase(frase: string, substituicoes: Array<{ id: string; rotulo: string }>): string {
  let saida = frase;
  for (const { id, rotulo } of substituicoes) {
    if (!id) continue;
    saida = saida.split(id).join(rotulo);
  }
  return saida;
}

/**
 * Só é decidível o que a IA reteve, não executou e ninguém julgou ainda.
 *
 * As três condições juntas, e não uma: `executado=true` já mudou o mundo, e
 * oferecer "aprovar" ali criaria uma segunda execução; `decisao_humana`
 * preenchida significa que alguém já respondeu, e um segundo clique
 * sobrescreveria o julgamento de outra pessoa sem deixar rastro.
 */
export function porqueNaoPodeDecidir(linha: LinhaDeSombra): string | null {
  if (linha.executado === true) return "já foi executada — decidir de novo aplicaria a mudança duas vezes";
  if (linha.retido !== true) return "não foi retida pela sombra — não é uma pendência de decisão";
  const jaDecidida = texto(linha.decisao_humana);
  if (jaDecidida) return `já foi decidida como "${jaDecidida}"`;
  if (!texto(linha.entidade_id)) return "não aponta para nenhuma lead — não há o que redistribuir";
  return null;
}

/** Normaliza uma linha crua na forma que a tela consome. */
export function normalizarDecisao(linha: LinhaDeSombra): DecisaoPendente {
  const preparado = (linha.preparado && typeof linha.preparado === "object" ? linha.preparado : {}) as Record<string, unknown>;
  const paraQuem = texto(preparado.paraQuem) || null;
  const deQuem = texto(preparado.deQuem) || null;
  const paraQuemRotulo = rotularPessoa(preparado.paraQuemNome, paraQuem);
  const atrasoMin = Number(preparado.atrasoMin);

  const bruta = texto(linha.recomendacao) || "Decisão sem descrição gravada.";
  const frase = limparFrase(bruta, [
    { id: paraQuem ?? "", rotulo: paraQuemRotulo },
    { id: deQuem ?? "", rotulo: "o dono atual" },
    { id: texto(linha.entidade_id), rotulo: "esta lead" },
  ]);

  const impedimento = porqueNaoPodeDecidir(linha);

  return {
    id: String(linha.id),
    agente: texto(linha.agent) || "desconhecido",
    acao: texto(linha.acao) || "desconhecida",
    frase,
    porque: texto(preparado.porque) || texto(linha.motivo) || "",
    leadId: texto(linha.entidade_id) || null,
    deQuem,
    paraQuem,
    paraQuemRotulo,
    atrasoHoras: Number.isFinite(atrasoMin) && atrasoMin >= 0 ? Math.floor(atrasoMin / 60) : null,
    criadoEm: texto(linha.created_at) || null,
    podeDecidir: impedimento === null,
    porqueNaoPode: impedimento,
  };
}

/**
 * A ordem da fila é a ordem da consequência.
 *
 * Decidíveis primeiro — uma fila que abre com itens travados ensina a pessoa a
 * rolar antes de agir. Dentro delas, o maior atraso primeiro: é a lead que está
 * esperando há mais tempo, e o custo de esperar mais um dia é maior.
 * O `id` desempata para que a ordem seja estável entre duas leituras.
 */
export function ordenarPorConsequencia(decisoes: DecisaoPendente[]): DecisaoPendente[] {
  return [...decisoes].sort((a, b) => {
    if (a.podeDecidir !== b.podeDecidir) return a.podeDecidir ? -1 : 1;
    const at = a.atrasoHoras ?? -1;
    const bt = b.atrasoHoras ?? -1;
    if (at !== bt) return bt - at;
    return a.id.localeCompare(b.id);
  });
}

export function montarFila(linhas: LinhaDeSombra[]): {
  decisoes: DecisaoPendente[];
  decidiveis: number;
  travadas: number;
} {
  const decisoes = ordenarPorConsequencia(linhas.map(normalizarDecisao));
  return {
    decisoes,
    decidiveis: decisoes.filter((d) => d.podeDecidir).length,
    travadas: decisoes.filter((d) => !d.podeDecidir).length,
  };
}

/** As duas respostas que a tela oferece. Lista fechada: nada além disto grava. */
export const DECISOES_ACEITAS = ["aprovada", "recusada"] as const;
export type DecisaoHumana = (typeof DECISOES_ACEITAS)[number];

export function decisaoValida(valor: unknown): valor is DecisaoHumana {
  return typeof valor === "string" && (DECISOES_ACEITAS as readonly string[]).includes(valor);
}
