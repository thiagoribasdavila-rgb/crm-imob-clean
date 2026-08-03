/**
 * RECUPERAÇÃO DAS LEADS REPRESADAS — o que a Meta tem e o CRM não.
 *
 * ── Por que este script existe ─────────────────────────────────────────────
 *
 * O webhook só entrega do momento da inscrição em diante. Medido em
 * 03/08/2026: 122 leads acumuladas na Página DA'Vila Consultoria entre 23/06 e
 * 26/07, e apenas 20 eventos no CRM. As outras 103 são anteriores à inscrição —
 * nenhuma correção de webhook as traz, porque não há nada para reentregar.
 *
 * A recuperação é o backfill, que percorre a MESMA esteira do tempo real:
 * grava em `meta_lead_events` (dedup pela unique de `external_lead_id`) e
 * enfileira `meta.lead.fetch` no outbox. Quem cria a lead é o worker, igual ao
 * fluxo normal. Nenhuma lógica de importação é duplicada aqui.
 *
 * ── DOIS ESTÁGIOS, COM CONFERÊNCIA NO MEIO ─────────────────────────────────
 *
 * Estágio 1 grava eventos e enfileira. Estágio 2 roda o worker, que cria as
 * leads. Separados de propósito: entre um e outro dá para olhar quantos eventos
 * entraram antes de qualquer lead existir no CRM — e um erro no estágio 1 não
 * vira lead errada, vira fila que ninguém drenou.
 *
 *   node scripts/recupera-leads-represadas.mjs             # só estágio 1
 *   node scripts/recupera-leads-represadas.mjs --importar  # 1 e 2
 *
 * NÃO distribui para corretores. Distribuir é outro ato, com outra
 * consequência (relógio de SLA por lead), e continua sendo da diretoria.
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const APP = process.env.TESTE_BASE_URL || "http://127.0.0.1:3000";
const ORG = "7c8c71c1-e963-464c-be5c-ff8c7936f51a";
const IMPORTAR = process.argv.includes("--importar");
const JANELA_DIAS = 120; // as mais antigas são de 23/06; 90 dias já bastaria, 120 dá folga

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const conta = async (tabela, filtro = (q) => q) => {
  const { count } = await filtro(admin.from(tabela).select("*", { count: "exact", head: true }));
  return count ?? 0;
};

const antes = {
  eventos: await conta("meta_lead_events"),
  leads: await conta("leads"),
  leadsMeta: await conta("leads", (q) => q.ilike("source", "%meta%")),
};
console.log("── ANTES ──");
console.log(`  eventos Meta: ${antes.eventos} | leads no CRM: ${antes.leads} | leads de origem Meta: ${antes.leadsMeta}`);

const criado = { usuario: null };
let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✔" : "✘"} ${msg}`); if (!cond) falhas++; };

try {
  // ── diretor descartável ──────────────────────────────────────────────────
  const senha = crypto.randomBytes(24).toString("base64url");
  const email = `recupera-${Date.now()}@atlas-teste.local`;
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(`createUser: ${e1.message}`);
  criado.usuario = u.user.id;
  const { error: e2 } = await admin.from("profiles").upsert({
    id: u.user.id, name: "Recuperação", full_name: "Recuperação", email, organization_id: ORG,
    role: "admin", access_role: "admin", commercial_role: "director", reports_to: null, active: true,
  });
  if (e2) throw new Error(`profile: ${e2.message}`);
  const pub = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data: sess, error: e3 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(`login: ${e3.message}`);
  const token = sess.session.access_token;

  // ── ESTÁGIO 1: buscar na Graph, gravar evento, enfileirar ────────────────
  const desde = Math.floor(Date.now() / 1000) - JANELA_DIAS * 86_400;
  console.log(`\n── ESTÁGIO 1: backfill desde ${new Date(desde * 1000).toISOString().slice(0, 10)} ──`);
  const r1 = await fetch(`${APP}/api/v1/integrations/meta/backfill`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ sinceUnix: desde }),
  });
  const b = await r1.json().catch(() => ({}));
  ok(r1.status === 200, `backfill respondeu 200 (veio ${r1.status}${r1.status !== 200 ? ` — ${JSON.stringify(b).slice(0, 200)}` : ""})`);
  if (r1.status === 200) {
    console.log(`  buscadas na Graph: ${b.fetched} | novas enfileiradas: ${b.accepted} | já existiam: ${b.duplicates}`);
    console.log(`  tarefas reparadas: ${b.recovered} | NÃO enfileiradas: ${b.notQueued}`);
    ok(Number(b.notQueued ?? 0) === 0, `nenhuma lead ficou sem tarefa no outbox (${b.notQueued ?? "?"})`);
  }

  const meio = await conta("meta_lead_events");
  console.log(`\n  eventos Meta: ${antes.eventos} → ${meio}  (+${meio - antes.eventos})`);
  ok(
    (await conta("leads")) === antes.leads,
    "nenhuma lead foi criada ainda — o estágio 1 só enfileira, como o webhook faz",
  );

  // ── ESTÁGIO 2: o worker cria as leads ───────────────────────────────────
  if (!IMPORTAR) {
    console.log("\n  ⏸ estágio 2 NÃO executado (rode com --importar para criar as leads no CRM).");
  } else {
    console.log("\n── ESTÁGIO 2: drenando o outbox ──");
    const segredo = env.ATLAS_CRON_SECRET;
    if (!segredo) throw new Error("ATLAS_CRON_SECRET ausente — o worker não pode ser acionado");
    let volta = 0, processadasNoTotal = 0;
    while (volta < 40) {
      volta += 1;
      const r2 = await fetch(`${APP}/api/v2/outbox/process`, {
        method: "POST",
        headers: { authorization: `Bearer ${segredo}`, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const w = await r2.json().catch(() => ({}));
      const feitas = Number(w.processed ?? w.processadas ?? w.data?.processed ?? 0);
      processadasNoTotal += feitas;
      if (volta === 1) ok(r2.status === 200, `worker respondeu 200 (veio ${r2.status})`);
      if (!feitas) break;
      process.stdout.write(`  volta ${volta}: ${feitas} processadas (acumulado ${processadasNoTotal})\n`);
    }
    console.log(`  total processado pelo worker: ${processadasNoTotal}`);
  }

  // ── CONFERÊNCIA ─────────────────────────────────────────────────────────
  const depois = {
    eventos: await conta("meta_lead_events"),
    leads: await conta("leads"),
    leadsMeta: await conta("leads", (q) => q.ilike("source", "%meta%")),
    importados: await conta("meta_lead_events", (q) => q.eq("status", "imported")),
    falhos: await conta("meta_lead_events", (q) => q.eq("status", "failed")),
  };
  console.log("\n── DEPOIS ──");
  console.log(`  eventos Meta: ${antes.eventos} → ${depois.eventos}`);
  console.log(`  leads no CRM: ${antes.leads} → ${depois.leads}  (+${depois.leads - antes.leads})`);
  console.log(`  leads de origem Meta: ${antes.leadsMeta} → ${depois.leadsMeta}`);
  console.log(`  eventos importados: ${depois.importados} | falhos: ${depois.falhos}`);

  ok(depois.eventos >= antes.eventos, "nenhum evento desapareceu");

  // A primeira versão comparava leads criadas contra eventos criados NA MESMA
  // execução — e falhou quando o estágio 1 rodou numa execução e o 2 em outra:
  // eventos +0, leads +51, asserção vermelha sobre um resultado correto. O
  // vínculo certo é lead ↔ evento importado, que não depende de quando cada
  // estágio rodou.
  const { count: ligadas } = await admin
    .from("meta_lead_events")
    .select("lead_id", { count: "exact", head: true })
    .eq("status", "imported")
    .not("lead_id", "is", null);
  ok(
    (ligadas ?? 0) === depois.importados,
    `toda importação aponta para uma lead: ${ligadas ?? 0} de ${depois.importados} — importar sem vincular é lead invisível`,
  );

  // "Não duplicar leads existentes" conferido NO DADO, não na intenção do
  // código. Telefone é a chave que a regra de contato único usa; normalizo para
  // dígitos porque a base tem o mesmo número em três formatações.
  const { data: contatos } = await admin
    .from("leads")
    .select("phone")
    .eq("organization_id", ORG)
    .not("phone", "is", null)
    .limit(5000);
  const porTelefone = new Map();
  for (const c of contatos ?? []) {
    const digitos = String(c.phone ?? "").replace(/\D/g, "");
    if (digitos.length < 8) continue;
    porTelefone.set(digitos, (porTelefone.get(digitos) ?? 0) + 1);
  }
  const excedentes = [...porTelefone.values()].reduce((s, n) => s + (n - 1), 0);
  ok(excedentes === 0, `nenhum telefone repetido entre as ${porTelefone.size} leads com contato (excedentes: ${excedentes})`);
} catch (erro) {
  falhas += 1;
  console.error("✘ interrompido:", erro.message);
} finally {
  if (criado.usuario) {
    await admin.from("profiles").delete().eq("id", criado.usuario);
    await admin.auth.admin.deleteUser(criado.usuario).catch(() => {});
    console.log("\n  usuário de recuperação removido");
  }
  console.log(falhas ? `\n✘ ${falhas} falha(s)` : "\n✔ recuperação concluída");
  process.exit(falhas ? 1 : 0);
}
