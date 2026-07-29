// Taxonomia estruturada de motivos de descarte de lead (estágio "perdido").
//
// Por que ela existe: a Meta usa "CRM lead status feedback" (lead quality) para
// treinar a entrega das campanhas — leads descartados com um status
// `disqualified` categorizado ensinam o Andromeda a NÃO buscar perfis
// semelhantes. Cada motivo abaixo carrega:
//   - `metaLeadStatus`: sempre "disqualified" no vocabulário de CRM lead
//     status da Meta (a granularidade vai em `metaCategory`);
//   - `metaCategory`: a dimensão de qualidade que o loop Andromeda consome;
//   - `decisionSignal`: o sinal interno equivalente já existente em
//     lib/atlas/follow-up-intelligence.ts (SIGNALS), para NUNCA duplicar
//     vocabulário entre descarte, follow-up e objeções de WhatsApp.
//
// Governança: os motivos nascem INTERNOS (política negativeSignalsInternalOnly
// do andromeda-loop). O envio futuro de `lead_status = disqualified` à Meta
// exige o gate de decisão do diretor já existente em
// app/api/v1/integrations/meta/andromeda-loop/route.ts — os eventos gravados
// em lead_events já nascem no shape certo para essa sincronização.
//
// Harmonização com o funil: `comprou_concorrente` cobre perdas causadas por
// concorrência SEM compra verificada. Compra verificada em outro lugar deve
// usar o estágio `comprou_outro` (outcome buyer_profile), que gera o evento
// positivo BuyerProfile na Meta pelo fluxo existente.

export const DISCARD_TAXONOMY_VERSION = 1;

export type DiscardReason = {
  key: string;
  label: string;
  description: string;
  metaLeadStatus: "disqualified";
  metaCategory: string;
  decisionSignal: string | null;
  /**
   * O motivo pode ser PROVADO pelo registro, sem que ninguém tenha falado com
   * a pessoa?
   *
   * `true` em exatamente dois: `duplicado` e `contato_invalido`. Os dois
   * afirmam um fato sobre a LINHA — "é a mesma pessoa daquela linha mais
   * antiga", "não há canal por onde ligar" —, e nenhuma ligação mudaria a
   * resposta.
   *
   * `inalcancavel` é o tentador e fica de fora de propósito: "sem resposta
   * após tentativas" exige que alguém tenha tentado, e nesta operação ninguém
   * tentou (5 contatos registrados na vida inteira). O mesmo argumento já está
   * escrito em lib/crm/contact-attempts.ts — lead que ninguém alcançou não é
   * lead ruim. `fora_area` idem: DDD de outro estado NÃO é `out_of_service_area`
   * (o DDD diz onde a linha foi habilitada, não onde a pessoa mora), e é por
   * isso que a faixa "fora da praça" do corte da fila precisa dizer na tela que
   * ela não é este motivo.
   *
   * USO ATUAL: somente LEITURA. Nenhuma rota de descarte em lote deriva
   * autorização deste campo — ele nomeia o vocabulário da linha "telefone
   * repetido" da escada da fila, e nada mais.
   */
  provaNoRegistro: boolean;
};

export const DISCARD_REASONS: DiscardReason[] = [
  {
    key: "duplicado",
    label: "Lead duplicado",
    description: "Registro repetido de um lead que já existe na base.",
    metaLeadStatus: "disqualified",
    metaCategory: "duplicate",
    decisionSignal: null,
    provaNoRegistro: true,
  },
  {
    key: "contato_invalido",
    label: "Contato inválido (telefone/e-mail errados)",
    description: "Telefone ou e-mail incorretos; não há como falar com o lead.",
    metaLeadStatus: "disqualified",
    metaCategory: "invalid_contact_info",
    decisionSignal: null,
    provaNoRegistro: true,
  },
  {
    key: "inalcancavel",
    label: "Sem resposta após tentativas",
    description: "Nenhuma resposta depois de múltiplas tentativas de contato.",
    metaLeadStatus: "disqualified",
    metaCategory: "unreachable",
    decisionSignal: null,
    provaNoRegistro: false,
  },
  {
    key: "sem_interesse",
    label: "Sem interesse / desistiu",
    description: "O lead declarou não ter interesse ou desistiu da compra.",
    metaLeadStatus: "disqualified",
    metaCategory: "not_interested",
    decisionSignal: "indeciso",
    provaNoRegistro: false,
  },
  {
    key: "fora_area",
    label: "Fora da área de atendimento",
    description: "Procura imóvel fora da região atendida pela operação.",
    metaLeadStatus: "disqualified",
    metaCategory: "out_of_service_area",
    decisionSignal: "localizacao",
    provaNoRegistro: false,
  },
  {
    key: "orcamento_incompativel",
    label: "Orçamento incompatível",
    description: "Orçamento do lead não alcança o produto disponível.",
    metaLeadStatus: "disqualified",
    metaCategory: "budget_mismatch",
    decisionSignal: "preco",
    provaNoRegistro: false,
  },
  {
    key: "financiamento_negado",
    label: "Crédito/financiamento negado",
    description: "Crédito ou financiamento reprovado na análise bancária.",
    metaLeadStatus: "disqualified",
    metaCategory: "not_qualified",
    decisionSignal: "financiamento",
    provaNoRegistro: false,
  },
  {
    key: "produto_errado",
    label: "Produto procurado indisponível/errado",
    description: "Buscava tipologia ou produto que a operação não oferece.",
    metaLeadStatus: "disqualified",
    metaCategory: "wrong_product",
    decisionSignal: "produto",
    provaNoRegistro: false,
  },
  {
    key: "comprou_concorrente",
    label: "Comprou com concorrente",
    description: "Fechou com concorrente sem compra verificada (verificada → usar o estágio comprou_outro).",
    metaLeadStatus: "disqualified",
    metaCategory: "purchased_from_competitor",
    decisionSignal: "concorrencia",
    provaNoRegistro: false,
  },
  {
    key: "spam",
    label: "Spam / não é lead real",
    description: "Cadastro sem intenção real: spam, teste ou robô.",
    metaLeadStatus: "disqualified",
    metaCategory: "spam",
    decisionSignal: null,
    provaNoRegistro: false,
  },
  {
    key: "motivo_nao_classificado",
    label: "Outro motivo",
    description: "Motivo não coberto pela taxonomia atual (fallback já usado pelo follow-up intelligence).",
    metaLeadStatus: "disqualified",
    metaCategory: "other",
    decisionSignal: "motivo_nao_classificado",
    provaNoRegistro: false,
  },
];

export const DISCARD_REASON_KEYS = DISCARD_REASONS.map((reason) => reason.key);

/** Os motivos que o próprio registro prova. Leitura — nunca autorização. */
export const DISCARD_REASONS_PROVADOS = DISCARD_REASONS.filter((reason) => reason.provaNoRegistro).map((reason) => reason.key);

export function getDiscardReason(value: unknown): DiscardReason | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return DISCARD_REASONS.find((reason) => reason.key === normalized) ?? null;
}

export function isValidDiscardReason(value: unknown): boolean {
  return getDiscardReason(value) !== null;
}
