/**
 * PROVA: o funil da sala de comando é o funil DA EMPRESA, e a frase da etapa
 * vazia diz a verdade.
 *
 * ── OS DOIS DEFEITOS QUE ISTO EXISTE PARA IMPEDIR ───────────────────────────
 *
 * 1. ETAPA QUE NÃO EXISTE. A primeira versão da rota cravou seis etapas no
 *    código, entre elas `negociacao`. Medido contra `pipeline_stage_settings`
 *    da organização: `negociacao` NÃO É ETAPA — é apelido de `proposta` na régua
 *    canônica. E `contrato`, que a organização configurou e por onde 3 leads
 *    passaram, não aparecia. A tela desenhava uma barra impossível e escondia
 *    uma real.
 *
 * 2. FRASE HONESTA NA FORMA, FALSA NO CONTEÚDO. Toda etapa vazia recebia
 *    "o funil não está travado aqui, ele não chegou até aqui". Medido contra
 *    `pipeline_stage_moves`: 2 leads alcançaram visita, 3 alcançaram proposta,
 *    3 alcançaram contrato. Elas CHEGARAM E SAÍRAM. "Não chegou" manda empurrar
 *    topo de funil; "vazou" manda descobrir quem largou a lead depois da visita.
 *    São decisões opostas, e a frase convencia da errada.
 *
 * ── POR QUE ESTA PROVA NÃO PODE SER SÓ "A ROTA RESPONDE 200" ────────────────
 *
 * Ela compara, campo a campo, a resposta HTTP com uma consulta independente ao
 * banco. Se alguém recravar as etapas no código, a lista deixa de bater com
 * `pipeline_stage_settings` e esta prova cai — que é o ponto.
 *
 * Uso: node scripts/prova-funil-da-sala-de-comando.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const APP = process.env.TESTE_BASE_URL || "http://localhost:3000";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0;
let falhou = 0;
const conferir = (titulo, condicao, detalhe) => {
  console.log(`${condicao ? "  ✔" : "  ✘"} ${titulo}${detalhe ? ` — ${detalhe}` : ""}`);
  if (condicao) ok += 1; else falhou += 1;
};

// ── A verdade, lida direto do banco (o outro caminho) ───────────────────────
const { data: leads } = await admin.from("leads").select("organization_id").limit(2000);
const porOrg = new Map();
for (const l of leads ?? []) porOrg.set(l.organization_id, (porOrg.get(l.organization_id) ?? 0) + 1);
const org = [...porOrg.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

const { data: config } = await admin
  .from("pipeline_stage_settings").select("stage_key,position,visible").eq("organization_id", org);
const { data: movs } = await admin
  .from("pipeline_stage_moves").select("lead_id,to_stage,occurred_at").eq("organization_id", org);

const TERMINAIS = new Set(["ganho", "perdido", "comprou_outro"]);
const etapasEsperadas = (config ?? [])
  .filter((c) => !TERMINAIS.has(c.stage_key) && c.visible !== false)
  .sort((a, b) => a.position - b.position)
  .map((c) => c.stage_key);

const passaramPorEtapa = new Map();
for (const m of movs ?? []) {
  if (!m.to_stage || !m.lead_id) continue;
  if (!passaramPorEtapa.has(m.to_stage)) passaramPorEtapa.set(m.to_stage, new Set());
  passaramPorEtapa.get(m.to_stage).add(m.lead_id);
}

console.log(`\norganização ${org}`);
console.log(`  etapas configuradas (abertas): ${etapasEsperadas.join(" → ")}`);
console.log(`  já passaram: ${[...passaramPorEtapa].map(([k, v]) => `${k}=${v.size}`).join(" · ")}\n`);

const email = `prova-funil-${Date.now()}@atlas-teste.local`;
const senha = "Prova!Funil4cC";
let userId = null;

try {
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(e1.message);
  userId = u.user.id;
  await admin.from("profiles").upsert({
    id: userId, name: "Prova Funil", full_name: "Prova Funil", email, organization_id: org,
    role: "admin", access_role: "admin", commercial_role: "director", active: true,
  });
  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: sess, error: e3 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(e3.message);

  const r = await fetch(`${APP}/api/v1/analytics/sala-de-comando`, {
    headers: { authorization: `Bearer ${sess.session.access_token}` },
  });
  const corpo = await r.json().catch(() => null);
  const d = corpo?.data;
  conferir("a rota responde", r.status === 200, `http ${r.status}`);
  if (!d) throw new Error("sem corpo para conferir");

  const chavesNaTela = d.funil.map((e) => e.chave);
  console.log(`  funil devolvido: ${chavesNaTela.join(" → ")}\n`);

  // ── 1. As etapas são as da EMPRESA, não as do código ─────────────────────
  conferir(
    "as etapas do funil são exatamente as configuradas pela organização, na ordem dela",
    JSON.stringify(chavesNaTela) === JSON.stringify(etapasEsperadas),
    `tela [${chavesNaTela}] · banco [${etapasEsperadas}]`,
  );
  conferir(
    "a etapa inexistente `negociacao` NÃO é desenhada",
    !chavesNaTela.includes("negociacao"),
    chavesNaTela.includes("negociacao") ? "ainda presente" : "ausente",
  );
  conferir(
    "a etapa `contrato`, que a organização configurou, é desenhada",
    chavesNaTela.includes("contrato"),
    chavesNaTela.includes("contrato") ? "presente" : "AUSENTE",
  );

  // ── 2. "já passaram" bate com o banco, etapa por etapa ───────────────────
  let divergiu = null;
  for (const etapa of d.funil) {
    const esperado = passaramPorEtapa.get(etapa.chave)?.size ?? 0;
    if (etapa.jaPassaram !== esperado) divergiu = `${etapa.chave}: tela ${etapa.jaPassaram} · banco ${esperado}`;
  }
  conferir("o \"já passaram\" de cada etapa bate com pipeline_stage_moves", !divergiu, divergiu ?? "todas conferem");

  // ── 3. A FRASE. Este é o conserto que motivou tudo ───────────────────────
  const vaziasComPassagem = d.funil.filter((e) => e.quantidade === 0 && e.jaPassaram > 0);
  const vaziasSemPassagem = d.funil.filter((e) => e.quantidade === 0 && e.jaPassaram === 0);
  console.log(`\n  etapas vazias POR ONDE JÁ PASSARAM leads: ${vaziasComPassagem.map((e) => `${e.chave}(${e.jaPassaram})`).join(", ") || "(nenhuma)"}`);

  conferir(
    "existe ao menos uma etapa vazia por onde leads já passaram (senão a prova é vazia)",
    vaziasComPassagem.length > 0,
    `${vaziasComPassagem.length} etapa(s)`,
  );
  conferir(
    "nessas, a tela diz que VAZOU — nunca que não chegou",
    vaziasComPassagem.every((e) => /vazou|esvaziou/.test(e.porqueVazia ?? "") && !/não chegou até aqui/.test(e.porqueVazia ?? "")),
    vaziasComPassagem[0]?.porqueVazia?.slice(0, 110),
  );
  conferir(
    "onde ninguém passou, a tela diz que ninguém alcançou a etapa",
    vaziasSemPassagem.every((e) => /nenhuma passou|não chegou|ainda estão/.test(e.porqueVazia ?? "")),
    vaziasSemPassagem[0]?.porqueVazia?.slice(0, 110) ?? "(não há etapa assim hoje)",
  );

  // ── 4. Procedência: a tela sabe desde quando mede ────────────────────────
  const p = d.procedencia;
  conferir("a resposta declara desde quando existe registro de movimentação", Boolean(p?.registroDeMovimentoDesde),
    p?.registroDeMovimentoDesde ?? "AUSENTE");
  conferir("a resposta declara se a amostra foi truncada", typeof p?.amostraTruncada === "boolean",
    `truncada=${p?.amostraTruncada}`);
  conferir("a leitura de leads NÃO está truncada hoje", p?.amostraTruncada === false,
    `${d.indicadores.leadsTotais} leads lidos`);
  conferir("os movimentos lidos batem com o banco", p?.movimentosLidos === (movs ?? []).length,
    `tela ${p?.movimentosLidos} · banco ${(movs ?? []).length}`);
} catch (erro) {
  console.error(`\nFALHA: ${erro.message}`);
  falhou += 1;
} finally {
  if (userId) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
}

console.log(`\n${falhou === 0 ? "✔" : "✘"} ${ok} passaram · ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
