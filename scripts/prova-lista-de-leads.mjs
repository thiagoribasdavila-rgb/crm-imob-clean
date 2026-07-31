import { createClient } from "@supabase/supabase-js";
const env = process.env, APP = "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, bad = 0;
const t = (c, txt, d = "") => { if (c) { ok++; console.log("  ✔ " + txt); } else { bad++; console.log("  ✘ " + txt + (d ? "\n      " + d : "")); } };

const { data: o } = await admin.from("meta_conversion_configs").select("organization_id");
const org = o[0].organization_id;
const email = `prova-leads-${Date.now()}@atlas-teste.local`, senha = "Prova!L3ads#Pag";
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
await admin.from("profiles").upsert({ id: u.user.id, name: "Prova Leads", full_name: "Prova Leads", email, organization_id: org, role: "admin", access_role: "admin", commercial_role: "director", active: true });
const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: s } = await pub.auth.signInWithPassword({ email, password: senha });
const H = { authorization: `Bearer ${s.session.access_token}` };
const get = async (q) => (await fetch(`${APP}/api/v1/crm/leads?${q}`, { headers: H })).json();

try {
  const { count: totalNoBanco } = await admin.from("leads").select("*", { count: "exact", head: true }).eq("organization_id", org);
  console.log(`\nbanco: ${totalNoBanco} leads na organização\n`);

  console.log("── paginação ──");
  const p1 = await get("page=1&limit=50");
  const p2 = await get("page=2&limit=50");
  const itens = (r) => r?.data?.items ?? r?.items ?? [];
  t(itens(p1).length === 50, `página 1 devolve 50 (veio ${itens(p1).length})`);
  t(itens(p2).length === 50, `página 2 devolve 50 (veio ${itens(p2).length})`);
  const ids1 = new Set(itens(p1).map((l) => l.id));
  t(itens(p2).every((l) => !ids1.has(l.id)), "página 2 não repete nenhuma lead da página 1");
  const pg = p1?.data?.page ?? p1?.page;
  t(pg && pg.total === totalNoBanco, `o total declarado é o total do banco (${pg?.total} vs ${totalNoBanco})`);

  console.log("\n── o filtro filtra dos DOIS lados ──");
  const perdidas = await get("page=1&limit=100&status=perdido");
  const { count: perdidasNoBanco } = await admin.from("leads").select("*", { count: "exact", head: true }).eq("organization_id", org).eq("status", "perdido");
  const pgP = perdidas?.data?.page ?? perdidas?.page;
  t(pgP?.total === perdidasNoBanco, `status=perdido devolve ${perdidasNoBanco} (rota disse ${pgP?.total})`);
  t(itens(perdidas).every((l) => String(l.status).toLowerCase() === "perdido"), "nenhuma lead de outro status entrou no recorte");
  t((pgP?.total ?? 0) < (pg?.total ?? 0), "o filtro REDUZ a lista — sem isto ele poderia ser ignorado em silêncio");

  console.log("\n── parâmetro inventado não vira lista vazia ──");
  const invalido = await get("page=1&limit=50&status=xpto-nao-existe");
  const pgI = invalido?.data?.page ?? invalido?.page;
  t((pgI?.total ?? 0) === (pg?.total ?? 0) || invalido?.error,
    "status inválido é recusado ou ignorado, nunca devolve lista vazia silenciosa",
    `total com status inválido: ${pgI?.total} · esperado ${pg?.total} ou erro`);
} finally {
  await admin.from("profiles").delete().eq("id", u.user.id);
  await admin.auth.admin.deleteUser(u.user.id);
  console.log("\nusuário descartável removido: sim");
}
console.log(`\n${ok} passaram, ${bad} falharam.`);
process.exit(bad ? 1 : 0);
