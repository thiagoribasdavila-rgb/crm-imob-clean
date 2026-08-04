/**
 * PROVA — GET /api/v1/tasks passa a expor recurrence_id, e o painel de
 * recorrência (FASE 43) e a ação cancel_recurrence ficam ALCANÇÁVEIS pela UI.
 *
 * Semeia a série DIRETO no banco (não pela rota de criação): create_recurring_task
 * tem um bug pré-existente, não relacionado a este fix — insere em tasks.due_at
 * e tasks.assigned_to, colunas que não existem na tabela viva (é due_date e
 * user_id). Este script isola só o que este fix realmente muda: a LEITURA.
 *
 * O bloco "Encerrar repetição" abaixo é esperado FALHAR hoje por um terceiro
 * bug, também pré-existente e também fora do escopo deste fix: a ação faz
 * update() em task_recurrences pelo client do usuário (chave anon + bearer),
 * mas a migration da fase 43 revoga insert/update/delete de `authenticated`
 * nessa tabela (só concede a `service_role`) — todo cancelamento recebe 42501.
 * Mantido vermelho de propósito: quando alguém corrigir o GRANT, este script
 * passa a confirmar.
 *
 *   node --env-file=.env.local scripts/prova-recorrencia-na-listagem.mjs
 */
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const APP = env.PROVA_APP_URL || "http://127.0.0.1:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0, bad = 0;
const t = (condicao, texto, detalhe = "") => {
  if (condicao) { ok++; console.log("  ✔ " + texto); }
  else { bad++; console.log("  ✘ " + texto + (detalhe ? "\n      " + detalhe : "")); }
};

const { data: empreendimentos } = await admin.from("developments").select("id,name,organization_id").limit(1);
if (!empreendimentos?.length) { console.log("Sem organização para provar."); process.exit(1); }
const org = empreendimentos[0].organization_id;

const email = `prova-recorrencia-${Date.now()}@atlas-teste.local`;
const senha = "Prova!Rec0rr#Task";
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
await admin.from("profiles").upsert({
  id: u.user.id, name: "Prova Recorrência", full_name: "Prova Recorrência", email,
  organization_id: org, role: "admin", access_role: "admin", commercial_role: "director", active: true,
});
const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: s } = await pub.auth.signInWithPassword({ email, password: senha });
if (!s?.session) { console.log("Login do usuário descartável falhou."); process.exit(1); }
const H = { authorization: `Bearer ${s.session.access_token}`, "content-type": "application/json" };

let recurrenceId = null;
let taskId = null;

try {
  console.log(`\norganização de prova: ${org}\n`);

  console.log("── semear a série DIRETO no banco (create_recurring_task tem bug à parte) ──");
  const nextRunAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const recur = await admin.from("task_recurrences").insert({
    organization_id: org, title: "Prova recorrência — ligar para o cliente", description: "Task de prova, descartável",
    priority: "media", assigned_to: u.user.id, cadence: "weekly",
    next_run_at: nextRunAt, ends_at: endsAt, max_occurrences: 10, active: true, created_by: u.user.id,
  }).select("id").single();
  t(!recur.error, "task_recurrences aceita a semente", JSON.stringify(recur.error ?? {}));
  recurrenceId = recur.data?.id ?? null;

  const dueDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const task = await admin.from("tasks").insert({
    organization_id: org, title: "Prova recorrência — ligar para o cliente", description: "Task de prova, descartável",
    due_date: dueDate, priority: "media", status: "pendente", user_id: u.user.id,
    recurrence_id: recurrenceId, recurrence_occurrence: 1,
  }).select("id").single();
  t(!task.error, "tasks aceita a primeira ocorrência com recurrence_id", JSON.stringify(task.error ?? {}));
  taskId = task.data?.id ?? null;

  console.log("\n── GET /api/v1/tasks devolve recurrence_id (era o defeito deste fix) ──");
  const listagem = await fetch(`${APP}/api/v1/tasks`, { headers: H }).then((r) => r.json());
  t(listagem?.ok === true, "GET responde ok", JSON.stringify(listagem?.error ?? {}));
  const naLista = (listagem?.data?.tasks ?? []).find((task) => task.id === taskId);
  t(Boolean(naLista), "a tarefa semeada aparece na listagem", `procurado ${taskId} em ${(listagem?.data?.tasks ?? []).length} tarefas`);
  t(naLista?.recurrence_id === recurrenceId, "e vem com recurrence_id preenchido — é isso que o painel FASE 43 precisa para agrupar", `recebido ${JSON.stringify(naLista?.recurrence_id)}`);

  console.log("\n── Encerrar repetição (esperado falhar hoje — bug de GRANT à parte, ver cabeçalho) ──");
  const cancelado = await fetch(`${APP}/api/v1/tasks`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({ id: taskId, action: "cancel_recurrence" }),
  }).then((r) => r.json());
  t(cancelado?.ok === true, "PATCH cancel_recurrence responde ok", JSON.stringify(cancelado?.error ?? cancelado));
} finally {
  if (taskId) await admin.from("tasks").delete().eq("id", taskId);
  if (recurrenceId) await admin.from("task_recurrences").delete().eq("id", recurrenceId);
  await admin.from("profiles").delete().eq("id", u.user.id);
  await admin.auth.admin.deleteUser(u.user.id);
  console.log("\nusuário, tarefa e recorrência de prova removidos: sim");
}

console.log(`\n${ok} passaram, ${bad} falharam.`);
process.exit(bad ? 1 : 0);
