/**
 * O QUE O CORRETOR PRECISA SABER PARA PROPOR — e por que quase nada disso está
 * preenchido.
 *
 * ── Medido no banco vivo em 03/08/2026, sobre 613 leads ─────────────────────
 *
 *   forma de pagamento .... 613 vazias (100%)
 *   prazo de compra ....... 613 vazias (100%)
 *   renda mensal .......... 613 vazias (100%)
 *   precisa financiar ..... 613 vazias (100%)
 *   orçamento ............. 596 vazias (97%)
 *   dormitórios ........... 592 vazias (97%)
 *   finalidade ............ 424 vazias (69%)
 *
 * Cem por cento em quatro campos não é corretor desleixado. É campo que ninguém
 * consegue preencher: a ficha não tinha input para nenhum dos quatro, E o
 * construtor do payload (`lib/compat/payload-de-lead.ts`) não os mapeava — de
 * modo que, mesmo com input, o PATCH os descartaria em silêncio.
 *
 * ── POR QUE OPÇÃO E NÃO TEXTO LIVRE ────────────────────────────────────────
 *
 * `purpose` é o campo mais antigo dos sete e o único que a ingestão preenche.
 * O resultado, medido: SEIS grafias para DOIS conceitos — morar (58), Moradia
 * (42), moradia (7), investir (37), Investimento (35), investimento (4). Nenhum
 * filtro, nenhum gráfico e nenhuma automação consegue agrupar isso.
 *
 * Campo de texto livre em dado que tem resposta fechada não é liberdade: é
 * garantia de que ninguém vai conseguir contar depois. As opções abaixo são
 * fechadas por isso, e `normalizarFinalidade` reconcilia o que já está gravado
 * sem apagar nada.
 *
 * PURO: sem banco, sem rede, sem relógio.
 */

export type OpcaoDeCampo = { valor: string; rotulo: string };

export type CampoDaFicha = {
  /** Coluna em `leads`. */
  coluna: string;
  /** Rótulo curto e persistente. NUNCA vira placeholder — ver a regra abaixo. */
  rotulo: string;
  /** Bloco onde o campo aparece. */
  bloco: "contato" | "perfil" | "capacidade";
  tipo: "texto" | "numero" | "opcao" | "moeda";
  opcoes?: readonly OpcaoDeCampo[];
  /**
   * O que NÃO dá para fazer sem ele. É isto que a tela mostra ao lado do campo
   * vazio — "preencha tudo" não move ninguém; "sem isto não dá para filtrar o
   * estoque" move.
   */
  semEleNaoDa: string;
  /**
   * Peso na ordem do que falta. 3 = trava a proposta; 2 = trava a priorização;
   * 1 = conforto.
   */
  peso: 1 | 2 | 3;
};

export const FINALIDADES: readonly OpcaoDeCampo[] = [
  { valor: "moradia", rotulo: "Moradia" },
  { valor: "investimento", rotulo: "Investimento" },
];

export const FORMAS_DE_PAGAMENTO: readonly OpcaoDeCampo[] = [
  { valor: "financiamento", rotulo: "Financiamento" },
  { valor: "a_vista", rotulo: "À vista" },
  { valor: "fgts_mais_financiamento", rotulo: "FGTS + financiamento" },
  { valor: "consorcio", rotulo: "Consórcio" },
  { valor: "permuta", rotulo: "Permuta" },
];

export const PRAZOS_DE_COMPRA: readonly OpcaoDeCampo[] = [
  { valor: "imediato", rotulo: "Imediato (até 30 dias)" },
  { valor: "curto", rotulo: "Curto (1 a 3 meses)" },
  { valor: "medio", rotulo: "Médio (3 a 6 meses)" },
  { valor: "longo", rotulo: "Longo (mais de 6 meses)" },
  { valor: "pesquisando", rotulo: "Só pesquisando" },
];

/**
 * DUAS opções, e não três, porque a coluna é BOOLEAN.
 *
 * A primeira versão oferecia "Ainda avaliando" — e a prova contra o banco vivo
 * derrubou o PATCH inteiro: `leads.financing_required` é `boolean`, e um texto
 * ali faz o Postgres recusar a gravação toda, levando junto os outros nove
 * campos da ficha.
 *
 * Poderia ter mapeado "avaliando" para `null`. Não mapeei: `null` nesta coluna
 * já significa "ninguém perguntou", e um terceiro estado que vira o mesmo `null`
 * é a tela prometendo uma distinção que o armazenamento não guarda — a classe de
 * defeito que esta entrega inteira perseguiu. Enquanto a coluna for booleana, a
 * pergunta tem duas respostas.
 */
export const PRECISA_FINANCIAR: readonly OpcaoDeCampo[] = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
];

/**
 * A ficha, em três blocos.
 *
 * A ordem não é estética: é a ordem da conversa. Quem atende pergunta contato,
 * depois o que a pessoa quer, e só então quanto ela pode. Um formulário que
 * mistura "renda mensal" entre "nome" e "telefone" faz o corretor pular a
 * pergunta difícil — e a pergunta difícil é a que decide a proposta.
 */
export const CAMPOS_DA_FICHA: readonly CampoDaFicha[] = [
  { coluna: "name", rotulo: "Nome", bloco: "contato", tipo: "texto", semEleNaoDa: "Sem nome não dá para falar com a pessoa.", peso: 3 },
  { coluna: "phone", rotulo: "Telefone", bloco: "contato", tipo: "texto", semEleNaoDa: "Sem telefone não há WhatsApp, e é por ele que a lead de anúncio se atende.", peso: 3 },
  { coluna: "email", rotulo: "E-mail", bloco: "contato", tipo: "texto", semEleNaoDa: "Sem e-mail a lead não entra na correspondência da Meta e o retorno da venda perde precisão.", peso: 1 },

  { coluna: "purpose", rotulo: "Finalidade", bloco: "perfil", tipo: "opcao", opcoes: FINALIDADES, semEleNaoDa: "Sem finalidade não dá para saber se o argumento é moradia ou retorno — são conversas diferentes.", peso: 3 },
  { coluna: "preferred_bedrooms", rotulo: "Dormitórios", bloco: "perfil", tipo: "numero", semEleNaoDa: "Sem dormitórios não dá para filtrar o estoque: sobra o catálogo inteiro.", peso: 2 },
  { coluna: "purchase_timeline", rotulo: "Prazo de compra", bloco: "perfil", tipo: "opcao", opcoes: PRAZOS_DE_COMPRA, semEleNaoDa: "Sem prazo não dá para priorizar quem atender primeiro — quem compra este mês some no meio de quem está pesquisando.", peso: 3 },

  { coluna: "budget_max", rotulo: "Orçamento até", bloco: "capacidade", tipo: "moeda", semEleNaoDa: "Sem teto de orçamento não dá para propor unidade nenhuma sem chutar.", peso: 3 },
  { coluna: "payment_method", rotulo: "Forma de pagamento", bloco: "capacidade", tipo: "opcao", opcoes: FORMAS_DE_PAGAMENTO, semEleNaoDa: "Sem forma de pagamento a simulação não fecha e a proposta trava na mesa da incorporadora.", peso: 3 },
  { coluna: "financing_required", rotulo: "Precisa financiar", bloco: "capacidade", tipo: "opcao", opcoes: PRECISA_FINANCIAR, semEleNaoDa: "Sem saber se financia, não dá para começar a aprovação de crédito — que é o passo mais lento da venda.", peso: 2 },
  { coluna: "monthly_income", rotulo: "Renda mensal", bloco: "capacidade", tipo: "moeda", semEleNaoDa: "Sem renda não dá para dizer se o financiamento aprova, e a proposta vira tentativa.", peso: 2 },
];

/**
 * Reconcilia o que já está gravado com as opções fechadas.
 *
 * NÃO apaga o que não reconhece: devolve o original. Uma resposta de formulário
 * que ninguém previu é informação, e trocá-la por `null` para "limpar a base"
 * seria destruir o que o cliente respondeu — o mesmo erro que este produto já
 * cometeu com o motivo do descarte.
 */
export function normalizarFinalidade(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpo = String(valor).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (/^mora|^resid|^propri|^casa|^morar/.test(limpo)) return "moradia";
  if (/^invest|^renda|^aluga|^locac/.test(limpo)) return "investimento";
  return valor;
}

export type LacunaDaFicha = {
  coluna: string;
  rotulo: string;
  semEleNaoDa: string;
  peso: number;
};

export type EstadoDaFicha = {
  /** Campos vazios, do que mais trava para o que menos trava. */
  lacunas: LacunaDaFicha[];
  preenchidos: number;
  total: number;
  /** 0 a 100. Serve para a barra, não para cobrar nota de ninguém. */
  percentual: number;
  /**
   * Dá para propor? `false` enquanto faltar qualquer campo de peso 3 — são os
   * que travam a proposta, e é isso que a frase da tela precisa dizer.
   */
  daParaPropor: boolean;
};

/** Um valor conta como preenchido? Zero e string vazia NÃO contam. */
function preenchido(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valor.trim().length > 0;
  if (typeof valor === "number") return Number.isFinite(valor) && valor !== 0;
  if (Array.isArray(valor)) return valor.length > 0;
  return true;
}

/**
 * O que falta nesta ficha.
 *
 * A ordem é por consequência, não pela ordem do formulário: o corretor com dois
 * minutos entre ligações precisa saber qual pergunta fazer AGORA, e é a que
 * destrava mais coisa.
 */
export function lacunasDaFicha(
  lead: Readonly<Record<string, unknown>>,
  campos: readonly CampoDaFicha[] = CAMPOS_DA_FICHA,
): EstadoDaFicha {
  const lacunas = campos
    .filter((campo) => !preenchido(lead[campo.coluna]))
    .map((campo) => ({ coluna: campo.coluna, rotulo: campo.rotulo, semEleNaoDa: campo.semEleNaoDa, peso: campo.peso }))
    .sort((a, b) => b.peso - a.peso || a.rotulo.localeCompare(b.rotulo, "pt-BR"));

  const preenchidos = campos.length - lacunas.length;
  return {
    lacunas,
    preenchidos,
    total: campos.length,
    percentual: campos.length ? Math.round((preenchidos / campos.length) * 100) : 0,
    daParaPropor: !lacunas.some((l) => l.peso === 3),
  };
}
