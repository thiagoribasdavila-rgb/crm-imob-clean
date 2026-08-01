type RealEstateSnapshot = {
  portfolio?: {
    developments?: number;
    inventory?: number;
    available?: number;
    reserved?: number;
    sold?: number;
    absorptionPercent?: number;
    availableVgv?: number;
  };
  commercial?: {
    leads?: number;
    hotLeads?: number;
    overdueNextActions?: number;
    withoutNextAction?: number;
    openOpportunities?: number;
    pipelineValue?: number;
    weightedForecast?: number;
  };
  materials?: { current?: number; expired?: number };
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function value(input: number | undefined) {
  return Number.isFinite(input) ? Number(input) : 0;
}

export function buildFallbackRealEstateAnswer(question: string, snapshot: RealEstateSnapshot) {
  const portfolio = snapshot.portfolio ?? {};
  const commercial = snapshot.commercial ?? {};
  const materials = snapshot.materials ?? {};
  const normalized = question.toLowerCase();
  const priorities: string[] = [];

  if (value(commercial.overdueNextActions) > 0) priorities.push(`Recuperar **${value(commercial.overdueNextActions)} ações atrasadas** antes de ampliar a prospecção.`);
  if (value(commercial.withoutNextAction) > 0) priorities.push(`Definir próxima ação para **${value(commercial.withoutNextAction)} leads** sem cadência registrada.`);
  if (value(commercial.hotLeads) > 0) priorities.push(`Atacar os **${value(commercial.hotLeads)} leads quentes** validando aderência financeira e produto disponível.`);
  if (value(materials.expired) > 0) priorities.push(`Atualizar **${value(materials.expired)} materiais vencidos** antes de compartilhar tabela ou espelho.`);
  if (!priorities.length) priorities.push("Revisar a qualidade dos dados e manter a cadência comercial do time.");

  let specific = "Cruze intenção, recência, capacidade financeira e disponibilidade real antes de recomendar uma unidade.";
  if (/selic|juro|financ|crédito|mcmv/.test(normalized)) specific = "Use a conversa como triagem educacional. Taxa, subsídio e aprovação precisam ser confirmados pelo agente financeiro.";
  if (/estoque|unidade|espelho|dispon/.test(normalized)) specific = `Existem **${value(portfolio.available)} unidades disponíveis** no escopo atual. Confirme o espelho vigente antes de prometer disponibilidade.`;
  if (/forecast|pipeline|previs/.test(normalized)) specific = `O pipeline aberto é **${brl.format(value(commercial.pipelineValue))}** e o forecast ponderado é **${brl.format(value(commercial.weightedForecast))}**; trate o forecast como probabilidade, não como receita garantida.`;
  if (/material|book|tabela|espelho/.test(normalized)) specific = `O hub possui **${value(materials.current)} materiais vigentes** e **${value(materials.expired)} vencidos** no escopo consultado.`;

  return [
    "## Leitura",
    `O Atlas consultou **${value(commercial.leads)} leads**, **${value(portfolio.inventory)} unidades** e **${value(portfolio.developments)} projetos** dentro do seu escopo. A absorção registrada é de **${value(portfolio.absorptionPercent)}%** e o VGV disponível é **${brl.format(value(portfolio.availableVgv))}**.`,
    "",
    "## Prioridades",
    ...priorities.slice(0, 3).map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Próxima ação",
    specific,
    "",
    "## Validações necessárias",
    "- Confirme estoque, tabela e espelho vigentes antes de falar com o cliente.",
    "- Valide renda, documentação, taxas e aprovação diretamente com o agente financeiro.",
    "- Esta resposta foi gerada pelo motor imobiliário local porque o provedor generativo não estava disponível.",
  ].join("\n");
}
