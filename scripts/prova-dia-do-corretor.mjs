/**
 * PROVA DO DIA DO CORRETOR — o fluxo inteiro, não as peças.
 *
 * As provas anteriores testam cada função isolada: mover etapa, registrar
 * valor, listar leads. Nenhuma delas responde à pergunta que importa amanhã:
 * "o Diego consegue trabalhar uma lead do começo ao fim sem esbarrar em nada?"
 *
 * Aqui uma lead descartável percorre o dia real:
 *   1. chega e aparece na fila dele (e não na de outro corretor);
 *   2. ele registra o primeiro contato;
 *   3. agenda a próxima ação;
 *   4. move pelo funil (contato → qualificação → visita → proposta);
 *   5. move em lote junto com outras;
 *   6. desfaz um movimento errado;
 *   7. fecha a venda com valor;
 *   8. e o ciclo devolve a conversão para a Meta.
 *
 * Tudo pela API real, com sessão real de corretor. Cria e apaga os próprios
 * dados; não toca em lead de verdade.
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const APP = process.env.TESTE_BASE_URL || "http://localhost:3000";
const ORG = "7c8c71c1-e963-464c-be5c-ff8c7936f51a";
const DIRETOR = "240a6bc5-5163-42ab-9d0f-729c7d0b0d35";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const marca = `dia-${Date.now()}`;
const criado = { usuario: null, leads: [] };
let falhas = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "✔" : "✘"} ${msg}${extra ? ` — ${extra}` : ""}`);
  if (!cond) falhas++;
};

try {
  // ── O corretor ────────────────────────────────────────────────────────────
  const senha = crypto.randomBytes(24).toString("base64url");
  const email = `${marca}@atlas-teste.local`;
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(`createUser: ${e1.message}`);
  criado.usuario = u.user.id;
  const { error: e2 } = await admin.from("profiles").upsert({
    id: criado.usuario, name: "Dia do Corretor", full_name: "Dia do Corretor", email,
    organization_id: ORG, role: "broker", access_role: "broker", commercial_role: "broker",
    reports_to: DIRETOR, active: true,
  });
  if (e2) throw new Error(`profile: ${e2.message}`);

  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: sess, error: e3 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(`login: ${e3.message}`);
  const token = sess.session.access_token;
  const chamar = (rota, opcoes = {}) => fetch(`${APP}${rota}`, {
    ...opcoes,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(opcoes.headers ?? {}) },
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

  // ── 1. A lead chega ───────────────────────────────────────────────────────
  const criarLead = async (n) => {
    const { data, error } = await admin.from("leads").insert({
      organization_id: ORG, name: `${marca} lead ${n}`, status: "novo",
      email: `${marca}-${n}@exemplo.invalido`, phone: `5511${String(Date.now() + n).slice(-9)}`,
      assigned_user_id: criado.usuario, assigned_to: criado.usuario, source: "prova-dia-do-corretor",
      metadata: { meta: { dataSharingConsent: true, consentSource: "prova", consentAt: new Date().toISOString() } },
    }).select("id").single();
    if (error) throw new Error(`lead ${n}: ${error.message}`);
    criado.leads.push(data.id);
    return data.id;
  };
  const principal = await criarLead(1);
  const extra1 = await criarLead(2);
  const extra2 = await criarLead(3);

  // ── 2. Ela aparece na fila dele ───────────────────────────────────────────
  const lista = await chamar(`/api/v1/crm/leads?page=1&limit=100`);
  const ids = (lista.json?.data?.items ?? []).map((l) => l.id);
  ok(lista.status === 200, "a lista de leads abre", `http ${lista.status}`);
  ok(ids.includes(principal), "a lead nova aparece na carteira dele");
  ok(lista.json?.data?.escopo === "carteira", "e o escopo declarado é a carteira", lista.json?.data?.escopo);

  // ── 3. Primeiro contato ───────────────────────────────────────────────────
  const contato = await chamar(`/api/v1/leads/${principal}/first-contact`, {
    method: "POST",
    body: JSON.stringify({ canal: "call", resultado: "falou", observacao: "Ligação de prova: cliente pediu material." }),
  });
  // 201 é o certo: a rota CRIA um registro de tentativa. A primeira versão
  // desta prova exigia 200 e acusou defeito onde havia semântica correta.
  ok([200, 201].includes(contato.status), "registrar o primeiro contato funciona", `http ${contato.status}`);
  const { data: aposContato } = await admin.from("leads").select("first_contacted_at").eq("id", principal).single();
  ok(Boolean(aposContato?.first_contacted_at), "e o SLA de primeiro contato foi carimbado");

  // ── 4. Agendar a próxima ação ─────────────────────────────────────────────
  // `prazo` e `acao` são CHAVES de uma lista fechada (amanha|tres_dias|semana
  // e ligar|whatsapp|enviar_material|visita|proposta), não data ISO nem texto
  // livre — o corretor escolhe, não digita. Mandei ISO na primeira versão e
  // levei 400: a rota estava certa, a prova é que não sabia usá-la. A recusa,
  // aliás, devolve a lista de chaves válidas, que foi como descobri.
  const agenda = await chamar(`/api/v1/leads/${principal}/next-action`, {
    method: "POST",
    body: JSON.stringify({ prazo: "amanha", acao: "enviar_material", observacao: "combinado na ligação" }),
  });
  ok([200, 201].includes(agenda.status), "agendar a próxima ação funciona", `http ${agenda.status}`);
  const { data: aposAgenda } = await admin.from("leads").select("next_action_at").eq("id", principal).single();
  ok(Boolean(aposAgenda?.next_action_at), "e o compromisso ficou registrado");

  // ── 5. O funil, etapa por etapa ───────────────────────────────────────────
  const mover = (id, de, para, extras = {}) => chamar(`/api/v1/pipeline`, {
    method: "PATCH",
    body: JSON.stringify({ leadId: id, stage: para, expectedFromStage: de, ...extras }),
  });
  let ultimoMove = null;
  const caminho = [["novo", "contato"], ["contato", "qualificacao"], ["qualificacao", "visita"], ["visita", "proposta"]];
  for (const [de, para] of caminho) {
    const r = await mover(principal, de, para);
    ok(r.status === 200, `mover ${de} → ${para}`, `http ${r.status}`);
    ultimoMove = r.json?.move?.id ?? r.json?.move?.moveId ?? r.json?.moveId ?? ultimoMove;
  }

  // ── 6. Desfazer o último movimento ────────────────────────────────────────
  if (ultimoMove) {
    const desfazer = await mover(principal, "proposta", "visita", { reversalOf: ultimoMove });
    ok(desfazer.status === 200, "desfazer o último movimento funciona", `http ${desfazer.status}`);
    const { data: aposDesfazer } = await admin.from("leads").select("status").eq("id", principal).single();
    ok(aposDesfazer?.status === "visita", "e a lead voltou para a etapa anterior", aposDesfazer?.status);
    await mover(principal, "visita", "proposta");
  } else {
    ok(false, "a rota devolveu o id do movimento (sem ele não há desfazer)");
  }

  // ── 7. Mover em lote ──────────────────────────────────────────────────────
  const lote = await chamar(`/api/v1/crm/leads/bulk-stage`, {
    method: "POST",
    body: JSON.stringify({ leadIds: [extra1, extra2], stage: "contato", reason: "prova do dia" }),
  });
  ok(lote.status === 200, "mover em lote funciona para o corretor", `http ${lote.status}`);
  ok((lote.json?.data?.movidas ?? lote.json?.movidas) === 2, "e moveu as duas da carteira dele");

  // ── 8. Fechar a venda ─────────────────────────────────────────────────────
  const semValor = await mover(principal, "proposta", "ganho");
  ok(semValor.status === 400, "fechar sem valor é recusado", `http ${semValor.status}`);
  const fechou = await mover(principal, "proposta", "ganho", { saleValueBrl: 612000 });
  ok(fechou.status === 200, "fechar com valor funciona", `http ${fechou.status}`);
  const { data: vendida } = await admin.from("leads").select("status,sale_value_brl").eq("id", principal).single();
  ok(vendida?.status === "ganho" && Number(vendida?.sale_value_brl) === 612000, "e o valor apurado ficou gravado", String(vendida?.sale_value_brl));

  // ── 9. O ciclo devolve para a Meta ────────────────────────────────────────
  const worker = await fetch(`${APP}/api/v2/marketing/capi-feedback/process`, { method: "POST" });
  const jw = await worker.json().catch(() => ({}));
  ok((jw.eventosEnviados ?? 0) > 0, "a venda volta para a Meta como conversão", `enviados=${jw.eventosEnviados}`);
  const { data: eventos } = await admin.from("meta_conversion_events").select("event_name").eq("lead_id", principal);
  ok((eventos ?? []).some((e) => e.event_name === "Purchase"), "e fica registrada como Purchase no CRM",
    (eventos ?? []).map((e) => e.event_name).join(", ") || "nenhum");
} finally {
  for (const id of criado.leads) {
    await admin.from("meta_conversion_events").delete().eq("lead_id", id);
    for (const t of ["pipeline_stage_moves", "pipeline_history", "lead_contact_attempts", "tasks", "activities"]) {
      await admin.from(t).delete().eq("lead_id", id);
    }
    await admin.from("leads").delete().eq("id", id);
  }
  if (criado.usuario) {
    await admin.from("profiles").delete().eq("id", criado.usuario);
    await admin.auth.admin.deleteUser(criado.usuario).catch(() => {});
  }
  console.log(`\nlimpeza: ${criado.leads.length} leads e 1 corretor de prova removidos`);
}
console.log(falhas ? `\n${falhas} passo(s) do dia falharam.` : "\nO dia inteiro do corretor funciona ponta a ponta.");
process.exit(falhas ? 1 : 0);
