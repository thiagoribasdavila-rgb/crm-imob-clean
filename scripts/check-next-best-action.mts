/**
 * Check adversarial do núcleo NEXT-BEST-ACTION (lib/ai/next-best-action.ts).
 *
 * Cobre: ordenação por score (quente+caro primeiro), escolha de ação por estado,
 * valor esperado (null quando valor ausente), vazio, max, empates determinísticos,
 * determinismo e o resumo. ≥14 casos. failures[] acumula e exit 1 se houver.
 */

import {
  nextBestActions,
  chooseAction,
  playlistSummary,
  brl,
  type LeadSignal,
} from "../lib/ai/next-best-action.ts";

const failures: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) failures.push(msg); };
const eq = <T>(a: T, b: T, msg: string) => { if (a !== b) failures.push(`${msg} — esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const L = (over: Partial<LeadSignal> & { leadId: string }): LeadSignal => ({
  probability: 50,
  factors: [],
  ...over,
});

// 1. ordenação por score: quente+caro vem antes de quente+barato.
{
  const caro = L({ leadId: "a", name: "Ana", probability: 80, propertyValue: 1_000_000 });
  const barato = L({ leadId: "b", name: "Bruno", probability: 80, propertyValue: 200_000 });
  const out = nextBestActions([barato, caro]);
  eq(out[0].leadId, "a", "C1 caro deve vir primeiro");
  eq(out[0].priority, 1, "C1 priority do topo = 1");
  eq(out[1].priority, 2, "C1 priority do segundo = 2");
}

// 2. score = probabilidade × valor.
{
  const out = nextBestActions([L({ leadId: "a", probability: 60, propertyValue: 500_000 })]);
  eq(out[0].score, 60 * 500_000, "C2 score = prob × valor");
}

// 3. expectedValue = (prob/100) × valor, arredondado.
{
  const out = nextBestActions([L({ leadId: "a", probability: 60, propertyValue: 500_000 })]);
  eq(out[0].expectedValue, 300_000, "C3 expectedValue = 60% de 500k");
}

// 4. valor ausente → expectedValue null e score = probabilidade (não inventa).
{
  const out = nextBestActions([L({ leadId: "a", probability: 70 })]);
  eq(out[0].expectedValue, null, "C4 sem valor → expectedValue null");
  eq(out[0].score, 70, "C4 sem valor → score = probabilidade");
}

// 5. valor inválido (0 ou negativo) tratado como ausente.
{
  const zero = nextBestActions([L({ leadId: "a", probability: 50, propertyValue: 0 })]);
  const neg = nextBestActions([L({ leadId: "b", probability: 50, propertyValue: -10 })]);
  eq(zero[0].expectedValue, null, "C5 valor 0 → null");
  eq(neg[0].expectedValue, null, "C5 valor negativo → null");
}

// 6. lead com valor conhecido vem antes de lead sem valor (potencial calculável primeiro).
{
  const comValor = L({ leadId: "a", probability: 40, propertyValue: 300_000 });
  const semValor = L({ leadId: "b", probability: 95 });
  const out = nextBestActions([semValor, comValor]);
  eq(out[0].leadId, "a", "C6 com valor (score maior) vem antes do sem valor");
}

// 7. escolha de ação: quente + proposta pendente → enviar_proposta.
eq(chooseAction(L({ leadId: "x", probability: 80, stage: "proposta" })), "enviar_proposta", "C7 quente+proposta");

// 8. quente sem contato recente → ligar_agora.
eq(chooseAction(L({ leadId: "x", probability: 80, stage: "contato", lastContactDays: 5 })), "ligar_agora", "C8 quente sem contato recente");

// 9. quente sem info de contato → ligar_agora.
eq(chooseAction(L({ leadId: "x", probability: 80 })), "ligar_agora", "C9 quente default ligar");

// 10. frio → nutrir.
eq(chooseAction(L({ leadId: "x", probability: 20 })), "nutrir", "C10 frio → nutrir");

// 11. visita agendada com tarefa vencida → remarcar_visita (mesmo se quente).
eq(chooseAction(L({ leadId: "x", probability: 80, stage: "visita", overdueTaskCount: 1 })), "remarcar_visita", "C11 visita vencida");

// 12. morno parado há muito tempo → reengajar.
eq(chooseAction(L({ leadId: "x", probability: 45, lastContactDays: 10 })), "reengajar", "C12 morno parado → reengajar");

// 13. visita SEM tarefa vencida não vira remarcar (cai na regra de temperatura).
eq(chooseAction(L({ leadId: "x", probability: 80, stage: "visita", overdueTaskCount: 0 })), "ligar_agora", "C13 visita sem vencida → não remarca");

// 14. vazio: lista e resumo honestos.
{
  const out = nextBestActions([]);
  eq(out.length, 0, "C14 vazio → 0 ações");
  ok(playlistSummary(out).includes("Nenhuma"), "C14 resumo vazio honesto");
}

// 15. max limita a saída e reprioriza.
{
  const leads = [
    L({ leadId: "a", probability: 90, propertyValue: 1_000_000 }),
    L({ leadId: "b", probability: 80, propertyValue: 1_000_000 }),
    L({ leadId: "c", probability: 70, propertyValue: 1_000_000 }),
  ];
  const out = nextBestActions(leads, { max: 2 });
  eq(out.length, 2, "C15 max=2 corta em 2");
  eq(out[0].leadId, "a", "C15 topo preservado");
  eq(out[1].leadId, "b", "C15 segundo preservado");
}

// 16. max = 0 → vazio.
{
  const out = nextBestActions([L({ leadId: "a", probability: 50 })], { max: 0 });
  eq(out.length, 0, "C16 max=0 → vazio");
}

// 17. empate de score resolvido por probabilidade, depois leadId (determinístico).
{
  // mesmo score (prob×valor): 60×1000 == 40×1500 == 60000
  const p1 = L({ leadId: "z", probability: 60, propertyValue: 1000 });
  const p2 = L({ leadId: "a", probability: 40, propertyValue: 1500 });
  const out = nextBestActions([p1, p2]);
  eq(out[0].score, out[1].score, "C17 scores empatados");
  eq(out[0].leadId, "z", "C17 desempate por probabilidade maior (60 > 40)");
}

// 18. empate total (mesmo score e prob) → desempate por leadId asc.
{
  const p1 = L({ leadId: "m", probability: 50, propertyValue: 1000 });
  const p2 = L({ leadId: "b", probability: 50, propertyValue: 1000 });
  const out = nextBestActions([p1, p2]);
  eq(out[0].leadId, "b", "C18 empate total → leadId asc (b antes de m)");
}

// 19. determinismo: mesma entrada, mesma saída (JSON idêntico).
{
  const leads = [
    L({ leadId: "a", probability: 55, propertyValue: 400_000, factors: ["score comercial 80/100"] }),
    L({ leadId: "b", probability: 90, propertyValue: 800_000 }),
    L({ leadId: "c", probability: 30 }),
  ];
  const a = JSON.stringify(nextBestActions(leads));
  const b = JSON.stringify(nextBestActions(leads));
  eq(a, b, "C19 determinismo");
}

// 20. why cita o fator dominante quando presente.
{
  const out = nextBestActions([L({ leadId: "a", probability: 80, propertyValue: 500_000, factors: ["avanço no funil: proposta"], stage: "proposta" })]);
  ok(out[0].why.includes("avanço no funil: proposta"), "C20 why cita fator dominante");
  eq(out[0].action, "enviar_proposta", "C20 ação coerente com estado");
}

// 21. emoji canônico por ação.
{
  const out = nextBestActions([L({ leadId: "a", probability: 20 })]);
  eq(out[0].emoji, "🌱", "C21 nutrir → 🌱");
}

// 22. entrada suja: leadId vazio é descartado.
{
  const out = nextBestActions([L({ leadId: "", probability: 90 }), L({ leadId: "a", probability: 50 })]);
  eq(out.length, 1, "C22 leadId vazio descartado");
  eq(out[0].leadId, "a", "C22 sobra o válido");
}

// 23. probabilidade fora de faixa é saneada (>100 vira 100, <0 vira 0).
{
  const out = nextBestActions([L({ leadId: "a", probability: 250, propertyValue: 1000 })]);
  eq(out[0].score, 100 * 1000, "C23 prob>100 saneada para 100");
}

// 24. resumo soma potencial e aponta o topo.
{
  const leads = [
    L({ leadId: "a", name: "Ana", probability: 80, propertyValue: 1_000_000 }),
    L({ leadId: "b", name: "Bruno", probability: 50, propertyValue: 400_000 }),
  ];
  const out = nextBestActions(leads);
  const resumo = playlistSummary(out);
  ok(resumo.includes("Ana"), "C24 resumo cita o topo (Ana)");
  ok(resumo.includes("2 leads"), "C24 resumo conta os leads");
  // potencial = 0.8*1M + 0.5*400k = 800000 + 200000 = 1.000.000
  ok(resumo.includes(brl(1_000_000)), "C24 resumo soma o potencial");
}

// 25. resumo sem valor calculável não inventa cifra.
{
  const out = nextBestActions([L({ leadId: "a", name: "Ana", probability: 80 })]);
  const resumo = playlistSummary(out);
  ok(resumo.includes("não calculável"), "C25 resumo honesto sem valor");
  ok(!/R\$\s*\d/.test(resumo), "C25 resumo não inventa cifra em R$");
}

// 26. name derivado quando ausente (não vaza vazio).
{
  const out = nextBestActions([L({ leadId: "abcdef123456", probability: 50 })]);
  eq(out[0].name, "Lead abcdef12", "C26 name derivado do id");
}

// ---- veredito ----
if (failures.length > 0) {
  console.error(`❌ check-next-best-action: ${failures.length} falha(s):`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
const casos = 26;
console.log(`✅ check-next-best-action: ${casos} casos, 0 falhas.`);
