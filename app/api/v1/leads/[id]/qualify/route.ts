import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ehLeadForaDaCarteira, requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { qualifyRealEstateLead } from "@/lib/ai/lead-qualification";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { registrarAtividade } from "@/lib/crm/registro-de-atividade";
import { lerHistoricoDoLead } from "@/lib/crm/historico-do-lead";
import { canonicoDeLegado, perfilConfirmadoNoCrm, respostasDoFormularioNoMetadata, respostasLegadoDoPerfil, respostasLegadoNoMetadata, unificarQualificacao } from "@/lib/crm/qualificacao-canonica";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const rate = checkRateLimit(clientKey(request, "lead-ai-qualification"), { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: "Aguarde antes de recalibrar novamente." }, { status: 429 });

  try {
    const body = await request.json().catch(() => ({})) as { answers?: Record<string, unknown> };
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const admin = getSupabaseAdmin();
    const [leadResult, historico, opportunitiesResult, propertiesResult, memoriesResult, perfilResult] = await Promise.all([
      admin.from("leads").select("id,email,phone,status,source,score,temperature,budget_min,budget_max,preferred_regions,bedrooms,purpose,assigned_to,next_action_at,last_interaction_at,created_at,metadata").eq("id", id).eq("organization_id", identity.organizationId).single(),
      // ── O ENGAJAMENTO CONTAVA A GAVETA ERRADA ─────────────────────────────
      //
      // Aqui havia um `count` em `activities` e só nela. Só que `activities` é o
      // ESPELHO da movimentação de funil (481 linhas, todas com
      // `metadata.moveId`), e o contato que o corretor registra cai em
      // `lead_events`. Medido em 02/08/2026: 55 contatos reais (39 `call` + 16
      // `whatsapp`) não entravam em conta nenhuma — a lead `b2432542` tinha 7
      // contatos anotados e a pontuação lhe dizia "1 interação registrada".
      //
      // A mesma união da ficha, do mesmo módulo: duas leituras do mesmo fato
      // precisam sair do mesmo lugar, ou voltam a divergir na próxima fase.
      lerHistoricoDoLead(admin, { organizationId: identity.organizationId, leadId: id, limite: 100 }),
      admin.from("opportunities").select("id", { count: "exact", head: true }).eq("lead_id", id).eq("organization_id", identity.organizationId),
      admin.from("properties").select("id,price,city,bedrooms,status").eq("organization_id", identity.organizationId).limit(500),
      identity.supabase.from("lead_source_memories").select("source_file,source_sheet,commercial_facts,excluded_sensitive_fields,duplicate_group_size,memory_role,created_at").eq("organization_id", identity.organizationId).eq("lead_id", id).eq("ai_eligible", true).order("created_at", { ascending: false }).limit(100),
      admin.from("lead_qualification_profiles").select("purpose_key,timeline_key,financing_key,budget_readiness_key,region_readiness_key,unit_profile_key,decision_role_key,contact_preference_key").eq("organization_id", identity.organizationId).eq("lead_id", id).maybeSingle(),
    ]);
    if (leadResult.error || !leadResult.data) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    // Gaveta que falhou derruba o engajamento sem ninguém pedir: a nota sai
    // menor e parece que o cliente não foi trabalhado. Não pode passar calada.
    for (const falha of historico.falhas) {
      logger.warn("lead.qualify.historico_read_failed", { leadId: id, fonte: falha.fonte, code: falha.code, message: falha.message });
    }

    const lead = leadResult.data;
    const metadata = typeof lead.metadata === "object" && lead.metadata ? lead.metadata as Record<string, unknown> : {};
    // ── DUAS GAVETAS PARA A MESMA RESPOSTA ────────────────────────────────
    //
    // Esta rota lia (e escrevia) apenas `metadata.qualificationAnswers`,
    // enquanto o corretor confirma na tela conversacional e aquilo cai em
    // `lead_qualification_profiles`. Medido em 02/08/2026: 13 das 15 leads com
    // resposta aqui não têm linha lá, e a lead `Danilo Ferreira` já divergia —
    // `recursos_proprios` no metadata contra `financing` no perfil.
    //
    // A canônica é o PERFIL (é o sujeito da transação de
    // `record_structured_qualification`; `leads.purpose` é o efeito colateral
    // dela). Então a leitura passa pelo unificador, e o que o corretor
    // confirmou lá vence o que ficou aqui — sem apagar nada.
    const existingUnificado = unificarQualificacao({
      perfil: perfilResult.data as Record<string, unknown> | null,
      respostasLegado: respostasLegadoNoMetadata(lead.metadata),
      finalidadeDaLead: lead.purpose as string | null,
      respostasDoFormulario: respostasDoFormularioNoMetadata(lead.metadata),
    });
    //
    // Só o que foi CONFIRMADO DENTRO DO CRM volta para `answers`: o objetivo
    // que a pessoa declarou no anúncio já entra na pontuação por `lead.purpose`
    // e não pode ser reescrito daqui — normalizar "morar" para "moradia" sem
    // ninguém pedir seria alterar o dado do cliente de carona numa correção.
    const existingAnswers = { ...respostasLegadoNoMetadata(lead.metadata) as Record<string, string>, ...respostasLegadoDoPerfil(perfilConfirmadoNoCrm(existingUnificado)) };
    const allowedAnswers: Record<string, Set<string>> = { purpose: new Set(["moradia","investimento"]), timeline: new Set(["ate_3_meses","3_a_6_meses","6_a_12_meses","sem_prazo"]), financing: new Set(["financiamento","recursos_proprios","permuta","nao_definido"]) };
    const newAnswers = Object.fromEntries(Object.entries(body.answers ?? {}).filter(([key, value]) => typeof value === "string" && allowedAnswers[key]?.has(value)).map(([key,value])=>[key,String(value)])) as Record<string,string>;
    const answers = { ...existingAnswers, ...newAnswers };
    if (answers.purpose) lead.purpose = answers.purpose;
    const matches = (propertiesResult.data ?? []).filter((property) => {
      const available = ["available", "ativo", "disponivel", "disponível"].includes(String(property.status ?? "").toLowerCase());
      const budgetFit = !lead.budget_max || !property.price || Number(property.price) <= Number(lead.budget_max) * 1.1;
      const bedroomFit = !lead.bedrooms || !property.bedrooms || Number(property.bedrooms) === Number(lead.bedrooms);
      const regionFit = !lead.preferred_regions?.length || !property.city || lead.preferred_regions.some((region: string) => property.city?.toLowerCase().includes(region.toLowerCase()));
      return available && budgetFit && bedroomFit && regionFit;
    });
    const qualification = qualifyRealEstateLead({
      lead,
      activityCount: historico.total,
      opportunityCount: opportunitiesResult.count ?? 0,
      propertyMatchCount: matches.length,
      answers,
      historicalMemories: memoriesResult.data ?? [],
    });

    // ── UMA PONTUAÇÃO, NÃO DUAS ──────────────────────────────────────────
    //
    // O banco tinha `score` e `score_ia` como se fossem a mesma coisa, e
    // discordavam: leads com score_ia 35 e 50 tinham score ZERO.
    //
    // `score_ia` é a canônica — é o que `lib/compat/live-writes.ts` grava na
    // criação, o que 27 arquivos leem, e o que `isQualifiedLead` consulta para
    // decidir se a conversão vai para a Meta. Esta rota gravava só `score`, que
    // ninguém lia para decidir nada.
    //
    // Gravamos as DUAS com o mesmo valor: `score_ia` porque é a verdade, e
    // `score` porque telas antigas ainda a leem. Escrever as duas juntas é o
    // que impede de divergirem de novo — remover a coluna antiga é migração
    // para outro dia, e até lá o risco não é a coluna existir: é ela mentir.
    //
    // `classificacao_ia` entra junto pelo mesmo motivo: era ela que ficava
    // congelada enquanto `temperature` avançava.
    const { error } = await admin.from("leads").update({
      score: qualification.score,
      score_ia: qualification.score,
      temperature: qualification.temperature,
      classificacao_ia: qualification.temperature,
      purpose: lead.purpose || null,
      metadata: { ...metadata, qualificationAnswers: answers, aiQualification: qualification },
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("organization_id", identity.organizationId);
    if (error) return NextResponse.json({ error: "Não foi possível salvar a qualificação." }, { status: 500 });

    // ── A RESPOSTA NOVA VAI PARA A GAVETA CANÔNICA ────────────────────────
    //
    // Sem isto, cada chamada desta rota criava mais uma divergência: a resposta
    // ficava só no metadata e o Copilot, o assistente de visita e o handoff
    // noturno continuavam sem enxergá-la. `metadata.qualificationAnswers` segue
    // sendo gravado (telas antigas e a nota de completude ainda o leem) — é o
    // mesmo remédio que este arquivo já aplica em `score`/`score_ia`: escrever
    // as duas JUNTAS é o que impede de divergirem de novo.
    //
    // A gravação passa pela MESMA RPC da tela conversacional, com o mesmo dono
    // e a mesma trilha em `lead_qualification_events`. Ela recusa quem não é o
    // corretor responsável, e essa recusa é para ser obedecida, não contornada:
    // gerente que recalibra continua recalibrando (a pontuação já foi salva
    // acima), só não assina uma confirmação no lugar do corretor. O motivo fica
    // no log e na resposta — falha silenciosa aqui recriaria o defeito.
    //
    // `sem_prazo` e `nao_definido` não têm par honesto no catálogo da fase e
    // por isso não sobem; medido na base viva, 0 leads usam qualquer um deles.
    const canonicoGravado: string[] = [];
    const canonicoRecusado: { campo: string; motivo: string }[] = [];
    for (const [campo, valor] of Object.entries(newAnswers)) {
      const canonico = canonicoDeLegado(campo, valor);
      if (!canonico) { canonicoRecusado.push({ campo, motivo: "sem_equivalente_canonico" }); continue; }
      const { error: rpcError } = await admin.rpc("record_structured_qualification", { p_actor_id: identity.userId, p_organization_id: identity.organizationId, p_lead_id: id, p_field: campo, p_value: canonico });
      if (rpcError) {
        canonicoRecusado.push({ campo, motivo: rpcError.message });
        logger.warn("lead.qualify.canonico_nao_gravado", { organizationId: identity.organizationId, leadId: id, campo, error: rpcError.message });
      } else canonicoGravado.push(campo);
    }

    // ── AS 14 QUALIFICAÇÕES PERDIDAS ─────────────────────────────────────
    //
    // Este insert mandava `title`, coluna que `activities` não tem. Cada
    // chamada devolvia 42703 e o `await` sem `error` jogava fora. Resultado
    // medido: 14 qualificações de IA rodaram, custaram chamada de modelo,
    // alteraram `score_ia` da lead — e não deixaram UMA linha de trilha.
    // Ninguém conseguia responder "por que o score desta lead mudou".
    //
    // Agora a manchete vai em `metadata.title` e o retorno é conferido.
    const trilha = await registrarAtividade(admin, {
      organizationId: identity.organizationId,
      leadId: id,
      userId: identity.userId,
      type: "ai_qualification",
      titulo: `Qualificação recalibrada: ${qualification.score}/100`,
      description: qualification.nextBestAction,
      metadata: { score: qualification.score, confidence: qualification.confidence, historicalDataConfidence: qualification.historicalIntelligence.dataConfidence, historicalAdjustment: qualification.historicalIntelligence.adjustment, temperature: qualification.temperature, answered: Object.keys(newAnswers) },
    });
    if (Object.keys(newAnswers).length) { const answerSignature = Object.entries(answers).sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => `${key}-${value}`).join("-"); const { error: campaignEventError } = await admin.from("campaign_events").upsert({ organization_id: identity.organizationId, lead_id: id, event_type: "qualification_signal", source: "crm-qualification", external_event_id: `qualification-${id}-${answerSignature}`, payload: { decision_signals: Object.entries(newAnswers).map(([key, value]) => `${key}:${value}`) }, occurred_at: new Date().toISOString() }, { onConflict: "organization_id,source,external_event_id", ignoreDuplicates: true });
    // O 200 de sucesso era devolvido mesmo com o upsert falhando (ex.: tabela
    // ausente pelo schema drift) — a resposta continua igual, mas a falha do
    // sinal de aprendizado agora fica registrada.
    if (campaignEventError) logger.warn("lead.qualify.campaign_event_failed", { organizationId: identity.organizationId, leadId: id, error: campaignEventError.message }); }
    // `trilha` vai no corpo, e não como 500, porque a qualificação JÁ foi
    // gravada em `leads` acima. Devolver erro aqui faria o corretor recalibrar
    // de novo por cima de um score que mudou — trocaria um dado perdido por um
    // dado duplicado. O que não pode é a falha continuar invisível.
    return NextResponse.json({ qualification: { ...qualification, progress: { answered: Object.keys(answers).filter((key) => ["purpose","timeline","financing"].includes(key)).length, total: 3, percent: Math.round(Object.keys(answers).filter((key) => ["purpose","timeline","financing"].includes(key)).length / 3 * 100) }, scoreChange: { previous: Number(lead.score || 0), current: qualification.score, delta: qualification.score - Number(lead.score || 0) } }, trilha: trilha.ok ? { registrada: true } : { registrada: false, motivo: trilha.code || "erro_desconhecido" }, gavetaCanonica: { gravados: canonicoGravado, recusados: canonicoRecusado } });
  } catch (error) {
    // Requalificar lead alheia reescreve `score_ia`, `temperature` e o metadata
    // inteiro — medido em 2026-07-29 com sessão de corretor: 200 e score do
    // colega alterado. É a pontuação que decide o que a Meta aprende.
    if (ehLeadForaDaCarteira(error)) {
      return NextResponse.json({ error: error.message, code: "QUALIFY_OUT_OF_SCOPE" }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Falha na qualificação.";
    const status = /sessão|token|autenticação|autoriz|organiza|escopo/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
