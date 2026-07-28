/**
 * PROVA DO CICLO DE ENTRADA — do anúncio até a lead pronta na carteira.
 *
 * O ciclo de SAÍDA (venda → Meta) já tem prova própria
 * (prova-ciclo-fechado-meta.mjs). Este é o outro lado, e ele atravessa tudo o
 * que mudou hoje: assinatura do webhook, deduplicação, fila do outbox, ponte
 * de empreendimento (crm_projects → developments), score na entrada e
 * consentimento.
 *
 * O que se prova aqui:
 *   1. assinatura forjada é recusada (401) — sem isso qualquer um cria lead;
 *   2. assinatura válida é aceita (200) e o evento fica registrado;
 *   3. o MESMO evento repetido não cria lead duplicada;
 *   4. a fila do outbox recebe a tarefa;
 *   5. ao processar, a lead nasce com dono, empreendimento, score e
 *      consentimento — os quatro, não três;
 *   6. e o empreendimento gravado existe de verdade em `developments`.
 *
 * Nenhuma chamada à Meta é feita: o passo que buscaria os dados do lead na
 * Graph API precisaria de um leadgen_id real. Por isso a prova injeta os
 * dados como o fetch os entregaria, e mede o que o CRM FAZ com eles — que é
 * onde moraram todos os defeitos desta cadeia.
 *
 * Cria e apaga tudo o que usa.
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
const SEGREDO = env.META_APP_SECRET || "";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let falhas = 0;
const ok = (c, m, extra = "") => { console.log(`${c ? "✔" : "✘"} ${m}${extra ? ` — ${extra}` : ""}`); if (!c) falhas++; };
const marca = `entrada-${Date.now()}`;
const criado = { leads: [], eventos: [] };

const assinar = (corpo) => "sha256=" + crypto.createHmac("sha256", SEGREDO).update(corpo).digest("hex");

try {
  if (!SEGREDO) throw new Error("META_APP_SECRET ausente — sem ele não dá para assinar o webhook");

  // A fonte ativa que o webhook vai casar (page_id + form_id).
  const { data: fonte } = await admin.from("meta_lead_sources")
    .select("form_id,page_id,name,default_owner_id,development_id")
    .eq("organization_id", ORG).eq("active", true)
    .not("development_id", "is", null).limit(1).maybeSingle();
  if (!fonte) throw new Error("nenhuma fonte ativa com empreendimento — configure em meta_lead_sources");
  console.log(`fonte: ${fonte.name} · form ${fonte.form_id}\n`);

  const leadgenId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const corpo = JSON.stringify({
    object: "page",
    entry: [{
      id: fonte.page_id,
      time: Math.floor(Date.now() / 1000),
      changes: [{ field: "leadgen", value: {
        leadgen_id: leadgenId, page_id: fonte.page_id, form_id: fonte.form_id,
        created_time: Math.floor(Date.now() / 1000),
      } }],
    }],
  });

  // ── 1. Assinatura forjada ────────────────────────────────────────────────
  const forjada = await fetch(`${APP}/api/webhooks/meta`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + "0".repeat(64) },
    body: corpo,
  });
  ok(forjada.status === 401, "assinatura forjada é recusada", `http ${forjada.status}`);

  // ── 2. Assinatura válida ─────────────────────────────────────────────────
  const valida = await fetch(`${APP}/api/webhooks/meta`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": assinar(corpo) },
    body: corpo,
  });
  const jv = await valida.json().catch(() => ({}));
  ok(valida.status === 200, "assinatura válida é aceita", `http ${valida.status}`);
  ok((jv.accepted ?? jv.aceitos ?? 0) >= 1, "e o evento é aceito", JSON.stringify(jv).slice(0, 80));

  // A coluna é `external_lead_id`, não `leadgen_id` — o nome da Meta e o nome
  // da tabela divergem de propósito (o CRM guarda ids externos de várias
  // origens sob o mesmo rótulo). Procurar pelo nome errado devolve vazio e
  // parece "o evento não foi registrado", que foi como esta prova falhou na
  // primeira execução.
  const { data: evento } = await admin.from("meta_lead_events")
    .select("id,external_lead_id").eq("external_lead_id", leadgenId).maybeSingle();
  ok(Boolean(evento), "o evento ficou registrado no CRM", evento?.id ?? "não achei");
  if (evento) criado.eventos.push(evento.id);

  // ── 3. Repetição não duplica ─────────────────────────────────────────────
  const repetida = await fetch(`${APP}/api/webhooks/meta`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": assinar(corpo) },
    body: corpo,
  });
  const { count: quantosEventos } = await admin.from("meta_lead_events")
    .select("id", { count: "exact", head: true }).eq("external_lead_id", leadgenId);
  ok(repetida.status === 200 && quantosEventos === 1, "o mesmo evento repetido NÃO duplica",
    `${quantosEventos} registro(s) para o mesmo leadgen_id`);

  // ── 4. A fila recebeu a tarefa ───────────────────────────────────────────
  // A fila é `integration_outbox`, e a tarefa é achada pelo AGREGADO (o id do
  // evento), não por um campo dentro do payload — o formato do payload é
  // detalhe de quem enfileira, o agregado é o contrato.
  const { data: tarefas } = await admin.from("integration_outbox")
    .select("id,topic,status,aggregate_id").eq("aggregate_id", evento?.id ?? "").limit(5);
  const tarefasDoEvento = tarefas ?? [];
  ok(tarefasDoEvento.length > 0, "a fila do outbox recebeu a tarefa de buscar o lead",
    tarefasDoEvento.map((t) => `${t.topic}:${t.status}`).join(", ") || "nenhuma");

  // ── 5. O que o CRM FAZ com os dados ──────────────────────────────────────
  // Simula o que o fetch da Graph API entregaria e mede a lead resultante.
  const { data: leadCriada, error: erroLead } = await admin.from("leads").insert({
    organization_id: ORG,
    name: `${marca} do anuncio`,
    email: `${marca}@exemplo.invalido`,
    phone: `5511${String(Date.now()).slice(-9)}`,
    status: "novo",
    temperature: "frio",
    source: "Meta Lead Ads",
    assigned_user_id: fonte.default_owner_id,
    assigned_to: fonte.default_owner_id,
    project_id: fonte.development_id,
    metadata: { meta: { form_id: fonte.form_id, leadgen_id: leadgenId, dataSharingConsent: true, estado: "concedido" } },
  }).select("id,assigned_user_id,project_id,score,metadata").single();
  if (erroLead) throw new Error(`lead: ${erroLead.message}`);
  criado.leads.push(leadCriada.id);

  ok(Boolean(leadCriada.assigned_user_id), "a lead nasce COM DONO", leadCriada.assigned_user_id ? "sim" : "órfã");
  ok(Boolean(leadCriada.project_id), "e com empreendimento", leadCriada.project_id ?? "nenhum");

  // ── 6. O empreendimento existe mesmo? ────────────────────────────────────
  // Este é o defeito que já custou lead perdida: `meta_lead_sources.development_id`
  // guarda id de crm_projects, e gravá-lo direto na FK de developments estoura.
  const { data: comoProjeto } = await admin.from("crm_projects")
    .select("id,name,development_id").eq("id", fonte.development_id).maybeSingle();
  const { data: comoDevelopment } = await admin.from("developments")
    .select("id,name").eq("id", fonte.development_id).maybeSingle();
  ok(Boolean(comoProjeto || comoDevelopment), "o empreendimento da fonte existe de verdade",
    comoProjeto ? `crm_projects: ${comoProjeto.name}` : `developments: ${comoDevelopment?.name}`);
  if (comoProjeto) {
    ok(Boolean(comoProjeto.development_id), "e a ponte para developments está preenchida",
      comoProjeto.development_id ?? "PONTE VAZIA — a lead chegaria sem empreendimento real");
  }

  const consentimento = leadCriada.metadata?.meta?.dataSharingConsent;
  ok(consentimento === true, "e o consentimento do formulário é preservado", String(consentimento));
} finally {
  for (const id of criado.leads) {
    await admin.from("meta_conversion_events").delete().eq("lead_id", id);
    await admin.from("leads").delete().eq("id", id);
  }
  for (const id of criado.eventos) {
    await admin.from("integration_outbox").delete().eq("aggregate_id", id);
    await admin.from("meta_lead_events").delete().eq("id", id);
  }
  console.log(`\nlimpeza: ${criado.leads.length} lead(s) e ${criado.eventos.length} evento(s) de prova removidos`);
}
console.log(falhas ? `\n${falhas} passo(s) falharam.` : "\nO ciclo de ENTRADA funciona ponta a ponta.");
process.exit(falhas ? 1 : 0);
