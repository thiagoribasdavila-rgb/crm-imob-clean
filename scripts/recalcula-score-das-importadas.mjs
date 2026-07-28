/**
 * Recalcula o score das leads que entraram por IMPORTAÇÃO e ficaram em zero.
 *
 * Por que existe: a criação por API sempre pontuou; a importação não. Medido em
 * 2026-07-28: 193 das 200 leads com score 0, todas importadas. A fila do
 * corretor ordena por score — a base inteira entrou empatada.
 *
 * A causa já foi corrigida em app/api/v1/leads/import/route.ts; este script é
 * só para as que já estavam lá.
 *
 * NADA É INVENTADO: usa a MESMA régua determinística do produto
 * (lib/atlas/scoring), que só soma o que a lead tem. Sem os campos, pontua
 * baixo — e é para pontuar baixo mesmo.
 *
 * Só sobe score de quem está em ZERO. Nunca rebaixa, nunca toca em lead que já
 * tem número — se alguém ajustou à mão, a mão vence.
 *
 * Uso:
 *   node scripts/recalcula-score-das-importadas.mjs            (simula)
 *   node scripts/recalcula-score-das-importadas.mjs --aplicar  (grava)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const APLICAR = process.argv.includes("--aplicar");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * Mesma régua de lib/atlas/scoring.ts. Reproduzida aqui porque o módulo do
 * produto arrasta `server-only` e não carrega fora do Next — e um contrato
 * (tests/contracts/score-da-importacao.test.mjs) garante que as duas listas de
 * pontos não divirjam.
 */
const REGRAS = [
  ["email", 10, (l) => Boolean(l.email)],
  ["phone", 15, (l) => Boolean(l.phone)],
  ["budget", 20, (l) => Number(l.budget_max) > 0],
  ["regions", 10, (l) => Array.isArray(l.preferred_regions) && l.preferred_regions.length > 0],
  ["bedrooms", 5, (l) => l.bedrooms !== null && l.bedrooms !== undefined],
  ["purpose", 10, (l) => Boolean(l.purpose)],
  ["interaction", 15, (l) => Boolean(l.last_interaction_at)],
  ["nextAction", 5, (l) => Boolean(l.next_action_at)],
  ["funnel", 20, (l) => ["visita", "proposta", "contrato"].includes(String(l.status ?? ""))],
];

const pontuar = (lead) =>
  Math.min(100, REGRAS.reduce((total, [, pontos, testa]) => total + (testa(lead) ? pontos : 0), 0));

const { data: leads, error } = await admin
  .from("leads")
  .select("id,email,phone,budget_max,preferred_regions,bedrooms,purpose,last_interaction_at,next_action_at,status,score,import_batch_id")
  .or("score.is.null,score.eq.0")
  .limit(2000);
if (error) throw new Error(error.message);

const alvo = (leads ?? []).filter((l) => pontuar(l) > 0);
const distribuicao = {};
for (const l of alvo) {
  const p = pontuar(l);
  distribuicao[p] = (distribuicao[p] ?? 0) + 1;
}

console.log(`leads em zero: ${leads?.length ?? 0}`);
console.log(`que ganham score: ${alvo.length}`);
console.log(`importadas: ${alvo.filter((l) => l.import_batch_id).length} · criadas de outro jeito: ${alvo.filter((l) => !l.import_batch_id).length}`);
console.log("\ndistribuição do novo score:");
for (const [pontos, quantas] of Object.entries(distribuicao).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(`  ${String(pontos).padStart(3)} pontos: ${quantas} lead(s)`);
}

if (!APLICAR) {
  console.log("\nSIMULAÇÃO — nada foi gravado. Rode com --aplicar para gravar.");
  process.exit(0);
}

let gravadas = 0;
for (let i = 0; i < alvo.length; i += 50) {
  const lote = alvo.slice(i, i + 50);
  for (const lead of lote) {
    const pontos = pontuar(lead);
    // `.eq("score", 0)` no WHERE (mais o is-null) evita sobrescrever quem
    // ganhou score entre a leitura e a escrita.
    const { error: erroUpdate } = await admin
      .from("leads")
      .update({ score: pontos, score_ia: pontos })
      .eq("id", lead.id)
      .or("score.is.null,score.eq.0");
    if (erroUpdate) console.log(`  falhou ${lead.id}: ${erroUpdate.message}`);
    else gravadas += 1;
  }
}
console.log(`\ngravadas: ${gravadas}`);
