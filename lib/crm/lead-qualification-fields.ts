/**
 * DAS RESPOSTAS DO FORMULÁRIO PARA OS CAMPOS QUE O CRM ENTENDE.
 *
 * ── O que este módulo resolve ───────────────────────────────────────────────
 *
 * A ingestão passou a preservar `[{ chave, resposta }]` do formulário da Meta.
 * Isso é fiel, mas cru: o pipeline não consegue filtrar por
 * `você_procura_um_imóvel_para?` e a IA não consegue cruzar duas leads cujas
 * perguntas foram escritas de jeitos diferentes.
 *
 * Aqui as respostas viram três campos canônicos — os únicos três que os
 * formulários da conta realmente perguntam:
 *
 *   intencao          morar | investir
 *   faixaInvestimento o texto da faixa, como o cliente escolheu
 *   formaPagamento    financiamento | a_vista | fgts | consorcio
 *
 * ── Por que casar por PADRÃO e não por texto exato ──────────────────────────
 *
 * Os 26 formulários da conta escrevem a mesma pergunta de formas diferentes —
 * "Qual faixa de investimento?" e "Faixa de investimento:" são a mesma coisa. E
 * o marketing reescreve título de campo sem avisar ninguém.
 *
 * Casar por texto exato quebraria no dia seguinte a qualquer edição. Casar por
 * padrão sobrevive à reescrita, que é o comportamento normal de quem cuida do
 * anúncio.
 *
 * ── O que NÃO é jogado fora ─────────────────────────────────────────────────
 *
 * Resposta que não casa com nenhum padrão continua inteira em `naoMapeadas`.
 * Descartar o que não se reconhece é como se perdeu a informação da primeira
 * vez — e a pergunta que o marketing inventar mês que vem vai cair aqui antes
 * de alguém ensinar o padrão dela.
 */

export type Intencao = "morar" | "investir";
export type FormaPagamento = "financiamento" | "a_vista" | "fgts" | "consorcio";

export type CamposDeQualificacao = {
  intencao: Intencao | null;
  faixaInvestimento: string | null;
  formaPagamento: FormaPagamento | null;
  /** Respostas que nenhum padrão reconheceu. Preservadas, nunca descartadas. */
  naoMapeadas: Array<{ chave: string; resposta: string }>;
  /**
   * O formulário chegou a perguntar alguma coisa além de nome/e-mail/telefone?
   *
   * `false` significa "ninguém perguntou" — que é MUITO diferente de "a pessoa
   * não respondeu". Os três formulários ativos hoje caem aqui, e cobrar do
   * cliente uma resposta que ninguém pediu é o erro que esta distinção evita.
   */
  formularioPerguntou: boolean;
};

export const SEM_QUALIFICACAO: CamposDeQualificacao = {
  intencao: null,
  faixaInvestimento: null,
  formaPagamento: null,
  naoMapeadas: [],
  formularioPerguntou: false,
};

/** Sem acento, minúsculo, sem pontuação — para o padrão sobreviver à reescrita. */
function normalizar(texto: string): string {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Padrões vistos nos formulários reais da conta. */
const PADRAO_INTENCAO = /procura.*imovel para|intencao da compra|finalidade|para (morar|investir)/;
const PADRAO_FAIXA = /faixa de investimento|faixa de preco|quanto pretende|orcamento|valor do imovel/;
const PADRAO_PAGAMENTO = /como pretende adquirir|forma de pagamento|pretende pagar|financiamento/;

function lerIntencao(resposta: string): Intencao | null {
  const r = normalizar(resposta);
  // "investir" antes de "morar": "investir para depois morar" é investimento.
  if (/invest|renda|alugar|locacao/.test(r)) return "investir";
  if (/morar|residir|moradia|propria|familia/.test(r)) return "morar";
  return null;
}

function lerFormaPagamento(resposta: string): FormaPagamento | null {
  const r = normalizar(resposta);
  if (/a vista|avista|dinheiro|recursos proprios/.test(r)) return "a_vista";
  if (/consorcio/.test(r)) return "consorcio";
  if (/fgts/.test(r)) return "fgts";
  if (/financ|banco|caixa|credito/.test(r)) return "financiamento";
  return null;
}

/**
 * Mapeia as respostas preservadas para os campos canônicos.
 *
 * Puro: nenhum acesso a banco, para que a régua possa ser exercitada sem
 * infraestrutura e revisada por quem entende do negócio, não do código.
 */
export function mapearQualificacao(
  respostas: Array<{ chave: string; resposta: string }> | null | undefined,
): CamposDeQualificacao {
  if (!Array.isArray(respostas) || respostas.length === 0) return SEM_QUALIFICACAO;

  const campos: CamposDeQualificacao = {
    intencao: null,
    faixaInvestimento: null,
    formaPagamento: null,
    naoMapeadas: [],
    formularioPerguntou: true,
  };

  for (const item of respostas) {
    const chave = normalizar(item?.chave ?? "");
    const resposta = String(item?.resposta ?? "").trim();
    if (!resposta) continue;

    if (PADRAO_INTENCAO.test(chave) && !campos.intencao) {
      const lido = lerIntencao(resposta);
      if (lido) { campos.intencao = lido; continue; }
    }
    if (PADRAO_FAIXA.test(chave) && !campos.faixaInvestimento) {
      // A faixa fica como o cliente escolheu. Converter para número inventaria
      // precisão que a resposta não tem — "R$ 400 a 600 mil" não é um valor.
      campos.faixaInvestimento = resposta;
      continue;
    }
    if (PADRAO_PAGAMENTO.test(chave) && !campos.formaPagamento) {
      const lido = lerFormaPagamento(resposta);
      if (lido) { campos.formaPagamento = lido; continue; }
    }
    // Reconheceu a pergunta mas não a resposta, ou não reconheceu nada: guarda
    // inteiro. O corretor lê e entende, mesmo quando o mapeador não entendeu.
    campos.naoMapeadas.push({ chave: item.chave, resposta });
  }

  return campos;
}

/**
 * Frase curta para a tela do corretor. Null quando não há nada a dizer —
 * melhor silêncio que "nenhuma informação disponível", que ocupa espaço para
 * dizer que não tem informação.
 */
export function resumirQualificacao(c: CamposDeQualificacao): string | null {
  if (!c.formularioPerguntou) return null;
  const partes: string[] = [];
  if (c.intencao) partes.push(c.intencao === "morar" ? "quer morar" : "quer investir");
  if (c.faixaInvestimento) partes.push(c.faixaInvestimento);
  if (c.formaPagamento) {
    partes.push({
      financiamento: "financia",
      a_vista: "à vista",
      fgts: "usa FGTS",
      consorcio: "consórcio",
    }[c.formaPagamento]);
  }
  if (!partes.length) return null;
  return partes.join(" · ");
}

/**
 * A lead tem o suficiente para o corretor priorizar?
 *
 * Intenção + faixa são o par mínimo: sem os dois, "ligar primeiro para quem
 * compra mais rápido" é chute. Não é nota de qualidade — é se dá para decidir.
 */
export function daParaPriorizar(c: CamposDeQualificacao): boolean {
  return Boolean(c.intencao && c.faixaInvestimento);
}
