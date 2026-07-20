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
};

export const DISCARD_REASONS: DiscardReason[] = [
  {
    key: "duplicado",
    label: "Lead duplicado",
    description: "Registro repetido de um lead que já existe na base.",
    metaLeadStatus: "disqualified",
    metaCategory: "duplicate",
    decisionSignal: null,
  },
  {
    key: "contato_invalido",
    label: "Contato inválido (telefone/e-mail errados)",
    description: "Telefone ou e-mail incorretos; não há como falar com o lead.",
    metaLeadStatus: "disqualified",
    metaCategory: "invalid_contact_info",
    decisionSignal: null,
  },
  {
    key: "inalcancavel",
    label: "Sem resposta após tentativas",
    description: "Nenhuma resposta depois de múltiplas tentativas de contato.",
    metaLeadStatus: "disqualified",
    metaCategory: "unreachable",
    decisionSignal: null,
  },
  {
    key: "sem_interesse",
    label: "Sem interesse / desistiu",
    description: "O lead declarou não ter interesse ou desistiu da compra.",
    metaLeadStatus: "disqualified",
    metaCategory: "not_interested",
    decisionSignal: "indeciso",
  },
  {
    key: "fora_area",
    label: "Fora da área de atendimento",
    description: "Procura imóvel fora da região atendida pela operação.",
    metaLeadStatus: "disqualified",
    metaCategory: "out_of_service_area",
    decisionSignal: "localizacao",
  },
  {
    key: "orcamento_incompativel",
    label: "Orçamento incompatível",
    description: "Orçamento do lead não alcança o produto disponível.",
    metaLeadStatus: "disqualified",
    metaCategory: "budget_mismatch",
    decisionSignal: "preco",
  },
  {
    key: "financiamento_negado",
    label: "Crédito/financiamento negado",
    description: "Crédito ou financiamento reprovado na análise bancária.",
    metaLeadStatus: "disqualified",
    metaCategory: "not_qualified",
    decisionSignal: "financiamento",
  },
  {
    key: "produto_errado",
    label: "Produto procurado indisponível/errado",
    description: "Buscava tipologia ou produto que a operação não oferece.",
    metaLeadStatus: "disqualified",
    metaCategory: "wrong_product",
    decisionSignal: "produto",
  },
  {
    key: "comprou_concorrente",
    label: "Comprou com concorrente",
    description: "Fechou com concorrente sem compra verificada (verificada → usar o estágio comprou_outro).",
    metaLeadStatus: "disqualified",
    metaCategory: "purchased_from_competitor",
    decisionSignal: "concorrencia",
  },
  {
    key: "spam",
    label: "Spam / não é lead real",
    description: "Cadastro sem intenção real: spam, teste ou robô.",
    metaLeadStatus: "disqualified",
    metaCategory: "spam",
    decisionSignal: null,
  },
  {
    key: "motivo_nao_classificado",
    label: "Outro motivo",
    description: "Motivo não coberto pela taxonomia atual (fallback já usado pelo follow-up intelligence).",
    metaLeadStatus: "disqualified",
    metaCategory: "other",
    decisionSignal: "motivo_nao_classificado",
  },
];

export const DISCARD_REASON_KEYS = DISCARD_REASONS.map((reason) => reason.key);

export function getDiscardReason(value: unknown): DiscardReason | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return DISCARD_REASONS.find((reason) => reason.key === normalized) ?? null;
}

export function isValidDiscardReason(value: unknown): boolean {
  return getDiscardReason(value) !== null;
}
