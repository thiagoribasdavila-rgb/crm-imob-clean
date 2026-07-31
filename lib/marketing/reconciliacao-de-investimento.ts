/**
 * O DINHEIRO E AS LEADS SE ENCONTRAM? — reconciliação entre compra e resultado.
 *
 * ── O que apareceu no minuto seguinte à primeira importação ─────────────────
 *
 * Em 2026-07-31, assim que `marketing_spend` deixou de ser uma tabela vazia, a
 * primeira pergunta que ela permitiu fazer devolveu isto:
 *
 *   7 campanhas com gasto ..... R$ 3.612,01 ..... 0 leads atribuídas
 *   1 campanha com leads ...... 24 leads ........ nenhum gasto registrado
 *
 * A campanha das 24 leads (`120251113236400624`) **não pertence à conta de
 * anúncios que o CRM lê** — a Graph API recusa a consulta dela com "(#10)
 * Application does not have permission for this action", e ela não está entre
 * as 10 campanhas de `act_2169318190556460`.
 *
 * Ou seja: o dinheiro que o CRM enxerga e as leads que o CRM tem vêm de lugares
 * diferentes. Existem (pelo menos) duas contas de anúncio, e a configurada não é
 * a que produziu as leads.
 *
 * ── Por que isto vira produto, e não só um achado de auditoria ──────────────
 *
 * Um CPL calculado sobre esses dois lados daria R$ 3.612,01 ÷ 24 = R$ 150,50 —
 * um número redondo, plausível, apresentável em reunião, e **falso**: ele
 * divide o custo de uma conta pelo resultado de outra.
 *
 * A regra deste módulo, então: **CPL só existe onde as duas pontas são a mesma
 * campanha.** Quando não são, a tela não mostra CPL: mostra as duas pilhas
 * separadas e diz que elas não se encontram. Número ausente com motivo é
 * diagnóstico; número inventado vira decisão de verba.
 *
 * Módulo puro — sem banco, sem rede, sem `server-only`. Os contratos executam.
 */

export type GastoDeCampanha = {
  /** Id da campanha NA META (não o uuid interno). */
  externalId: string;
  nome: string;
  reais: number;
  de: string | null;
  ate: string | null;
};

export type LeadsDeCampanha = {
  externalId: string;
  leads: number;
};

export type CampanhaReconciliada = {
  externalId: string;
  nome: string;
  reais: number;
  leads: number;
  /** Só quando as duas pontas existem na MESMA campanha. */
  cpl: number | null;
};

export type Reconciliacao = {
  investimentoTotal: number;
  leadsAtribuidas: number;
  campanhas: CampanhaReconciliada[];
  /** Campanhas que consumiram verba e não trouxeram nenhuma lead a este CRM. */
  gastoSemLead: { campanhas: number; reais: number };
  /** Campanhas que trouxeram lead e cujo gasto o CRM não conhece. */
  leadSemGasto: { campanhas: number; leads: number };
  /** Média ponderada, apenas sobre campanhas com as duas pontas. */
  cplGlobal: number | null;
  /** Quando `cplGlobal` é nulo, aqui está a frase que a tela mostra no lugar. */
  porqueSemCpl: string | null;
  periodo: { de: string | null; ate: string | null };
};

const centavos = (n: number) => Math.round(n * 100) / 100;

const dinheiro = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/**
 * Junta as duas pontas por id externo de campanha e diz, sem enfeite, onde elas
 * não se encontram.
 */
export function reconciliaInvestimento(
  gastos: GastoDeCampanha[],
  leads: LeadsDeCampanha[],
): Reconciliacao {
  const leadsPorExterno = new Map<string, number>();
  for (const linha of leads) {
    if (!linha?.externalId) continue;
    leadsPorExterno.set(linha.externalId, (leadsPorExterno.get(linha.externalId) ?? 0) + Math.max(0, Math.round(linha.leads)));
  }

  const gastoPorExterno = new Map<string, GastoDeCampanha>();
  for (const linha of gastos) {
    if (!linha?.externalId) continue;
    const anterior = gastoPorExterno.get(linha.externalId);
    gastoPorExterno.set(linha.externalId, anterior
      ? {
          ...anterior,
          reais: anterior.reais + linha.reais,
          de: menorData(anterior.de, linha.de),
          ate: maiorData(anterior.ate, linha.ate),
        }
      : { ...linha, reais: Number(linha.reais) || 0 });
  }

  const todos = [...new Set([...gastoPorExterno.keys(), ...leadsPorExterno.keys()])];
  const campanhas: CampanhaReconciliada[] = todos.map((externalId) => {
    const gasto = gastoPorExterno.get(externalId);
    const reais = centavos(gasto?.reais ?? 0);
    const quantasLeads = leadsPorExterno.get(externalId) ?? 0;
    return {
      externalId,
      // Campanha que só aparece do lado das leads não tem nome no CRM: o nome
      // vive em `marketing_campaigns`, que o importador preenche a partir da
      // conta de anúncios — e essa campanha não está nela.
      nome: gasto?.nome ?? "(campanha fora da conta de anúncios configurada)",
      reais,
      leads: quantasLeads,
      // A regra central deste arquivo, em uma linha.
      cpl: reais > 0 && quantasLeads > 0 ? centavos(reais / quantasLeads) : null,
    };
  }).sort((a, b) => (b.reais - a.reais) || (b.leads - a.leads));

  const comAsDuasPontas = campanhas.filter((c) => c.reais > 0 && c.leads > 0);
  const soGasto = campanhas.filter((c) => c.reais > 0 && c.leads === 0);
  const soLead = campanhas.filter((c) => c.reais === 0 && c.leads > 0);

  const investimentoTotal = centavos(campanhas.reduce((s, c) => s + c.reais, 0));
  const leadsAtribuidas = campanhas.reduce((s, c) => s + c.leads, 0);

  const reaisComPonta = comAsDuasPontas.reduce((s, c) => s + c.reais, 0);
  const leadsComPonta = comAsDuasPontas.reduce((s, c) => s + c.leads, 0);

  return {
    investimentoTotal,
    leadsAtribuidas,
    campanhas,
    gastoSemLead: { campanhas: soGasto.length, reais: centavos(soGasto.reduce((s, c) => s + c.reais, 0)) },
    leadSemGasto: { campanhas: soLead.length, leads: soLead.reduce((s, c) => s + c.leads, 0) },
    cplGlobal: leadsComPonta > 0 ? centavos(reaisComPonta / leadsComPonta) : null,
    porqueSemCpl: leadsComPonta > 0 ? null : explicaAusenciaDeCpl(soGasto, soLead),
    periodo: {
      de: [...gastoPorExterno.values()].reduce<string | null>((menor, g) => menorData(menor, g.de), null),
      ate: [...gastoPorExterno.values()].reduce<string | null>((maior, g) => maiorData(maior, g.ate), null),
    },
  };
}

/**
 * A frase que vai para a tela quando o CPL não pode ser afirmado.
 *
 * Três situações diferentes, três frases diferentes — porque mandam fazer coisas
 * opostas: procurar a conta certa, esperar a lead chegar, ou configurar a
 * integração.
 */
function explicaAusenciaDeCpl(soGasto: CampanhaReconciliada[], soLead: CampanhaReconciliada[]): string {
  const reais = centavos(soGasto.reduce((s, c) => s + c.reais, 0));
  const leads = soLead.reduce((s, c) => s + c.leads, 0);

  if (soGasto.length > 0 && soLead.length > 0) {
    return `Não dá para calcular custo por lead: ${dinheiro(reais)} foram gastos em ${soGasto.length} campanha${soGasto.length === 1 ? "" : "s"} que não trouxeram nenhuma lead a este CRM, enquanto ${leads} lead${leads === 1 ? "" : "s"} vieram de ${soLead.length} campanha${soLead.length === 1 ? "" : "s"} cujo gasto o CRM não conhece. Dividir um pelo outro daria um número plausível e falso — são contas de anúncio diferentes.`;
  }
  if (soGasto.length > 0) {
    return `${dinheiro(reais)} gastos em ${soGasto.length} campanha${soGasto.length === 1 ? "" : "s"} e nenhuma lead atribuída a elas. Ou os anúncios ainda não converteram, ou as leads estão chegando por um caminho que não registra a campanha de origem.`;
  }
  if (soLead.length > 0) {
    return `${leads} lead${leads === 1 ? "" : "s"} com campanha de origem identificada, e nenhum gasto registrado para essas campanhas. A conta de anúncios configurada no CRM não é a que produziu estas leads.`;
  }
  return "Sem investimento importado e sem lead com campanha de origem — não há as duas pontas para reconciliar.";
}

function menorData(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
function maiorData(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
