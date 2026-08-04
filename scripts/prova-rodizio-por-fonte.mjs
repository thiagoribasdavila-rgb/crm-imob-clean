/**
 * PROVA DO RODÍZIO POR FORMULÁRIO — contra o banco vivo.
 *
 * O contrato prova a REGRA (quem é a vez) e o motor com Supabase de mentira.
 * Esta prova cobre o que falta: a rota grava mesmo, a tela lê de volta o que
 * gravou, e o dono único deixa de decidir quando o rodízio existe.
 *
 * Medido em 03/08/2026: oito formulários ativos apontando para o mesmo perfil,
 * que sozinho segura 485 das 613 leads.
 *
 *   node --env-file=.env.local scripts/prova-rodizio-por-fonte.mjs
 */
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const APP = env.PROVA_APP_URL || "http://127.0.0.1:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0, bad = 0;
const t = (c, txt, d = "") => { if (c) { ok++; console.log("  ✔ " + txt); } else { bad++; console.log("  ✘ " + txt + (d ? "\n      " + d : "")); } };

const { data: fonte } = await admin.from("meta_lead_sources")
  .select("id,name,organization_id,default_owner_id").eq("active", true).limit(1).single();
const ORG = fonte.organization_id;

const email = `prova-rodizio-${Date.now()}@atlas-teste.local`;
const senha = "Prova!R0dizio#Font";
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
const { error: ep } = await admin.from("profiles").upsert({
  id: u.user.id, name: "Prova Rodizio", full_name: "Prova Rodizio", email,
  organization_id: ORG, role: "admin", access_role: "director_decisor",
  commercial_role: "director", reports_to: null, active: true,
});
if (ep) { console.log("perfil recusado:", ep.message); process.exit(1); }
const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: s } = await pub.auth.signInWithPassword({ email, password: senha });
const H = { authorization: `Bearer ${s.session.access_token}`, "content-type": "application/json" };

const ler = async () => (await fetch(`${APP}/api/v1/crm/rodizio-por-fonte`, { headers: H })).json();
const gravar = (corpo) => fetch(`${APP}/api/v1/crm/rodizio-por-fonte`, { method: "POST", headers: H, body: JSON.stringify(corpo) }).then((r) => r.json());

const tocados = [];
try {
  console.log(`\nformulário de prova: ${fonte.name}\n`);

  console.log("── o retrato ──");
  const antes = await ler();
  t(antes?.ok === true, "a rota responde", JSON.stringify(antes?.error ?? {}));
  const daFonte = (r) => (r?.data?.fontes ?? []).find((f) => f.id === fonte.id);
  t(Boolean(daFonte(antes)), "o formulário aparece na lista");
  t(typeof antes?.data?.fontesComDonoUnico === "number",
    `diz quantos formulários entregam tudo a uma pessoa (${antes?.data?.fontesComDonoUnico})`);

  const corretores = antes?.data?.corretores ?? [];
  if (corretores.length < 2) { console.log("  (menos de 2 corretores — casos de rodízio pulados)"); }
  else {
    const [a, b] = corretores;
    console.log("\n── colocar no rodízio ──");
    const r1 = await gravar({ fonteId: fonte.id, profileId: a.id, ativo: true });
    if (r1?.ok) tocados.push(a.id);
    t(r1?.ok === true, `${a.nome} entra`, JSON.stringify(r1?.error ?? {}));
    const r2 = await gravar({ fonteId: fonte.id, profileId: b.id, ativo: true });
    if (r2?.ok) tocados.push(b.id);
    t(r2?.ok === true, `${b.nome} entra`);

    const depois = await ler();
    const f = daFonte(depois);
    t(f?.rodizioAtivo === true, "a fonte passa a declarar rodízio ativo");
    t(f?.membros?.length === 2, `os dois aparecem (${f?.membros?.length})`);
    t(f?.membros?.[0]?.posicao < f?.membros?.[1]?.posicao,
      "quem entrou primeiro tem posição menor — entrar não fura a ordem",
      JSON.stringify(f?.membros));
    t(f?.donoUnicoId === (fonte.default_owner_id ?? null),
      "o dono único continua exposto: rodízio vazio não é 'nada configurado'");

    console.log("\n── dois cliques não criam duas linhas ──");
    await gravar({ fonteId: fonte.id, profileId: a.id, ativo: true });
    const { count } = await admin.from("source_round_robin").select("id", { count: "exact", head: true })
      .eq("source_id", fonte.id).eq("profile_id", a.id);
    t(count === 1, `uma linha por pessoa por formulário (veio ${count})`);

    console.log("\n── tirar do rodízio ──");
    const saiu = await gravar({ fonteId: fonte.id, profileId: b.id, ativo: false });
    t(saiu?.ok === true, "tirar responde ok", JSON.stringify(saiu?.error ?? saiu));
    const semB = daFonte(await ler());
    t(!semB?.membros?.some((m) => m.profileId === b.id), "quem saiu não aparece mais");
    t(semB?.rodizioAtivo === true, "com um membro, o rodízio continua ativo");
  }

  console.log("\n── o que a rota recusa ──");
  const deFora = await gravar({ fonteId: "00000000-0000-0000-0000-000000000000", profileId: corretores[0]?.id ?? "00000000-0000-0000-0000-000000000000", ativo: true });
  t(deFora?.ok !== true, "formulário inexistente é recusado");
  const semUuid = await gravar({ fonteId: "nao-e-uuid", profileId: corretores[0]?.id, ativo: true });
  t(semUuid?.ok !== true, "id que não é uuid é recusado");
} finally {
  for (const p of tocados) {
    await admin.from("source_round_robin").delete().eq("source_id", fonte.id).eq("profile_id", p);
  }
  const { count: sobrou } = await admin.from("source_round_robin").select("id", { count: "exact", head: true });
  await admin.from("profiles").delete().eq("id", u.user.id);
  await admin.auth.admin.deleteUser(u.user.id);
  console.log(`\nlinhas de rodízio sobrando: ${sobrou ?? 0} · usuário descartável removido: sim`);
}
console.log(`\n${ok} passaram, ${bad} falharam.`);
process.exit(bad ? 1 : 0);
