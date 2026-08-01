/**
 * VENDA FECHADA E VALOR NÃO INFORMADO — a cobrança que faltava.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * `app/api/v1/pipeline/route.ts` grava `sale_value_brl` **só quando o valor vem
 * no pedido** (`if (saleValue !== null)`). O comentário no próprio arquivo chama
 * esse estado de "vendeu e ainda não informou", e o desenho está CERTO: fechar a
 * venda não pode travar porque o corretor ainda não tem o número na mão, e a CAPI
 * não deve emitir `Purchase` sem valor — em `lib/integrations/meta/capi-feedback.ts`
 * está escrito que "Purchase sem value ensina a coisa errada" à otimização da Meta.
 *
 * O defeito não é falhar sem enviar. É **nada cobrar o valor depois**.
 *
 * MEDIDO em 2026-07-30, no banco de homologação: existe 1 lead com
 * `status = 'ganho'` e `sale_value_brl` NULO — uma venda real registrada sem
 * valor, parada em silêncio. E, em consequência:
 *
 *   · VGV medido ................. R$ 0
 *   · ROI ........................ não calculável (sem receita, sem denominador)
 *   · baseline para previsão ..... inexistente
 *   · evento Purchase na CAPI .... nunca emitido (1 evento na tabela, e ele
 *                                  saiu com attempts=0 e delivered_at=null)
 *
 * Uma venda sem valor apurado é a única linha do sistema que, sozinha, quebra
 * quatro coisas ao mesmo tempo. E ela não aparece em lugar nenhum: no painel a
 * lead está em "ganho", verdinha, resolvida.
 *
 * ── POR QUE COBRAR SEM BLOQUEAR ─────────────────────────────────────────────
 *
 * Bloquear o fechamento até o valor chegar parece rigor e é o oposto: o corretor
 * fecha a venda em pé, na obra, com o cliente ao lado, e nem sempre sabe o valor
 * final na hora. Travar o "ganho" faria ele deixar a lead em "proposta" — e aí o
 * sistema perde o desfecho INTEIRO, não só o número.
 *
 * Então: fecha na hora, e o sistema fica devendo. A pendência entra na fila de
 * exceção de quem responde pelo resultado, com a idade dela à mostra, até alguém
 * informar. É a mesma postura do primeiro contato: o prazo existe, o trabalho não
 * para, e a ausência é DECLARADA em vez de esquecida.
 *
 * Este módulo é puro e sem `server-only` de propósito — um contrato precisa
 * conseguir chamá-lo com linhas de verdade.
 */

/** Os status que significam venda fechada, na grafia canônica e nas variantes vivas. */
const VENDIDO = new Set(["ganho", "won", "vendido"]);

/**
 * A partir de quantos dias a pendência para de ser "ainda não informou" e passa a
 * ser "ninguém vai informar". Três dias cobre o fim de semana: fechou na sexta,
 * informou na segunda, e ninguém foi incomodado por isso.
 */
export const DIAS_PARA_COBRANCA_CRITICA = 3;

export type LinhaDeVenda = {
  status?: string | null;
  sale_value_brl?: number | string | null;
  sale_value_recorded_at?: string | null;
  /** Quando a lead virou venda. Na falta, `updated_at` é a melhor âncora que existe. */
  won_at?: string | null;
  updated_at?: string | null;
};

/**
 * É venda fechada esperando valor?
 *
 * Repare que a checagem é do VALOR, não de `sale_value_recorded_at`. As duas
 * colunas são escritas juntas pela rota, mas confiar no timestamp deixaria passar
 * uma linha com data e valor nulo — e é justamente o valor que a CAPI precisa.
 * Duas colunas para o mesmo fato é a classe de defeito desta base; aqui a fonte é
 * uma só, e é a que importa.
 */
export function aguardandoValorDaVenda(lead: LinhaDeVenda): boolean {
  if (!VENDIDO.has(String(lead.status || "").toLowerCase())) return false;
  const valor = lead.sale_value_brl;
  if (valor === null || valor === undefined || valor === "") return true;
  const numero = Number(valor);
  // `0` e valor ilegível contam como ausente: venda de zero real não existe, e
  // tratar `NaN` como informado esconderia dado corrompido atrás de um verde.
  return !Number.isFinite(numero) || numero <= 0;
}

/** Há quantos dias esta venda espera o valor. `null` quando não há âncora de tempo. */
export function diasAguardando(lead: LinhaDeVenda, agoraMs: number): number | null {
  const ancora = lead.won_at || lead.updated_at;
  if (!ancora) return null;
  const ms = Date.parse(ancora);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((agoraMs - ms) / 86_400_000));
}

export type CobrancaDeValor = {
  dias: number | null;
  critico: boolean;
  /** Por que isto importa — a frase vai para a tela, e ela não é decorativa. */
  consequencia: string;
};

/**
 * O veredito da cobrança, ou `null` quando não há o que cobrar.
 *
 * `dias === null` NÃO vira crítico: sem âncora de tempo, afirmar atraso seria
 * inventar o dado que falta. Ele aparece na fila, sem prioridade forjada.
 */
export function avaliarCobrancaDeValor(lead: LinhaDeVenda, agoraMs: number): CobrancaDeValor | null {
  if (!aguardandoValorDaVenda(lead)) return null;
  const dias = diasAguardando(lead, agoraMs);
  return {
    dias,
    critico: dias !== null && dias >= DIAS_PARA_COBRANCA_CRITICA,
    consequencia:
      "Sem o valor, esta venda não entra no VGV, não vira evento Purchase na Meta " +
      "e não conta como receita para nenhuma métrica.",
  };
}

/**
 * O valor informado é aceitável?
 *
 * Recusa só o que é objetivamente impossível: não-número e menor ou igual a zero.
 * NÃO existe teto arbitrário aqui — inventar um limite superior recusaria a venda
 * grande de verdade, e o dono deste produto proibiu inventar informação comercial.
 * Erro de digitação (R$ 450 no lugar de R$ 450.000) é problema de CONFIRMAÇÃO na
 * tela, não de validação no servidor: o servidor não sabe qual dos dois é o certo.
 */
export function valorDaVendaAceitavel(valor: unknown): { ok: true; valor: number } | { ok: false; motivo: string } {
  if (typeof valor !== "number" && typeof valor !== "string") {
    return { ok: false, motivo: "Informe o valor da venda em reais." };
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return { ok: false, motivo: "O valor informado não é um número." };
  if (numero <= 0) return { ok: false, motivo: "O valor da venda precisa ser maior que zero." };
  return { ok: true, valor: numero };
}
