import "server-only";

const SIGNALS = [
  ["preco", /pre[cç]o|valor|desconto|caro|barato/i],
  ["localizacao", /bairro|regi[aã]o|localiza[cç][aã]o|perto|dist[aâ]ncia/i],
  ["financiamento", /financi|cr[eé]dito|entrada|parcela|banco/i],
  ["disponibilidade", /unidade|estoque|dispon[ií]vel|planta/i],
  ["prazo", /prazo|entrega|mudan[cç]a|urg[eê]ncia/i],
  ["produto", /quarto|su[ií]te|vaga|metragem|andar|varanda/i],
  ["concorrencia", /concorr|outra incorporadora|outro empreendimento|outra imobili[aá]ria/i],
] as const;

export function extractFollowUpSignals(description: string) {
  const normalized = description.trim().slice(0, 4000);
  const signals = SIGNALS.filter(([, pattern]) => pattern.test(normalized)).map(([signal]) => signal);
  return {
    buyer_verified: true,
    purchase_outside_company: true,
    decision_signals: signals.length ? signals : ["motivo_nao_classificado"],
    description_present: normalized.length >= 10,
  };
}
