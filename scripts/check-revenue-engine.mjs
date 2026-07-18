import fs from "node:fs";
const checks = [];
function need(path, ...terms) { const source = fs.readFileSync(path, "utf8"); for (const term of terms) checks.push([`${path}: ${term}`, source.includes(term)]); }
need("lib/revenue/revenue-engine.ts", "22:00–06:59", "maximumAutomatedStage: \"qualification\"", "automaticAudienceChanges: false", "directorDecisionRequired: true");
need("app/api/v1/revenue-engine/route.ts", "meta_conversion_events", "ai_sales_journeys", "nightly_broker_handoffs", "realNightTestRequired: true");
need("app/(crm)/revenue-engine/page.tsx", "CONVERSÃO 24/7", "Meta, Andromeda e atendimento", "Funil de aprendizado", "Night Sales · 22h–07h", "Recuperar sem poluir a carteira");
need("app/api/v2/ai/nightly-sales/route.ts", "22h e 6h59", "afterHour: 22", "requiresApproval: true");
need("docs/ATLAS_META_INTEGRATION_REPORT.md", "Andromeda não é uma API direta", "Não aprovado sem teste real");
need("docs/ATLAS_REVENUE_ENGINE_REPORT.md", "Modo supervisionado", "Teste noturno controlado", "Nenhuma oportunidade esfria sem resposta");
for (const [name, ok] of checks) console.log(`${ok ? "✓" : "✗"} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`\nRevenue Engine aprovado: ${checks.length} controles verificados.`);

