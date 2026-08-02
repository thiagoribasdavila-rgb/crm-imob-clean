/**
 * O VALOR DE UMA VENDA FECHADA — e o que NUNCA pode ser confundido com ele.
 *
 * ── O DEFEITO QUE ISTO FIXA, MEDIDO NO BANCO EM 2026-08-02 ──────────────────
 *
 * A tela `/sales` monta a lista a partir de `leads` (a tabela `opportunities`
 * existe e está VAZIA, então o recuo declarado na própria tela é o caminho
 * VIVO — não é hipótese). Esse recuo passa cada linha por `leadAsOpportunity`
 * de `lib/compat/legacy-v2.ts`, que decide o valor assim:
 *
 *     value: first(lead, "value", "budget_max", "budget_min") ?? 0
 *
 * A tabela `leads` NÃO TEM coluna `value` (conferido em
 * `information_schema.columns`), e a coluna que guarda a venda de verdade —
 * `sale_value_brl` — não está na lista. O resultado, nas duas únicas linhas em
 * `status = 'ganho'` da base real:
 *
 *   Claudia Ferreira ... sale_value_brl = 550000.00 · budget_min/max = NULL
 *                        → first() não acha nada → `?? 0` → exibida como R$ 0
 *
 *   Monique Teles ...... sale_value_brl = NULL      · budget_min = 756000
 *                        → first() acha budget_min → exibida como R$ 756.000
 *
 * A tela mostra as duas EXATAMENTE INVERTIDAS. A única venda apurada do
 * produto vale zero na tela; a venda que ninguém apurou aparece como a maior
 * receita da operação. E os R$ 756.000 nunca foram uma venda: são o orçamento
 * que o cliente DECLAROU. `metrics.won` soma os dois e devolve R$ 756.000 de
 * receita que não existe.
 *
 * Isso é a proibição do produto — "número na tela precisa de origem
 * rastreável" — quebrada nas duas direções ao mesmo tempo: um número medido
 * apagado, e um número inventado promovido a receita.
 *
 * ── ORÇAMENTO NÃO É RECEITA, E ISSO JÁ ESTAVA ESCRITO ───────────────────────
 *
 * `app/api/v1/pipeline/route.ts` recusa o mesmo atalho no fechamento, com
 * todas as letras: "Orçamento declarado (budget_min/max) NÃO serve: é intenção
 * do cliente, e mandar intenção como venda ensina o algoritmo com número
 * inventado — sem desfazer." A regra existia no caminho de ESCRITA e não
 * existia no caminho de LEITURA. Este módulo é a mesma regra, do lado que
 * faltava.
 *
 * Módulo puro e sem `server-only` de propósito: decisão pura não pode morar em
 * `.tsx` porque `node --test` não tira tipos de JSX e nenhum contrato a
 * alcançaria.
 */

// Import relativo com extensão, como `redistribuicao-em-sombra.ts` faz: o alias
// `@/` não resolve sob `node --test`, e um módulo puro que nenhum contrato
// consegue carregar é um módulo sem prova.
import { aguardandoValorDaVenda, type LinhaDeVenda } from "./venda-sem-valor.ts";

/**
 * Os status que significam venda fechada.
 *
 * Esta é a MESMA grafia usada por `lib/crm/venda-sem-valor.ts` e pelo filtro
 * `.in("status", [...])` da rota `/api/v1/crm/vendas-sem-valor`. Repetir um
 * vocabulário é a classe de defeito "caminhos divergentes" desta base — dois
 * lugares que concordam hoje e divergem na próxima edição. Como o outro módulo
 * não exporta o conjunto, o contrato desta entrega amarra os dois: para cada
 * status daqui, `aguardandoValorDaVenda` tem de reconhecer a venda. Se alguém
 * acrescentar um status lá e não aqui (ou o contrário), o contrato ABRE.
 */
export const STATUS_DE_VENDA_FECHADA = ["ganho", "won", "vendido"] as const;

export type LinhaDeFechamento = LinhaDeVenda & {
  /** Presentes na linha real e deliberadamente IGNORADOS como receita. */
  budget_min?: number | string | null;
  budget_max?: number | string | null;
};

export function ehVendaFechada(lead: LinhaDeFechamento): boolean {
  const status = String(lead.status ?? "").trim().toLowerCase();
  return (STATUS_DE_VENDA_FECHADA as readonly string[]).includes(status);
}

/**
 * O valor APURADO da venda, ou `null` quando ninguém apurou.
 *
 * `null` e `0` são respostas diferentes e o tipo obriga a tela a tratá-las
 * assim: `0` diria "esta venda valeu zero real", e venda de zero real não
 * existe. Quem chama não pode cair em `?? 0` — foi exatamente esse `?? 0` que
 * transformou a venda de R$ 550.000 em R$ 0 na tela.
 *
 * A leitura converte de string porque `numeric` do Postgres chega como string
 * pelo PostgREST ("550000.00"), não como número.
 */
export function valorApuradoDaVenda(lead: LinhaDeFechamento): number | null {
  if (!ehVendaFechada(lead)) return null;
  const bruto = lead.sale_value_brl;
  if (bruto === null || bruto === undefined || bruto === "") return null;
  const numero = Number(bruto);
  // Ilegível e não-positivo contam como NÃO apurado: deixar `NaN` virar número
  // esconderia dado corrompido atrás de um total de aparência saudável.
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return numero;
}

export type EstadoDoFechamento =
  | { estado: "nao_e_venda" }
  | { estado: "apurado"; valor: number }
  | { estado: "aguardando" };

/**
 * Em que pé está o fechamento desta lead.
 *
 * "aguardando" é um estado LEGÍTIMO e declarado, não um erro: o corretor fecha
 * em pé, na obra, e nem sempre tem o número final na hora. O que não pode é a
 * ausência ficar muda — foi assim que uma venda ganha ficou "verdinha e
 * resolvida" no painel com o VGV zerado atrás dela.
 */
export function estadoDoFechamento(lead: LinhaDeFechamento): EstadoDoFechamento {
  if (!ehVendaFechada(lead)) return { estado: "nao_e_venda" };
  const valor = valorApuradoDaVenda(lead);
  return valor === null ? { estado: "aguardando" } : { estado: "apurado", valor };
}

export type ApuracaoDeVgv = {
  /** Soma SÓ do que foi apurado. Nunca inclui orçamento. */
  vgv: number;
  apuradas: number;
  aguardando: number;
  totalDeVendas: number;
  /**
   * O VGV pode ser lido como total da operação?
   *
   * Falso enquanto houver venda sem valor: o número está certo como soma do que
   * foi medido e ERRADO como receita da operação, e a tela precisa dizer qual
   * dos dois está mostrando. Denominador ausente é como "442 leads" virou um
   * número sem significado nesta base.
   */
  completo: boolean;
};

/**
 * O VGV do que foi APURADO, com a ausência declarada ao lado.
 *
 * Não devolve "0" para uma operação que não mediu nada: devolve `vgv: 0` com
 * `apuradas: 0`, e cabe a quem desenha não pintar isso como "receita zero". A
 * regra do produto é explícita: ausência de dado NUNCA pode ser desenhada como
 * zero.
 */
export function apurarVgv(leads: readonly LinhaDeFechamento[]): ApuracaoDeVgv {
  let vgv = 0;
  let apuradas = 0;
  let aguardando = 0;
  for (const lead of leads) {
    const estado = estadoDoFechamento(lead);
    if (estado.estado === "apurado") {
      vgv += estado.valor;
      apuradas += 1;
    } else if (estado.estado === "aguardando") {
      aguardando += 1;
    }
  }
  return { vgv, apuradas, aguardando, totalDeVendas: apuradas + aguardando, completo: aguardando === 0 };
}

/**
 * A frase que acompanha o VGV na tela.
 *
 * Existe aqui, e não no `.tsx`, porque é decisão — e decisão em `.tsx` fica
 * fora do alcance de qualquer contrato.
 */
export function lastroDoVgv(apuracao: ApuracaoDeVgv): string {
  if (apuracao.totalDeVendas === 0) return "Nenhuma venda fechada ainda.";
  if (apuracao.completo) {
    return apuracao.apuradas === 1
      ? "1 venda fechada, com valor informado."
      : `${apuracao.apuradas} vendas fechadas, todas com valor informado.`;
  }
  return `${apuracao.apuradas} de ${apuracao.totalDeVendas} vendas com valor informado — ${apuracao.aguardando} aguardando.`;
}

/**
 * Guarda explícita contra a regressão que originou este módulo.
 *
 * Recebe o valor que um mapeamento de compatibilidade produziu e devolve `true`
 * quando esse valor veio do ORÇAMENTO em vez da venda. Serve para provar, em
 * contrato, que a tela deixou de exibir intenção como receita — e para deixar o
 * defeito nomeado no código, não só no comentário.
 */
export function valorVeioDoOrcamento(lead: LinhaDeFechamento, valorExibido: number | null): boolean {
  if (valorExibido === null || !ehVendaFechada(lead)) return false;
  if (valorApuradoDaVenda(lead) !== null) return false;
  const orcamentos = [lead.budget_max, lead.budget_min]
    .map((bruto) => (bruto === null || bruto === undefined || bruto === "" ? null : Number(bruto)))
    .filter((numero): numero is number => numero !== null && Number.isFinite(numero));
  return orcamentos.includes(valorExibido);
}

/** Amarra este módulo ao vocabulário de `venda-sem-valor.ts`. Ver o contrato. */
export function reconhecidoComoPendente(status: string): boolean {
  return aguardandoValorDaVenda({ status, sale_value_brl: null });
}
