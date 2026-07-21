import { matchCampaign, productBrief, briefsForRotation, portfolioSummary, DEVELOPER_PORTFOLIO } from "../lib/atlas/developer-portfolio.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); };

// campanhas reais da conta (histórico da sessão)
t("'Spin Mood' → SPIN/Spin Mood", (() => { const m = matchCampaign("Spin Mood"); return m.developer === "SPIN Empreendimentos" && m.product === "Spin Mood"; })());
t("'Nova campanha de Leads Arvo' → Kallas/Arvo", (() => { const m = matchCampaign("Nova campanha de Leads Arvo"); return m.developer === "Kallas Incorporações" && m.product === "Arvo"; })());

// Tiê Aclimação — as variações plausíveis de nome de campanha
t("'Tiê Aclimação' → Shpaisman/Tiê Aclimação", (() => { const m = matchCampaign("Tiê Aclimação"); return m.developer === "Construtora Shpaisman" && m.product === "Tiê Aclimação"; })());
t("'[Atlas] Tie Aclimacao Leads' (sem acento) → resolve", matchCampaign("[Atlas] Tie Aclimacao Leads").product === "Tiê Aclimação");
// "Aclimação" sozinho não é alias de produto (evita colisão genérica de bairro,
// como provado acima) — sem "Tiê" no nome, cai honestamente no developer-only.
t("'Campanha Shpaisman Aclimação Julho' sem 'Tiê' → developer-only (honesto)", (() => { const m = matchCampaign("Campanha Shpaisman Aclimação Julho"); return m.developer === "Construtora Shpaisman" && m.product === null; })());
t("'[Atlas] Tiê Aclimação · investimento' (convenção real) → resolve o produto", matchCampaign("[Atlas] Tiê Aclimação · investimento").product === "Tiê Aclimação");
t("'Institucional Shpaisman' (sem produto) → developer sem produto", (() => { const m = matchCampaign("Institucional Shpaisman"); return m.developer === "Construtora Shpaisman" && m.product === null; })());
t("'Aclimação' sozinho NÃO casa (evita falso positivo genérico)", matchCampaign("Bairro Aclimação Notícias").developer === null);

// brief
{
  const b = productBrief("Tiê Aclimação");
  t("brief resolve", b !== null && b?.developer === "Construtora Shpaisman");
  t("brief não inventa preço/renda (sem dado no material)", b?.priceFrom === undefined && b?.incomeMinSm === undefined);
  t("brief marca delivered:false (breve lançamento)", b?.delivered === false);
  t("brief tem diferenciais reais (metrô, Paulista, lazer, tradição)", (b?.differentials?.length ?? 0) >= 4);
}
t("brief por alias sem acento resolve", productBrief("tie aclimacao")?.product === "Tiê Aclimação");

// Arvo (Kallas) — enriquecido com o book oficial "Arvo Teixeira da Silva" (2026-07)
t("'[Atlas] Arvo Teixeira da Silva Leads' → Kallas/Arvo", (() => { const m = matchCampaign("[Atlas] Arvo Teixeira da Silva Leads"); return m.developer === "Kallas Incorporações" && m.product === "Arvo"; })());
{
  const b = productBrief("Arvo");
  t("brief Arvo resolve → Kallas", b !== null && b?.developer === "Kallas Incorporações");
  t("brief Arvo tem bairro Paraíso e priceFrom R$399k (peça aprovada)", b?.neighborhood === "Paraíso" && b?.priceFrom === 399000);
  t("brief Arvo marca lançamento (delivered:false) e metrô 800m", b?.delivered === false && b?.metroDistanceM === 800);
  t("brief Arvo NÃO inventa faixa de renda (HMP/HIS-2 sem SM no book)", b?.incomeMinSm === undefined && b?.incomeMaxSm === undefined);
  t("brief Arvo tem ≥5 diferenciais reais (Paulista, Ibirapuera, lazer, terraço...)", (b?.differentials?.length ?? 0) >= 5);
}
t("brief Arvo por alias 'arvo teixeira da silva' resolve", productBrief("arvo teixeira da silva")?.product === "Arvo");

// rotação recebe o novo produto
{
  const briefs = briefsForRotation();
  t("rotação inclui Tiê Aclimação", "Tiê Aclimação" in briefs);
  t("rotação agora tem 3 produtos com brief (SPIN, Arvo, Tiê)", Object.keys(briefs).length === 3);
}

// summary: Shpaisman sai da lista de pendentes; Paladin/Teixeira Duarte continuam
{
  const s = portfolioSummary();
  t("5 incorporadoras · 3 produtos", s.developers === 5 && s.products === 3);
  t("Shpaisman não é mais pendente", !s.pendentes.includes("Construtora Shpaisman"));
  t("Paladin e Teixeira Duarte seguem pendentes (sem invenção)", s.pendentes.includes("Paladin") && s.pendentes.includes("Teixeira Duarte"));
}

// integridade estrutural do rol (regressão)
{
  const all = DEVELOPER_PORTFOLIO.flatMap((d) => d.aliases.map((a) => a.toLowerCase()));
  t("aliases de incorporadora seguem únicos", new Set(all).size === all.length);
  const prodAliases = DEVELOPER_PORTFOLIO.flatMap((d) => d.products.flatMap((p) => p.aliases.map((a) => a.toLowerCase())));
  t("aliases de produto (dentro de cada incorporadora) sem duplicata acidental", new Set(prodAliases).size === prodAliases.length);
}

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
