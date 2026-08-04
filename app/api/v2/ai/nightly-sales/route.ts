import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateNightlyEligibility, nightlyWindow } from "@/lib/ai/governed-nightly-copilot";
import { logger } from "@/lib/observability/logger";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";
import { CONSENTIMENTO_DA_SOMBRA } from "@/lib/ai/jornada-em-sombra";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const header = request.headers.get("authorization");
  return Boolean(process.env.ATLAS_CRON_SECRET && header === `Bearer ${process.env.ATLAS_CRON_SECRET}`);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (desfecho: "ok" | "sem_trabalho" | "fora_da_janela" | "falhou", resposta: Record<string, unknown>) =>
    registrarExecucao({ vigia: "nightly-sales", rota: "/api/v2/ai/nightly-sales", origem, iniciadoEm, desfecho, resposta });

  const window = nightlyWindow();
  if (!window.active) {
    const corpo = { prepared: 0, reason: "A jornada opera somente entre 22h e 6h59 em São Paulo.", window: window.label };
    return NextResponse.json({ ...corpo, livro: await livro("fora_da_janela", corpo) });
  }
  const templateName = String(process.env.WHATSAPP_NIGHTLY_APPROACH_TEMPLATE || "").trim();
  if (!/^[a-z0-9_]{2,512}$/.test(templateName)) return NextResponse.json({ error: "Configure um template oficial em WHATSAPP_NIGHTLY_APPROACH_TEMPLATE." }, { status: 503 });

  const admin = getSupabaseAdmin();
  const { data: leads, error } = await admin.from("leads").select("id,organization_id,assigned_to,development_id,name,phone,status,metadata").not("assigned_to", "is", null).not("phone", "is", null).in("status", ["novo", "contato", "qualificacao"]).limit(100);
  if (error) return NextResponse.json({ error: "Não foi possível selecionar as leads." }, { status: 500 });
  let prepared = 0;
  let blocked = 0;
  // Jornadas que já existiam em SOMBRA e foram adotadas por este envio. Separado
  // de `prepared` porque são fatos diferentes: uma nasceu agora, a outra estava
  // esperando desde a entrada da lead com o braço já sorteado.
  let adotadas = 0;
  // `blocked` conta lead que a POLITICA barrou -- desfecho legitimo. `falhas`
  // conta o que QUEBROU. Somar os dois num numero so foi o que deixou este
  // vigia responder 200 enquanto nao conseguia escrever nada.
  const falhas: { leadId: string; etapa: string; code?: string }[] = [];
  for (const lead of leads ?? []) {
    const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
    const reactivation = metadata.reactivation && typeof metadata.reactivation === "object" ? metadata.reactivation as Record<string, unknown> : {};
    const messaging = metadata.messagingConsent && typeof metadata.messagingConsent === "object" ? metadata.messagingConsent as Record<string, unknown> : {};
    const consentBasis = String(reactivation.consentBasis || (messaging.whatsapp === true ? messaging.basis : "") || "").trim();
    if (!consentBasis) { blocked += 1; continue; }
    const phone = String(lead.phone).replace(/\D/g, "");
    const [{ data: existing }, { data: suppression }, { data: development }, { count: materialCount },{data:approvedTemplate},{data:contactEligibility}] = await Promise.all([
      admin.from("ai_sales_journeys").select("id,status,outbound_count,consent_basis,context_snapshot").eq("organization_id", lead.organization_id).eq("lead_id", lead.id).maybeSingle(),
      admin.from("messaging_suppressions").select("id").eq("organization_id", lead.organization_id).eq("channel", "whatsapp").eq("recipient", phone).maybeSingle(),
      lead.development_id ? admin.from("developments").select("id,name,developer_name,city,status,delivery_date").eq("id", lead.development_id).eq("organization_id", lead.organization_id).maybeSingle() : Promise.resolve({ data: null }),
      lead.development_id ? admin.from("project_materials").select("id", { count: "exact", head: true }).eq("organization_id", lead.organization_id).eq("development_id", lead.development_id).eq("is_current", true) : Promise.resolve({ count: 0 }),
      admin.from("message_templates").select("id").eq("organization_id",lead.organization_id).eq("channel","whatsapp").eq("name",templateName).eq("status","approved").maybeSingle(),admin.rpc("check_lead_contact_eligibility",{p_organization_id:lead.organization_id,p_lead_id:lead.id,p_channel:"whatsapp"}),
    ]);
    // ── A JORNADA EM SOMBRA É ADOTÁVEL, NÃO É BLOQUEIO ─────────────────────
    //
    // `lib/ai/jornada-em-sombra.ts` abre jornada para toda lead viva na entrada,
    // sem enviar nada. Se a simples existência dessa linha contasse como
    // `journey_already_exists`, este vigia passaria a barrar TODA lead no dia em
    // que o dono finalmente aprovasse o template — a peça construída para tirar
    // o experimento do zero teria travado o envio para sempre, em silêncio, com
    // HTTP 200 e `blocked` subindo.
    //
    // A distinção é medida na linha, não suposta: jornada em sombra é a que
    // nunca enviou (`outbound_count` zero) E carrega a base de consentimento da
    // sombra. Qualquer outra é jornada de verdade e continua ocupando a lead.
    const emSombra=existing?Number(existing.outbound_count||0)===0&&String(existing.consent_basis||"")===CONSENTIMENTO_DA_SOMBRA:false;
    const eligibility=evaluateNightlyEligibility({consent:Boolean(consentBasis)&&Boolean((contactEligibility as{eligible?:boolean}|null)?.eligible),suppressed:Boolean(suppression),officialApiReady:Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID&&process.env.WHATSAPP_ACCESS_TOKEN),approvedTemplate:Boolean(approvedTemplate),assignedBroker:Boolean(lead.assigned_to),projectReady:Boolean(development)&&Number(materialCount||0)>=2,existingJourney:Boolean(existing)&&!emSombra});if(!eligibility.eligible){blocked+=1;continue}
    let { data: conversation, error: erroConversa } = await admin.from("conversations").select("id").eq("organization_id", lead.organization_id).eq("lead_id", lead.id).eq("channel", "whatsapp").maybeSingle();
    if (!conversation && !erroConversa) {
      const criada = await admin.from("conversations").insert({ organization_id: lead.organization_id, lead_id: lead.id, channel: "whatsapp", external_thread_id: phone, assigned_to: lead.assigned_to, status: "open" }).select("id").single();
      conversation = criada.data;
      erroConversa = criada.error;
    }
    // `continue` mudo era o mesmo desfecho para "não deu" e "não precisava".
    if (erroConversa || !conversation) { falhas.push({ leadId: lead.id, etapa: "conversa", code: erroConversa?.code }); continue; }
    const projectName = development?.name || "o projeto de interesse";
    const content = `Abordagem noturna Atlas: apresentar ${projectName}, contextualizar ${development?.city || "a região"} e iniciar a descoberta consultiva. Em seguida: qualificar, simular e preparar proposta para revisão humana.`;
    const { data: message, error: erroMensagem } = await admin.from("messages").insert({ organization_id: lead.organization_id, conversation_id: conversation.id, direction: "outbound", channel: "whatsapp", recipient: phone, content, media: [{ type: "whatsapp_template", name: templateName, language: "pt_BR", journey: "nightly_sales" }], status: "queued" }).select("id").single();
    if (erroMensagem || !message) { falhas.push({ leadId: lead.id, etapa: "mensagem", code: erroMensagem?.code }); continue; }
    const snapshot = { project: development || null, currentMaterials: materialCount || 0, region: development?.city || null, mission: ["discovery", "qualification", "simulation_draft", "human_handoff"],policy:eligibility };
    // A jornada em sombra é ADOTADA por UPDATE, nunca por um segundo INSERT:
    // `unique (organization_id, lead_id)` recusaria com 23505, e a lead cairia
    // em `falhas` por estar exatamente no estado que este caminho deveria
    // aproveitar. O braço sorteado sobrevive à adoção — `braco`, `faixa` e
    // `coorte` são recopiados para o retrato novo, senão a lead que a IA
    // efetivamente atender sai do experimento no instante em que ele começa.
    const retratoDaSombra = emSombra && existing && existing.context_snapshot && typeof existing.context_snapshot === "object" ? existing.context_snapshot as Record<string, unknown> : null;
    const retratoAdotado = retratoDaSombra
      ? { ...snapshot, braco: retratoDaSombra.braco ?? null, faixa: retratoDaSombra.faixa ?? null, coorte: retratoDaSombra.coorte ?? null, bilhete: retratoDaSombra.bilhete ?? null, semente: retratoDaSombra.semente ?? null, sombraAdotadaEm: new Date().toISOString() }
      : snapshot;
    const camposDaJornada = { organization_id: lead.organization_id, lead_id: lead.id, broker_id: lead.assigned_to, development_id: lead.development_id, conversation_id: conversation.id, stage: "approach", status: "pending_approval", last_message_id: message.id, consent_basis: consentBasis, context_snapshot: retratoAdotado,policy_version:1,maximum_automated_stage:"qualification",outbound_count:1,morning_handoff_required:true };
    // Escrito em UMA linha de propósito. `check-vigia-nao-engole-erro.mjs` olha
    // para trás a partir de cada `await admin...insert|update(` até o `;` ou a
    // quebra de linha mais próxima e cobra um `=` no meio — é assim que ele pega
    // escrita cujo retorno ninguém segura. Com o ternário quebrado em três
    // linhas, o retorno ESTÁ capturado e o instrumento acusaria mesmo assim: é o
    // mesmo falso positivo que o próprio portão documenta ter tido no ternário
    // de `outbox/process`. A saída certa é o código caber no que o portão sabe
    // ler, não o portão parar de olhar.
    const { data: journey, error: erroJornada } = emSombra && existing ? await admin.from("ai_sales_journeys").update(camposDaJornada).eq("id", existing.id).select("id").single() : await admin.from("ai_sales_journeys").insert(camposDaJornada).select("id").single();
    if (erroJornada || !journey) { falhas.push({ leadId: lead.id, etapa: "jornada", code: erroJornada?.code }); continue; }
    if (emSombra) adotadas += 1;
    // ── O DEFEITO DE MAIOR CONSEQUENCIA DESTE ARQUIVO ──────────────────────
    // Este insert nao era verificado, e `prepared += 1` rodava logo abaixo.
    // Sem o pedido de aprovacao a jornada existe, a mensagem existe, e NAO HA
    // COMO APROVA-LA: ela nao aparece em /approvals. O contador dizia
    // "preparei" para trabalho que nasceu impossivel de concluir -- e a
    // resposta ainda afirmava requiresApproval:true, que era literalmente
    // falso para essa lead.
    const { error: erroAprovacao } = await admin.from("approval_requests").insert({ organization_id: lead.organization_id, request_type: "ai_nightly_approach", entity_type: "message", entity_id: message.id, payload: { journeyId: journey.id, leadId: lead.id, brokerId: lead.assigned_to, project: projectName, afterHour: 22, stages: snapshot.mission }, requested_by: lead.assigned_to });
    if (erroAprovacao) { falhas.push({ leadId: lead.id, etapa: "aprovacao", code: erroAprovacao.code }); continue; }
    prepared += 1;
  }
  const corpo = { prepared, blocked, adotadasDaSombra: adotadas, falhas: falhas.length, motivo: falhas.length ? "etapas_falharam" : prepared ? "ok" : "nada_elegivel", window: window.label, requiresApproval: true, maximumAutomatedStage: "qualification", proposalAllowed: false, morningHandoff: true };
  if (falhas.length) {
    logger.error("ai.nightly_sales_etapas_falharam", { falhas: falhas.length, etapas: [...new Set(falhas.map((f) => f.etapa))] });
    return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo) }, { status: 500 });
  }
  return NextResponse.json({ ...corpo, livro: await livro(prepared ? "ok" : "sem_trabalho", corpo) });
}
