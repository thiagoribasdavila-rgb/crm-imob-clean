/**
 * PROVA da rota /api/v1/crm/vendas-sem-valor, contra a base viva.
 *
 * Existe porque eu havia provado só a REGRA PURA. "Achado por leitura não é
 * achado" vale para o próprio trabalho: a regra pode estar perfeita e a rota
 * nunca devolver nada — foi assim que `firstContactOverdue` viveu neste repo,
 * calculado, tipado, devolvido e nunca renderizado.
 *
 * ⚠ NUNCA escreve valor na venda REAL (Monique Teles). Cria a própria venda de
 * teste, prova os dois lados, e apaga.
 */
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.ALVO || "http://localhost:3111";
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG = "7c8c71c1-e963-464c-be5c-ff8c7936f51a";
const DIRETOR_PAI = "6f150832-4c97-42a7-954e-eea962a003fa"; // director_decisor raiz — o gatilho exige
const MARCA = `vsv-${Math.random().toString(36).slice(2, 8)}`;

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
const ok = (b) => (b ? "✔" : "✘");
let falhas = 0;
const checa = (nome, cond, extra = "") => {
  if (!cond) falhas += 1;
  console.log(`  ${ok(cond)} ${nome}${extra ? " — " + extra : ""}`);
};

async function criarDiretor() {
  const email = `${MARCA}-diretor@atlas-teste.local`;
  const senha = `Teste!${MARCA}A1`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
  });
  if (error) throw new Error("createUser: " + error.message);
  // O gatilho `handle_new_auth_user` é assíncrono e sobrescreve `active`.
  await new Promise((r) => setTimeout(r, 1800));
  const up = await admin.from("profiles").upsert({
    id: data.user.id, organization_id: ORG,
    full_name: `Diretor ${MARCA}`, // NOT NULL
    email, role: "manager", commercial_role: "manager", access_role: "director",
    reports_to: DIRETOR_PAI, active: true,
  }, { onConflict: "id" });
  if (up.error) throw new Error("upsert profile: " + JSON.stringify(up.error)); // o erro volta {} às vezes
  const { data: perfil } = await admin.from("profiles").select("active,commercial_role").eq("id", data.user.id).maybeSingle();
  if (!perfil?.active) throw new Error("perfil nasceu inativo");
  return { id: data.user.id, email, senha };
}

async function token(email, senha) {
  const r = await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password: senha }),
  });
  const b = await r.json();
  if (!b.access_token) throw new Error("login falhou: " + JSON.stringify(b).slice(0, 200));
  return b.access_token;
}

const diretor = await criarDiretor();
const jwt = await token(diretor.email, diretor.senha);
const H = { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };

// A venda de teste: ganho, SEM valor — o estado que a rota existe para cobrar.
const { data: minhaVenda, error: erroLead } = await admin.from("leads").insert({
  organization_id: ORG, name: `${MARCA} venda de teste`, phone: "11900000001",
  status: "ganho", assigned_to: diretor.id, assigned_user_id: diretor.id,
}).select("id").single();
if (erroLead) throw new Error("insert lead: " + erroLead.message);

console.log(`\nGET /api/v1/crm/vendas-sem-valor  (diretor ${MARCA})`);
const g = await fetch(`${BASE}/api/v1/crm/vendas-sem-valor`, { headers: H });
const gb = await g.json();
const pend = gb?.data?.pendentes ?? [];
checa("HTTP 200", g.status === 200, `status=${g.status}`);
checa("a MINHA venda de teste aparece", pend.some((p) => p.id === minhaVenda.id));
checa("a venda REAL (Monique Teles) aparece", pend.some((p) => /Monique/i.test(p.nome || "")));
checa("cada pendência diz a CONSEQUÊNCIA", pend.every((p) => /VGV/.test(p.consequencia || "")));
checa("a resposta carrega o denominador", typeof gb?.data?.vendasFechadas === "number", `vendasFechadas=${gb?.data?.vendasFechadas}`);
checa("o escopo é declarado", gb?.data?.escopo === "organizacao", `escopo=${gb?.data?.escopo}`);

console.log(`\nPOST — valor inválido deve RECUSAR (o outro lado)`);
for (const [rotulo, valor, esperado] of [["zero", 0, 422], ["negativo", -1, 422], ["texto", "abc", 422]]) {
  const r = await fetch(`${BASE}/api/v1/crm/vendas-sem-valor`, {
    method: "POST", headers: H, body: JSON.stringify({ leadId: minhaVenda.id, valor }),
  });
  checa(`${rotulo} → 422`, r.status === esperado, `status=${r.status}`);
}

console.log(`\nPOST — valor válido deve GRAVAR as duas colunas`);
const p = await fetch(`${BASE}/api/v1/crm/vendas-sem-valor`, {
  method: "POST", headers: H, body: JSON.stringify({ leadId: minhaVenda.id, valor: 987654.32 }),
});
checa("HTTP 200", p.status === 200, `status=${p.status}`);
const depois = await admin.from("leads").select("sale_value_brl,sale_value_recorded_at").eq("id", minhaVenda.id).single();
checa("sale_value_brl gravado", Number(depois.data.sale_value_brl) === 987654.32, `valor=${depois.data.sale_value_brl}`);
checa("sale_value_recorded_at gravado JUNTO", Boolean(depois.data.sale_value_recorded_at));

console.log(`\nGET de novo — a venda informada SAI da cobrança`);
const g2 = await fetch(`${BASE}/api/v1/crm/vendas-sem-valor`, { headers: H });
const pend2 = (await g2.json())?.data?.pendentes ?? [];
checa("a minha venda saiu", !pend2.some((x) => x.id === minhaVenda.id));
checa("a venda REAL continua na fila (ninguém informou o valor dela)", pend2.some((x) => /Monique/i.test(x.nome || "")));

// ── LIMPEZA ────────────────────────────────────────────────────────────────
await admin.from("leads").delete().eq("id", minhaVenda.id);
await admin.from("audit_logs").delete().eq("actor_id", diretor.id); // a FK trava o delete e o erro volta {}
await admin.from("profiles").delete().eq("id", diretor.id);
await admin.auth.admin.deleteUser(diretor.id);
const resto = await admin.from("leads").select("id").eq("id", minhaVenda.id);
const perfilResto = await admin.from("profiles").select("id").eq("id", diretor.id);
checa("limpeza: lead de teste apagada", (resto.data ?? []).length === 0);
checa("limpeza: diretor descartável apagado", (perfilResto.data ?? []).length === 0);

console.log(`\n${falhas === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
