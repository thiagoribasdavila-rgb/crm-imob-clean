#!/usr/bin/env node
/**
 * PROVA que a captura de resposta decisiva grava o critério E preserva a
 * identidade da lead — contra o banco vivo, por HTTP, como o navegador faz.
 *
 * Existe porque o contrato prova a REGRA PURA (`liveLeadUpdatePayload`), e regra
 * perfeita com rota que não a chama é o defeito mais caro deste repositório. Aqui
 * a chamada é a mesma que `CapturaDeRespostaDecisiva` faz: PATCH com UM campo.
 *
 * ⚠ NUNCA toca lead real: cria a própria, prova os dois lados, e apaga.
 */
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.ALVO || "http://localhost:3000";
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG = "7c8c71c1-e963-464c-be5c-ff8c7936f51a";
const DIRETOR_PAI = "6f150832-4c97-42a7-954e-eea962a003fa";
const MARCA = `capt-${Math.random().toString(36).slice(2, 8)}`;

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
let falhas = 0;
const checa = (nome, cond, extra = "") => {
  if (!cond) falhas += 1;
  console.log(`  ${cond ? "✔" : "✘"} ${nome}${extra ? " — " + extra : ""}`);
};

async function criarDiretor() {
  const email = `${MARCA}-dir@atlas-teste.local`;
  const senha = `Teste!${MARCA}A1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error("createUser: " + error.message);
  await new Promise((r) => setTimeout(r, 1800)); // o gatilho é assíncrono
  const up = await admin.from("profiles").upsert(
    {
      id: data.user.id, organization_id: ORG, full_name: `Diretor ${MARCA}`, email,
      role: "manager", commercial_role: "manager", access_role: "director",
      reports_to: DIRETOR_PAI, active: true,
    },
    { onConflict: "id" },
  );
  if (up.error) throw new Error("upsert profile: " + JSON.stringify(up.error));
  return { id: data.user.id, email, senha };
}

async function token(email, senha) {
  const r = await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password: senha }),
  });
  const b = await r.json();
  if (!b.access_token) throw new Error("login falhou: " + JSON.stringify(b).slice(0, 200));
  return b.access_token;
}

const diretor = await criarDiretor();
const jwt = await token(diretor.email, diretor.senha);
const H = { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };

/** A identidade que NÃO pode sumir — é como o corretor alcança a pessoa. */
const IDENTIDADE = {
  name: `${MARCA} Cliente de Teste`,
  email: `${MARCA}@exemplo.com.br`,
  phone: "11900000009",
  source: "meta_ads",
};

const { data: lead, error: erroLead } = await admin
  .from("leads")
  .insert({ organization_id: ORG, status: "novo", assigned_to: diretor.id, assigned_user_id: diretor.id, ...IDENTIDADE })
  .select("id")
  .single();
if (erroLead) throw new Error("insert lead: " + erroLead.message);

const ler = async () =>
  (await admin
    .from("leads")
    .select("name,email,phone,source,preferred_neighborhoods,preferred_bedrooms,budget_min,budget_max")
    .eq("id", lead.id)
    .single()).data;

console.log(`\nPATCH com SÓ o bairro — é o corpo que o botão "Registrar resposta" envia`);
const r1 = await fetch(`${BASE}/api/v1/leads/${lead.id}`, {
  method: "PATCH", headers: H, body: JSON.stringify({ preferred_regions: ["Perdizes", "Pompeia"] }),
});
checa("HTTP 200", r1.status === 200, `status=${r1.status}`);
const d1 = await ler();
checa("o bairro foi GRAVADO", (d1.preferred_neighborhoods ?? []).includes("Perdizes"), JSON.stringify(d1.preferred_neighborhoods));
for (const [campo, esperado] of Object.entries(IDENTIDADE)) {
  const atual = campo === "email" ? String(d1[campo] ?? "").toLowerCase() : d1[campo];
  checa(`${campo} PRESERVADO`, atual === esperado.toLowerCase?.() || atual === esperado, `ficou "${atual}"`);
}

console.log(`\nPATCH com SÓ dormitórios — o bairro anterior não pode sumir`);
const r2 = await fetch(`${BASE}/api/v1/leads/${lead.id}`, {
  method: "PATCH", headers: H, body: JSON.stringify({ bedrooms: 2 }),
});
checa("HTTP 200", r2.status === 200, `status=${r2.status}`);
const d2 = await ler();
checa("dormitórios gravado", Number(d2.preferred_bedrooms) === 2, `ficou ${d2.preferred_bedrooms}`);
checa("bairro da chamada anterior CONTINUA lá", (d2.preferred_neighborhoods ?? []).includes("Perdizes"));
checa("telefone continua lá", d2.phone === IDENTIDADE.phone);

console.log(`\nPATCH com SÓ a faixa de preço`);
const r3 = await fetch(`${BASE}/api/v1/leads/${lead.id}`, {
  method: "PATCH", headers: H, body: JSON.stringify({ budget_min: 300000, budget_max: 500000 }),
});
checa("HTTP 200", r3.status === 200, `status=${r3.status}`);
const d3 = await ler();
checa("faixa gravada", Number(d3.budget_min) === 300000 && Number(d3.budget_max) === 500000);
checa("os TRÊS decisivos coexistem", Boolean((d3.preferred_neighborhoods ?? []).length && d3.preferred_bedrooms && d3.budget_min));
checa("nome ainda intacto depois de 3 PATCHes parciais", d3.name === IDENTIDADE.name, `ficou "${d3.name}"`);

console.log(`\nO OUTRO LADO: enviar vazio LIMPA de propósito`);
const r4 = await fetch(`${BASE}/api/v1/leads/${lead.id}`, {
  method: "PATCH", headers: H, body: JSON.stringify({ email: "" }),
});
checa("HTTP 200", r4.status === 200, `status=${r4.status}`);
const d4 = await ler();
checa("e-mail enviado vazio foi LIMPO", !d4.email, `ficou "${d4.email}"`);
checa("e o telefone, que não foi enviado, continua", d4.phone === IDENTIDADE.phone);

// ── LIMPEZA ────────────────────────────────────────────────────────────────
await admin.from("leads").delete().eq("id", lead.id);
await admin.from("audit_logs").delete().eq("actor_id", diretor.id);
await admin.from("profiles").delete().eq("id", diretor.id);
await admin.auth.admin.deleteUser(diretor.id);
const resto = await admin.from("leads").select("id").eq("id", lead.id);
checa("limpeza: lead de teste apagada", (resto.data ?? []).length === 0);

console.log(`\n${falhas === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
