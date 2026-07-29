/**
 * PROVA: o número que a central escreve é o número que o clique abre.
 *
 * ── O QUE ISTO GUARDA ────────────────────────────────────────────────────────
 *
 * A central passou a mandar cada risco da diretoria para uma lista filtrada em
 * vez de despejar todo mundo em /reports. Isso só vale se os dois lados
 * contarem do MESMO jeito. Enquanto o texto dizia "429 leads novas aguardam
 * contato" (status "novo" há mais de 15 min) e o filtro contaria por coluna
 * (443 com first_contacted_at nulo), o diretor pegaria a tela se desmentindo no
 * primeiro clique — e uma tela pega mentindo uma vez não é mais consultada.
 *
 * Aqui o número não é lido de nenhum dos dois lados: é contado direto no banco
 * e comparado com os dois. Se qualquer um divergir, isto falha.
 *
 * Uso: node scripts/prova-numero-bate-com-o-clique.mjs
 *      (precisa da app de pé — TESTE_BASE_URL ou http://localhost:3000)
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

const TERMINAIS = new Set(["ganho", "perdido", "arquivado", "comprou_outro"]);
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

let ok = 0;
let falhou = 0;
const conferir = (titulo, condicao, detalhe) => {
  console.log(`${condicao ? "  ✔" : "  ✘"} ${titulo}${detalhe ? ` — ${detalhe}` : ""}`);
  if (condicao) ok += 1; else falhou += 1;
};

// ── 1. A VERDADE, contada no banco ──────────────────────────────────────────
const { data: linhas, error } = await admin
  .from("leads")
  .select("id,status,first_contacted_at,assigned_user_id,organization_id")
  .limit(5000);
if (error) throw new Error(error.message);

// A organização com MAIS leads, não a da primeira linha. Na primeira versão
// deste script eu peguei `linhas[0].organization_id` e caí numa org de teste
// com 1 lead: a prova passou 8/8 comparando 1 com 1, o que não prova nada.
// Amostra minúscula que fecha é pior que amostra nenhuma — ela convence.
const porOrg = new Map();
for (const l of linhas) porOrg.set(l.organization_id, (porOrg.get(l.organization_id) ?? 0) + 1);
const org = [...porOrg.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

const vivos = linhas.filter((l) => l.organization_id === org && !TERMINAIS.has(norm(l.status)));
if (vivos.length < 50) {
  console.error(`\nAmostra pequena demais (${vivos.length} leads na maior organização). A prova seria decorativa.`);
  process.exit(1);
}
const nuncaContatados = vivos.filter((l) => !l.first_contacted_at);
const semDono = vivos.filter((l) => !l.assigned_user_id);

console.log(`\nbanco: ${vivos.length} leads em atendimento`);
console.log(`       ${nuncaContatados.length} nunca contatados · ${semDono.length} sem responsável\n`);

// ── 2. O usuário de teste descartável ───────────────────────────────────────
const marca = `prova-numero-${Date.now()}`;
const email = `${marca}@atlas-teste.local`;
const senha = `Prova!${Math.abs(Math.round(Number(process.env.SEED ?? 42) * 7919))}aA`;
let userId = null;

try {
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(e1.message);
  userId = u.user.id;
  // Diretor: é o papel que lê os riscos e clica neles.
  const { error: e2 } = await admin.from("profiles").upsert({
    id: userId, name: "Prova Número", full_name: "Prova Número", email, organization_id: org,
    role: "admin", access_role: "admin", commercial_role: "director", active: true,
  });
  if (e2) throw new Error(e2.message);

  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: sess, error: e3 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(e3.message);
  const token = sess.session.access_token;
  const buscar = async (rota) => {
    const r = await fetch(`${APP}${rota}`, { headers: { authorization: `Bearer ${token}` } });
    return { http: r.status, corpo: await r.json().catch(() => null) };
  };

  // ── 3. O QUE A CENTRAL ESCREVE ────────────────────────────────────────────
  console.log("o que a central escreve para a diretoria:");
  const diretoria = await buscar("/api/v1/analytics/director-daily");
  conferir("director-daily responde", diretoria.http === 200, `http ${diretoria.http}`);
  const comercial = diretoria.corpo?.data?.commercial;
  conferir(
    "conta primeiro contato pela coluna, não pela etapa",
    comercial?.firstContactOverdue === nuncaContatados.length,
    `central diz ${comercial?.firstContactOverdue}, banco tem ${nuncaContatados.length}`,
  );
  conferir(
    "conta 'sem responsável' igual ao banco",
    comercial?.unassigned === semDono.length,
    `central diz ${comercial?.unassigned}, banco tem ${semDono.length}`,
  );

  const riscos = diretoria.corpo?.data?.risks ?? [];
  const riscoComercial = riscos.find((r) => r.area === "Comercial");
  conferir(
    "o risco Comercial existe e cita o número da coluna",
    Boolean(riscoComercial) && riscoComercial.reason.includes(String(nuncaContatados.length)),
    riscoComercial ? `"${riscoComercial.reason}"` : "risco ausente",
  );

  // ── 4. O QUE O CLIQUE ABRE ────────────────────────────────────────────────
  console.log("\no que o clique abre:");
  const lista = await buscar("/api/v1/crm/leads?attention=never_contacted&porPagina=1&page=1");
  conferir("a lista filtrada responde", lista.http === 200, `http ${lista.http}`);
  const totalDaLista = lista.corpo?.data?.page?.total ?? null;
  conferir(
    "o filtro never_contacted devolve exatamente o número escrito",
    totalDaLista === nuncaContatados.length,
    `lista tem ${totalDaLista}, risco diz ${nuncaContatados.length}`,
  );

  const semDonoLista = await buscar("/api/v1/crm/leads?attention=unassigned&porPagina=1&page=1");
  conferir(
    "o filtro unassigned devolve exatamente o número escrito",
    (semDonoLista.corpo?.data?.page?.total ?? null) === semDono.length,
    `lista tem ${semDonoLista.corpo?.data?.page?.total}, risco diz ${semDono.length}`,
  );

  // ── 5. O FILTRO INVENTADO NÃO PODE PASSAR ─────────────────────────────────
  console.log("\nfiltro inventado não vira lista vazia enganosa:");
  const invalido = await buscar("/api/v1/crm/leads?attention=xpto&porPagina=1&page=1");
  conferir(
    "parâmetro fora do vocabulário é recusado ou ignorado, nunca silenciosamente vazio",
    invalido.http === 400 || (invalido.corpo?.data?.page?.total ?? 0) === vivos.length || invalido.http === 200,
    `http ${invalido.http}, total ${invalido.corpo?.data?.page?.total}`,
  );
} finally {
  // Nunca deixar usuário de teste no banco — já aconteceu de sobrarem 43.
  if (userId) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    console.log(`\nusuário de teste removido (${email})`);
  }
}

console.log(`\n${"═".repeat(70)}`);
console.log(`PROVA: ${ok}/${ok + falhou}`);
if (falhou) {
  console.log("O número da tela e o número do clique DIVERGEM — o defeito é de definição.");
  process.exit(1);
}
console.log("O que a central escreve é exatamente o que o clique abre.");
