// As 48 páginas-casca dos grupos especulativos foram REMOVIDAS em 2026-07-26,
// não apenas quarentenadas: nenhuma das 48 consumia dado real (média de 15
// linhas, zero fetch, zero supabase). Quarentenar casca é carregar peso morto no
// repositório e no inventário mental de quem audita.
//
// O git preserva tudo em checkpoint/antes-remocao-cascas. As ideias por trás de
// algumas delas já vivem melhor implementadas: predição em conversion-predictor,
// equilíbrio de verba no stop loss, varredura de mercado no Perplexity.
export const legacyRoutePaths = [
  "app/(atlas)",
  "app/analytics",
  "app/(crm)/pipedrive",
  "app/(crm)/pipeline/cold",
  "app/(crm)/pipeline/warm",
  "app/(crm)/pipeline/hot",
  "app/(crm)/pipeline/[stage]",
  "app/(crm)/leads/edit",
  "app/(crm)/leads/table",
  "app/(crm)/tasks/[id]",
  "app/api/leads",
];
