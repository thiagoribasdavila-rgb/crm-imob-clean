/**
 * Teste adversarial do motor de inteligência proativa por hierarquia
 * (lib/ai/proactive-hierarchy).
 *
 * Standalone, sem framework, no estilo dos scripts/check-*: acumula falhas em
 * pt-BR num array e sai com código 1 se qualquer caso reprovar.
 * Rodar com: node scripts/check-proactive-hierarchy.ts
 * (Node >= 22.18 executa TypeScript por type-stripping; o único import do módulo
 * alvo é `import type`, apagado em runtime — nada de alias "@/").
 */

import { proactiveNudges, nudgeDigest, type ProactiveInput, type Role, type Nudge } from "../lib/ai/proactive-hierarchy.ts";

const failures: string[] = [];
let executados = 0;

function esperar(cond: boolean, msg: string): void {
  if (!cond) failures.push(msg);
}
function caso(nome: string, fn: () => void): void {
  executados += 1;
  try {
    fn();
  } catch (err: unknown) {
    failures.push(`${nome}: exceção inesperada — ${err instanceof Error ? err.message : String(err)}`);
  }
}

const scopes = (ns: Nudge[]): string[] => ns.map((n) => n.scope);
const emojis = (ns: Nudge[]): string[] => ns.map((n) => n.emoji);
const isCalm = (ns: Nudge[]): boolean => ns.length === 1 && ns[0]!.emoji === "✅" && ns[0]!.urgency === 1;
const ordenado = (ns: Nudge[]): boolean => ns.every((n, i) => i === 0 || ns[i - 1]!.urgency >= n.urgency);

// Input "cheio" com sinal para todo mundo — usado para provar isolamento de escopo.
const cheio: ProactiveInput = {
  plan: { summary: { desperdicioSemanal: 1200, economiaPotencial: 800, produtosEficientes: 2, produtosCaros: 2 } },
  creativeHealth: [
    { campaignName: "Alfa", andromedaScore: 30, fatigueCount: 2 },
    { campaignName: "Beta", andromedaScore: 70, fatigueCount: 0 },
  ],
  pendingApprovals: 3,
  teamSlaBreaches: 4,
  brokerOverdueTasks: 6,
  brokerHotLeads: 3,
  forecast: { anomalies: ["CPL do Produto X dobrou em 3 dias"] },
};

// 1. Diretor vê SÓ o seu mundo: verba/aprovações/anomalia — nunca carteira nem time.
caso("caso 1: diretor não vê escopo de carteira nem time", () => {
  const ns = proactiveNudges("director", cheio);
  esperar(ns.length > 0, "diretor deveria ter nudges com input cheio");
  esperar(!scopes(ns).includes("carteira"), "diretor NÃO pode receber nudge de carteira");
  esperar(!scopes(ns).includes("time") || ns.every((n) => n.role === "director"), "role deve ser sempre director");
  esperar(ns.every((n) => n.role === "director"), "todo nudge do diretor deve ter role=director");
});

// 2. Corretor NUNCA recebe nudge de verba (nem aprovação/anomalia).
caso("caso 2: corretor nunca recebe verba/aprovação/anomalia", () => {
  const ns = proactiveNudges("broker", cheio);
  esperar(ns.every((n) => n.scope === "carteira"), "corretor só enxerga a carteira");
  esperar(ns.every((n) => n.emoji !== "💰" && n.emoji !== "✋"), "corretor não pode ver verba nem aprovação");
  esperar(ns.every((n) => n.role === "broker"), "role deve ser broker");
});

// 3. Ordenação por urgency (desc) em todos os papéis.
caso("caso 3: nudges ordenados por urgency desc", () => {
  for (const role of ["director", "superintendent", "manager", "broker"] as Role[]) {
    const ns = proactiveNudges(role, cheio);
    esperar(ordenado(ns), `nudges de ${role} fora de ordem: ${ns.map((n) => n.urgency).join(",")}`);
  }
});

// 4. Todo nudge tem emoji não-vazio e demais campos preenchidos.
caso("caso 4: emojis e campos presentes", () => {
  for (const role of ["director", "superintendent", "manager", "broker"] as Role[]) {
    const ns = proactiveNudges(role, cheio);
    for (const n of ns) {
      esperar(n.emoji.length > 0, `emoji vazio em ${role}`);
      esperar(n.title.length > 0 && n.detail.length > 0 && n.action.length > 0, `campo textual vazio em ${role}`);
      esperar(n.urgency >= 1 && n.urgency <= 5, `urgency fora de 1..5 em ${role}: ${n.urgency}`);
    }
  }
});

// 5. Input vazio → cada papel recebe exatamente 1 nudge calmo (✅, urgency 1).
caso("caso 5: input vazio vira nudge calmo por papel", () => {
  for (const role of ["director", "superintendent", "manager", "broker"] as Role[]) {
    const ns = proactiveNudges(role, {});
    esperar(isCalm(ns), `${role} sem sinal deveria receber 1 nudge calmo, veio ${JSON.stringify(ns)}`);
  }
});

// 6. Anomalia preditiva vira nudge do DIRETOR (📉, urgency 5).
caso("caso 6: anomalia preditiva é nudge do diretor", () => {
  const ns = proactiveNudges("director", { forecast: { anomalies: ["Queda de conversão no Produto Y"] } });
  const anomalia = ns.find((n) => n.emoji === "📉");
  esperar(!!anomalia, "diretor deveria ter nudge de anomalia (📉)");
  esperar(anomalia?.urgency === 5, "anomalia preditiva deveria ser urgency 5");
  esperar(anomalia?.scope === "comercial", "anomalia é escopo comercial");
});

// 7. Corretor com lead quente → 🔥 e escopo carteira; muitos leads = urgency 5.
caso("caso 7: lead quente vira nudge 🔥 do corretor", () => {
  const um = proactiveNudges("broker", { brokerHotLeads: 1 });
  esperar(um[0]!.emoji === "🔥" && um[0]!.scope === "carteira", "1 lead quente deveria ser 🔥/carteira");
  esperar(um[0]!.urgency === 4, "1 lead quente = urgency 4");
  const muitos = proactiveNudges("broker", { brokerHotLeads: 5 });
  esperar(muitos[0]!.urgency === 5, "5 leads quentes = urgency 5");
});

// 8. Corretor com tarefa vencida → ⏰; e com lead quente + vencida, quente vem antes.
caso("caso 8: tarefa vencida (⏰) e ordem quente > vencida", () => {
  const soVencida = proactiveNudges("broker", { brokerOverdueTasks: 2 });
  esperar(soVencida[0]!.emoji === "⏰" && soVencida[0]!.urgency === 4, "2 tarefas vencidas = ⏰/urgency 4");
  const ambos = proactiveNudges("broker", { brokerHotLeads: 3, brokerOverdueTasks: 1 });
  esperar(ambos.length === 2, "corretor deveria ter 2 nudges");
  esperar(ambos[0]!.emoji === "🔥", "lead quente (u5) deve vir antes da tarefa vencida (u4)");
});

// 9. Superintendente vê eficiência de marketing (criativo) + SLA de times, e nada de carteira.
caso("caso 9: superintendente = marketing + time", () => {
  const ns = proactiveNudges("superintendent", cheio);
  const s = new Set(scopes(ns));
  esperar(s.has("marketing"), "superintendente deveria ter nudge de marketing");
  esperar(s.has("time"), "superintendente deveria ter nudge de time (SLA)");
  esperar(!s.has("carteira"), "superintendente não vê carteira");
  esperar(ns.every((n) => n.role === "superintendent"), "role deve ser superintendent");
});

// 10. Gestor vê SLA do time + saúde criativa; sem carteira e sem verba/aprovação.
caso("caso 10: gestor = time + saúde criativa, sem verba", () => {
  const ns = proactiveNudges("manager", cheio);
  const s = new Set(scopes(ns));
  esperar(s.has("time"), "gestor deveria ter nudge de time");
  esperar(s.has("marketing"), "gestor deveria ter nudge de saúde criativa");
  esperar(!s.has("carteira"), "gestor não vê carteira");
  esperar(!emojis(ns).includes("💰") && !emojis(ns).includes("✋"), "gestor não vê verba nem aprovação");
});

// 11. Diretor: aprovações paradas viram nudge ✋ e verba vira 💰.
caso("caso 11: aprovações (✋) e verba (💰) do diretor", () => {
  const ns = proactiveNudges("director", cheio);
  esperar(emojis(ns).includes("✋"), "diretor deveria ter nudge de aprovação (✋)");
  esperar(emojis(ns).includes("💰"), "diretor deveria ter nudge de verba (💰)");
  esperar(emojis(ns).includes("📉"), "diretor deveria ter nudge de anomalia (📉)");
  // anomalia (5) e aprovações>=3 (5) antes de verba com produtos caros (4)
  const verba = ns.find((n) => n.emoji === "💰");
  esperar(verba?.urgency === 4, "verba com produtos caros = urgency 4");
});

// 12. Plano sem desperdício e sem produtos caros NÃO gera nudge de verba.
caso("caso 12: plano saudável não gera nudge de verba", () => {
  const ns = proactiveNudges("director", {
    plan: { summary: { desperdicioSemanal: 0, economiaPotencial: 0, produtosEficientes: 5, produtosCaros: 0 } },
  });
  esperar(isCalm(ns), `plano saudável e sem outros sinais deveria ser calmo, veio ${JSON.stringify(ns)}`);
});

// 13. Saúde criativa saudável (score alto, sem fadiga) não gera nudge de marketing.
caso("caso 13: criativo saudável não alarma superintendente/gestor", () => {
  const bom: ProactiveInput = { creativeHealth: [{ campaignName: "Ok", andromedaScore: 85, fatigueCount: 0 }] };
  esperar(isCalm(proactiveNudges("superintendent", bom)), "superintendente com criativo bom deveria ser calmo");
  esperar(isCalm(proactiveNudges("manager", bom)), "gestor com criativo bom deveria ser calmo");
});

// 14. nudgeDigest: 1 linha; distingue calmo de urgente.
caso("caso 14: nudgeDigest é 1 linha e reconhece calmo/urgente", () => {
  const calmo = nudgeDigest(proactiveNudges("director", {}));
  esperar(!calmo.includes("\n"), "digest deve ter 1 linha só");
  esperar(/tudo em dia/i.test(calmo), `digest calmo deveria dizer 'tudo em dia', veio: ${calmo}`);
  const urgente = nudgeDigest(proactiveNudges("broker", { brokerHotLeads: 3 }));
  esperar(!urgente.includes("\n"), "digest urgente deve ter 1 linha só");
  esperar(/urgente/i.test(urgente), `digest com urgência deveria citar 'urgente', veio: ${urgente}`);
});

// 15. worstCreative: com várias campanhas, alarma pela PIOR (menor score).
caso("caso 15: alarme criativo escolhe a pior campanha", () => {
  const ns = proactiveNudges("manager", {
    creativeHealth: [
      { campaignName: "Saudavel", andromedaScore: 90, fatigueCount: 0 },
      { campaignName: "Doente", andromedaScore: 20, fatigueCount: 3 },
    ],
  });
  const criativo = ns.find((n) => n.scope === "marketing");
  esperar(!!criativo && criativo.detail.includes("20/100"), `deveria citar a pior (Doente/20), veio: ${JSON.stringify(ns)}`);
  esperar(!!criativo && criativo.title.includes("Doente"), "título deveria citar a campanha pior");
});

// 16. Determinismo: mesma entrada, mesma saída (núcleo puro).
caso("caso 16: saída determinística", () => {
  const a = JSON.stringify(proactiveNudges("director", cheio));
  const b = JSON.stringify(proactiveNudges("director", cheio));
  esperar(a === b, "proactiveNudges deveria ser determinística");
});

// 17. Nenhum papel vaza nudge de outro papel (role sempre bate com o pedido).
caso("caso 17: role do nudge sempre bate com o papel pedido", () => {
  for (const role of ["director", "superintendent", "manager", "broker"] as Role[]) {
    const ns = proactiveNudges(role, cheio);
    esperar(ns.every((n) => n.role === role), `${role} recebeu nudge de outro papel`);
  }
});

// ---- desfecho ----
if (failures.length > 0) {
  console.error(`\n❌ check-proactive-hierarchy: ${failures.length} falha(s) de ${executados} casos:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\n✅ check-proactive-hierarchy: ${executados} casos, todos passaram.`);
