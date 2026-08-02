import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { calculateLeadScore } from "@/lib/atlas/scoring";
import { chaveDaCampanhaDoGoogle, lerAtribuicaoDoGoogle, nomeDaCampanhaDoGoogle } from "@/lib/marketing/google-attribution";
import { logger } from "@/lib/observability/logger";
import { hashMetaValue, queueMetaConversion } from "@/lib/meta/conversions";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { integrationCatalog } from "@/lib/integrations/catalog";
import { analyzeInboundWhatsApp } from "@/lib/ai/whatsapp-conversation-intelligence";
import { resolveLeadOwner, recordDistribution } from "@/lib/distribution/hierarchical-cascade";
import { metaGraphVersion, describeMetaGraphFailure } from "@/lib/meta/graph";
import { classifyOutboxFailure } from "@/lib/meta/outbox-failure";
import { closeOutboxEvent, recoverExpiredLeases } from "@/lib/integrations/outbox-lease";
import { AUTO_REGISTERED_CAMPAIGN_STATUS, autoRegisteredCampaignName } from "@/lib/marketing/campaign-provenance";
import { fecharPrimeiroContatoPorWhatsapp } from "@/lib/crm/whatsapp-first-contact";
import { linhaDeAtividade } from "@/lib/crm/registro-de-atividade";
import { descreverFalha } from "@/lib/integrations/descrever-falha";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";
import { abrirJornadaEmSombra } from "@/lib/ai/jornada-em-sombra";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(secret && token && token === secret);
}

type WhatsAppTemplate = { name: string; language: string };

/**
 * O que `reivindica_eventos_da_fila` devolve. A RPC retorna a linha INTEIRA de
 * `integration_outbox` (é `SETOF integration_outbox`), mas o worker só usa estes
 * campos — declarar só o que se usa evita depender de coluna que pode mudar.
 */
type OutboxEvent = {
  id: string;
  organization_id: string;
  topic: string;
  aggregate_id: string | null;
  payload: Record<string, unknown> | null;
  attempts: number;
};

/**
 * ── PREFLIGHT DO NÚMERO: cadastrado NÃO é ativo ─────────────────────────────
 *
 * Medido em 2026-07-28: o número configurado estava numa WABA aprovada, com
 * qualidade GREEN — e mesmo assim `code_verification_status: NOT_VERIFIED`,
 * `status: DISCONNECTED`, `platform_type: ON_PREMISE`. Um número assim não
 * envia nada; a Graph devolveria um erro opaco por mensagem, queimando a fila
 * inteira sem que ninguém soubesse a causa.
 *
 * Um GET barato antes do primeiro envio separa "o número não está pronto" (e
 * QUAL passo falta) de "o envio falhou". Cache em memória de 5 minutos: o
 * estado do número não muda por mensagem, e um GET por lote é o custo justo.
 *
 * Falha FECHADA: sem confirmação de VERIFIED + CLOUD_API, nenhum envio sai.
 * O token nunca aparece na mensagem de erro nem em log.
 */
const numeroWhatsAppCache: { verificadoEm: number; motivo: string | null } = { verificadoEm: 0, motivo: "ainda não verificado" };

async function preflightNumeroWhatsApp(phoneNumberId: string, accessToken: string, apiVersion: string): Promise<string | null> {
  if (Date.now() - numeroWhatsAppCache.verificadoEm < 5 * 60_000) return numeroWhatsAppCache.motivo;
  let motivo: string | null;
  try {
    const resposta = await fetch(
      `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}?fields=code_verification_status,platform_type,status`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) },
    );
    const dados = await resposta.json().catch(() => ({})) as { code_verification_status?: string; platform_type?: string; status?: string; error?: { message?: string } };
    if (!resposta.ok) {
      motivo = `a Graph não confirmou o número (${describeMetaGraphFailure(resposta.status, dados)})`;
    } else if (String(dados.code_verification_status).toUpperCase() !== "VERIFIED") {
      motivo = `o número nunca completou a verificação por código (${dados.code_verification_status}). Quem resolve: quem tem o aparelho, no WhatsApp Manager.`;
    } else if (String(dados.platform_type).toUpperCase() !== "CLOUD_API") {
      motivo = `o número está na plataforma ${dados.platform_type}, e este envio usa a Cloud API. Migre no WhatsApp Manager.`;
    } else {
      motivo = null;
    }
  } catch (erro) {
    // Rede fora não é número inválido — mas também não autoriza envio às cegas.
    motivo = `a verificação do número não completou (${erro instanceof Error ? erro.message : String(erro)})`;
  }
  numeroWhatsAppCache.verificadoEm = Date.now();
  numeroWhatsAppCache.motivo = motivo;
  return motivo;
}

async function deliverWhatsApp(recipient: string, content: string, template?: WhatsAppTemplate) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = metaGraphVersion();
  if (!phoneNumberId || !accessToken) throw new Error("Credenciais do WhatsApp não configuradas.");
  const bloqueio = await preflightNumeroWhatsApp(phoneNumberId, accessToken, apiVersion);
  if (bloqueio) throw new Error(`Envio bloqueado antes de sair: ${bloqueio}`);

  const response = await resilientFetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(template
      ? { messaging_product: "whatsapp", to: recipient, type: "template", template: { name: template.name, language: { code: template.language } } }
      : { messaging_product: "whatsapp", to: recipient, type: "text", text: { body: content } }),
  }, { timeoutMs: 30_000, retries: 0, operation: "WhatsApp" });

  const data = (await response.json()) as { messages?: Array<{ id: string }>; error?: { message?: string; code?: number; error_subcode?: number } };
  // describeMetaGraphFailure embute [code X/Y] na mensagem — é o que permite
  // classificar token expirado (190/463/467) sem enterrar a fila lá no catch.
  if (!response.ok) throw new Error(describeMetaGraphFailure(response.status, data));
  return data.messages?.[0]?.id ?? null;
}

async function fetchMetaLead(externalLeadId: string) {
  const accessToken = process.env.META_LEAD_ACCESS_TOKEN;
  const apiVersion = metaGraphVersion();
  if (!accessToken) throw new Error("META_LEAD_ACCESS_TOKEN não configurado.");
  const fields = "id,created_time,ad_id,adset_id,campaign_id,form_id,field_data";
  const response = await resilientFetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(externalLeadId)}?fields=${fields}`, { headers: { Authorization: `Bearer ${accessToken}` } }, { timeoutMs: 30_000, retries: 2, operation: "Meta Lead Ads" });
  const data = await response.json() as { id?: string; created_time?: string; ad_id?: string; adset_id?: string; campaign_id?: string; form_id?: string; field_data?: Array<{ name: string; values?: string[] }>; error?: { message?: string } };
  if (!response.ok) throw new Error(describeMetaGraphFailure(response.status, data));
  return data;
}

/**
 * Campos que a Meta pergunta em TODO formulário e que já têm coluna própria na
 * lead. Guardá-los também no metadata criaria duas verdades sobre o mesmo fato.
 */
const CAMPOS_PADRAO = new Set([
  "full_name", "name", "first_name", "last_name",
  "email", "phone", "phone_number",
]);

/**
 * AS RESPOSTAS QUE QUALIFICAM A LEAD.
 *
 * ── O que se perdia ─────────────────────────────────────────────────────────
 *
 * A ingestão lia exatamente três campos de `field_data` — nome, e-mail e
 * telefone — e descartava o resto. Toda pergunta de qualificação do formulário
 * ia embora no mesmo instante em que chegava.
 *
 * Medido nos 26 formulários da conta: 12 têm pergunta própria, e são as que
 * importam — "Você procura um imóvel para:", "Qual faixa de investimento?",
 * "Como pretende adquirir o imóvel?". Intenção, verba e forma de pagamento:
 * exatamente o que separa quem compra de quem está olhando.
 *
 * Por isso o corretor abre a lead e não sabe nada sobre ela. Não é falha dele
 * nem da tela — a informação chegou e foi jogada fora.
 *
 * ── Guardamos a PERGUNTA, não só a resposta ─────────────────────────────────
 *
 * "morar" sozinho não significa nada daqui a seis meses, quando o formulário
 * tiver mudado. `{ pergunta: "Você procura um imóvel para:", resposta: "morar" }`
 * continua significando. A chave crua (`name`) vai junto, porque é ela que
 * permite mapear para campo canônico depois sem depender do texto, que o
 * marketing reescreve.
 *
 * A ordem é preservada: a ordem do formulário é a ordem em que a pessoa
 * respondeu, e a primeira pergunta costuma ser a que mais qualifica.
 */
function respostasDeQualificacao(
  fields: Array<{ name: string; values?: string[] }> | undefined,
): Array<{ chave: string; resposta: string }> {
  if (!Array.isArray(fields)) return [];
  return fields
    .filter((f) => f?.name && !CAMPOS_PADRAO.has(String(f.name).toLowerCase()))
    .map((f) => ({
      chave: String(f.name),
      // Múltipla escolha vem como lista; juntar preserva tudo que foi marcado.
      resposta: (f.values ?? []).map((v) => String(v).trim()).filter(Boolean).join(" | "),
    }))
    .filter((r) => r.resposta.length > 0);
}

function metaField(fields: Array<{ name: string; values?: string[] }> | undefined, ...names: string[]) {
  const wanted = new Set(names);
  return fields?.find((field) => wanted.has(field.name))?.values?.[0]?.trim() || null;
}

function normalizeMetaPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

// Linhagem publicada em metadata.meta.campaignLinkage: a única forma de saber
// DEPOIS por que um lead ficou (ou não) preso a uma campanha. marketing_campaigns
// não tem coluna de procedência, então a procedência mora no lead.
type CampaignLinkage =
  | "campanha_encontrada"
  | "campanha_registrada_pela_ingestao"
  | "sem_id_de_campanha_no_evento"
  | "registro_de_campanha_indisponivel";

// Código do Postgres para foreign_key_violation. Ver o fallback no insert do
// lead: enquanto 20260722175000 não estiver aplicada, o gatilho de atribuição
// repassa leads.campaign_id para uma FK que ainda aponta para public.campaigns.
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Resolve o id externo da campanha Meta em leads.campaign_id.
 *
 * Sem isto o identificador vivia só dentro de metadata.meta e TODO agregado por
 * campanha (campaign-quality, cost-report, conselheiro Andromeda) somava zero:
 * o bucket é indexado por leads.campaign_id e a coluna nunca era escrita.
 *
 * A linha em marketing_campaigns é criada quando não existe porque campanha é
 * REGISTRO do que a Meta já fez, não ação de efeito externo — nenhum caminho de
 * execução lê marketing_campaigns (app/api/v1/marketing/execute age sobre ids
 * informados na requisição + approval_requests aprovado). Sem essa criação o elo
 * seguiria rompido na prática: a tabela está vazia no banco vivo, então todo
 * lead cairia em campaign_id nulo de novo.
 *
 * NADA NASCE ATIVO: o CHECK da tabela só admite
 * ACTIVE/PAUSED/COMPLETED/ARCHIVED e o Atlas nunca consultou o estado desta
 * campanha na Meta (o webhook de leadgen não traz status e a Graph API não é
 * chamada aqui). Gravar 'ACTIVE' seria asserir um estado que ninguém verificou
 * — a lista de campanhas imprime "META · ACTIVE" como se fosse fato. Então a
 * ingestão grava PAUSED (o valor que NÃO afirma "está no ar") e marca a
 * procedência no início do nome, com o prefixo estável de
 * lib/marketing/campaign-provenance: a tela troca o status por "estado não
 * verificado". started_at fica nulo em vez de inferido, e o nome carrega o id
 * externo porque o evento da Meta não traz nome de campanha.
 *
 * Falha de registro NUNCA derruba a ingestão: o lead entra com campaign_id nulo
 * e a linhagem explica o motivo. Perder o lead seria pior que perder o elo.
 */
async function resolveMetaCampaign(
  admin: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  externalCampaignId: string | null,
): Promise<{ campaignId: string | null; linkage: CampaignLinkage }> {
  if (!externalCampaignId) return { campaignId: null, linkage: "sem_id_de_campanha_no_evento" };

  // A chave é (organization_id, platform, external_campaign_id) — a mesma do
  // unique da produção e da migration 20260722174000. Filtrar platform não é
  // detalhe: sem isso uma campanha cadastrada à mão como 'GOOGLE' com o mesmo id
  // externo seria sequestrada para um lead da Meta, e o insert deste caminho
  // colidiria com um índice que o lookup não enxerga.
  // .order(created_at) garante escolha determinística mesmo em banco que ainda
  // não recebeu o índice único (duas linhas herdadas de uma corrida antiga
  // fariam .limit(1) escolher linha arbitrária a cada leitura).
  const lookup = () => admin
    .from("marketing_campaigns")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("platform", "META")
    .eq("external_campaign_id", externalCampaignId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const existing = await lookup();
  if (existing.error) {
    logger.warn("outbox.campaign_lookup_failed", { organizationId, externalCampaignId, code: existing.error.code });
    return { campaignId: null, linkage: "registro_de_campanha_indisponivel" };
  }
  if (existing.data?.id) return { campaignId: existing.data.id, linkage: "campanha_encontrada" };

  const created = await admin.from("marketing_campaigns").insert({
    organization_id: organizationId,
    // O nome é o único canal de procedência que a tabela oferece (não há coluna
    // de metadados, e criar uma tornaria a ingestão refém da ordem de deploy):
    // quem abrir a lista vê que a linha veio da ingestão e que o nome real ainda
    // não é conhecido, em vez de um rótulo inventado.
    name: autoRegisteredCampaignName(externalCampaignId, "ingestao"),
    platform: "META",
    external_campaign_id: externalCampaignId,
    status: AUTO_REGISTERED_CAMPAIGN_STATUS,
  }).select("id").single();
  if (created.data?.id) {
    logger.info("outbox.campaign_autoregistered", { organizationId, externalCampaignId, campaignId: created.data.id });
    return { campaignId: created.data.id, linkage: "campanha_registrada_pela_ingestao" };
  }

  // Corrida entre workers: com o unique de 20260722174000 aplicado (produção já
  // tinha o equivalente), quem perde relê em vez de duplicar a campanha.
  const retry = await lookup();
  if (retry.data?.id) return { campaignId: retry.data.id, linkage: "campanha_encontrada" };
  logger.warn("outbox.campaign_register_failed", { organizationId, externalCampaignId, code: created.error?.code });
  return { campaignId: null, linkage: "registro_de_campanha_indisponivel" };
}

/**
 * Campanha registrada NESTA iteração para um lead que não entrou = linha órfã.
 * Ela apareceria no filtro de campanhas da tela de leads e nos relatórios com
 * zero lead — registro de um lead que nunca existiu. Só apaga quando a linha
 * nasceu aqui E não ficou com nenhum lead preso a ela; qualquer outra coisa é
 * dado de outra pessoa e fica onde está.
 */
async function discardOrphanCampaign(
  admin: ReturnType<typeof getSupabaseAdmin>,
  link: { campaignId: string | null; linkage: CampaignLinkage } | null,
  organizationId: string,
) {
  if (!link?.campaignId || link.linkage !== "campanha_registrada_pela_ingestao") return;
  const { count, error } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("campaign_id", link.campaignId);
  if (error || (count ?? 0) > 0) return;
  await admin.from("marketing_campaigns").delete().eq("id", link.campaignId).eq("organization_id", organizationId);
  logger.warn("outbox.campaign_autoregistered_discarded", { organizationId, campaignId: link.campaignId });
}

// Falha de credencial em sequência: com o token morto, os 19 eventos seguintes
// repetem a MESMA chamada condenada a cada rodada, empurrando a conta para o
// rate limit. Três seguidas bastam para concluir que o problema é a credencial,
// não o evento.
const CREDENTIAL_FAILURE_BREAK = 3;

/**
 * ── KILL SWITCH ─────────────────────────────────────────────────────────────
 *
 * Uma fila que envia mensagem de verdade precisa de um jeito de PARAR sem apagar
 * o agendamento — desinstalar o cron para conter um incidente é a decisão que
 * depois ninguém lembra de desfazer, e a fila fica morta por semanas. Foi
 * exatamente esse o estado medido em 2026-07-30: 44h49m entre enfileirar e a
 * primeira tentativa.
 *
 * O cuidado que decide se isto ajuda ou atrapalha: um kill switch INVISÍVEL é
 * indistinguível de pane. Por isso ele (a) devolve 200, para o cron não disparar
 * alarme de erro sobre uma pausa intencional, (b) diz que está pausado e por
 * quem, e (c) aparece em `/api/v1/ready`. Pausa declarada é governança; pausa
 * silenciosa é o mesmo defeito que este projeto já pagou várias vezes — zero
 * mudo que parece medida.
 */
export function outboxPausado(): { pausado: boolean; motivo: string | null } {
  const bruto = String(process.env.ATLAS_OUTBOX_PAUSADO ?? "").trim().toLowerCase();
  const pausado = bruto === "1" || bruto === "true" || bruto === "sim";
  return {
    pausado,
    motivo: pausado
      ? String(process.env.ATLAS_OUTBOX_PAUSADO_MOTIVO ?? "").trim() ||
        "Pausado por ATLAS_OUTBOX_PAUSADO, sem motivo declarado. Declare o motivo — pausa sem justificativa vira pausa esquecida."
      : null,
  };
}

/**
 * ── O LIVRO DE EXECUÇÕES CHEGA AO VIGIA QUE ENVIA MENSAGEM (02/08/2026) ──────
 *
 * Este é o último dos treze, e foi deixado por último de propósito: é o único
 * que fala com o cliente. Um registro errado aqui não polui um painel — ele
 * mente sobre uma mensagem que saiu (ou não saiu) para uma pessoa real.
 *
 * O que estava indistinguível, medido lendo os quatro `return` deste arquivo:
 *
 *   · PAUSADO por variável de ambiente ....... 200 {pausado:true}
 *   · fila VAZIA ............................. 200 {claimed:0}
 *   · lote inteiro entregue ................... 200 {delivered:N}
 *   · parado por CREDENCIAL QUEBRADA .......... 200 {stoppedEarly:"token_unhealthy"}
 *   · parado por LIMITE DA PLATAFORMA ......... 200 {stoppedEarly:"rate_limited"}
 *
 * Os dois últimos são opostos e saíam iguais. `rate_limited` é a plataforma
 * segurando o ritmo — é o comportamento esperado, e acender alarme nele ensina
 * a operação a ignorar alarme. `token_unhealthy` é credencial quebrada: nenhuma
 * mensagem sai até uma PESSOA renovar o token, e nesse caso o agendador
 * (.github/workflows/atlas-vigias.yml) precisa ficar VERMELHO — ele só olha o
 * código HTTP, e o arquivo dele promete exatamente isso.
 *
 * Por isso `token_unhealthy` passa a devolver 500. É a única mudança de código
 * HTTP deste arquivo, e ela existe porque um 200 ali era a definição de falha
 * em silêncio: a fila para de andar e ninguém fica sabendo.
 *
 * ── O QUE EU DELIBERADAMENTE NÃO FIZ, E POR QUÊ ─────────────────────────────
 *
 * `failed > 0` NÃO vira `falhou` no livro. A fila tem `attempts`, reentrega e
 * `dead_letter`: falha de entrega individual é um estado PREVISTO, tratado pela
 * própria máquina. Marcar `falhou` aqui deixaria o livro vermelho todo dia por
 * um número inválido na base, e vermelho permanente é indistinguível de nenhum
 * vermelho. O caso fica visível pelo `motivo`, não pelo desfecho.
 *
 * Se um dia a medição mostrar lote inteiro falhando sem causa de credencial,
 * este é o lugar de apertar — com o número na mão, não por simetria.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  // O relógio começa ANTES da checagem de pausa: "recusei porque estou pausado"
  // também é execução, e é justamente a que hoje some sem deixar rastro nenhum.
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (desfecho: "ok" | "sem_trabalho" | "fora_da_janela" | "falhou", resposta: Record<string, unknown>, erro?: string) =>
    registrarExecucao({ vigia: "outbox", rota: "/api/v2/outbox/process", origem, iniciadoEm, desfecho, resposta, erro });

  /**
   * ── A TRANSIÇÃO DE ESTADO QUE NINGUÉM CONFERIA ─────────────────────────────
   *
   * Medido em 02/08/2026 por `scripts/check-vigia-nao-engole-erro.mjs`: 17
   * silêncios neste arquivo, e ele era a única das 13 rotas com algum.
   *
   * O padrão era sempre o mesmo: uma escrita de status esperada com `await` e o
   * retorno jogado fora. (Este comentário evita reescrever a forma literal —
   * a varredura do portão é textual e não tira comentário, então o exemplo
   * dentro de um comentário contaria como um silêncio que não existe.)
   * Cada uma dessas escritas marca o fim de uma decisão que JÁ foi tomada:
   * "esta mensagem foi bloqueada por opt-out", "este evento entrou em
   * processamento", "este contato do lote falhou". Se a marcação não grava, a
   * decisão aconteceu no mundo e não aconteceu no banco — e o próximo ciclo
   * reprocessa como se nada tivesse sido decidido.
   *
   * ── POR QUE VISÍVEL E NÃO ALARME ───────────────────────────────────────────
   *
   * A tentação é `throw`. Seria errado aqui: a fila tem `attempts`, reentrega e
   * `dead_letter`, e o evento já está reivindicado — derrubar o laço no meio
   * abandonaria os outros eventos do lote com o lease preso até expirar. Pior,
   * faria o agendador ficar vermelho por uma transição que a própria máquina
   * recupera no ciclo seguinte, e vermelho recorrente que se recupera sozinho é
   * o que ensina a operação a ignorar vermelho.
   *
   * Então a falha é CONTADA, nomeada e devolvida no corpo e no livro. Ela deixa
   * de ser invisível sem virar pânico. Se o número deixar de ser zero de forma
   * consistente, aí sim há causa para investigar — e agora existe o número.
   */
  const escritasQueFalharam: { onde: string; code?: string }[] = [];
  const gravar = async (
    onde: string,
    operacao: PromiseLike<{ error: { code?: string; message: string } | null }>,
  ): Promise<boolean> => {
    const { error } = await operacao;
    if (!error) return true;
    escritasQueFalharam.push({ onde, code: error.code });
    logger.error("outbox.gravacao_nao_confirmada", { onde, code: error.code, message: error.message });
    return false;
  };

  // Antes de qualquer leitura da fila: se está pausado, não trave linha nenhuma.
  // Reclamar um evento e devolvê-lo deixa `attempts` incrementado por uma
  // tentativa que nunca aconteceu.
  const pausa = outboxPausado();
  if (pausa.pausado) {
    logger.warn("outbox.pausado", { motivo: pausa.motivo });
    // `fora_da_janela` e não `falhou`: pausa é decisão humana declarada, e o
    // livro precisa saber diferenciar "alguém desligou" de "quebrou".
    const corpo = { pausado: true, processados: 0, motivo: pausa.motivo };
    return NextResponse.json({ ...corpo, livro: await livro("fora_da_janela", corpo) }, { status: 200 });
  }

  const workerId = `hostinger-${crypto.randomUUID()}`;
  const admin = getSupabaseAdmin();
  const leases = await recoverExpiredLeases(admin);

  /**
   * ── UM RELÓGIO SÓ, E UMA VIAGEM SÓ ────────────────────────────────────────
   *
   * Aqui havia:
   *
   *   .lte("available_at", new Date().toISOString())   ← relógio do PROCESSO
   *   ...depois, por linha:
   *   .update({ locked_at: new Date().toISOString() }) ← relógio do PROCESSO
   *
   * `available_at` e `locked_at` são escritos pelo PostgreSQL. Compará-los com o
   * relógio do Node é comparar relógios diferentes — e medido em 2026-07-31, um
   * evento recém-inserido apareceu 6 ms À FRENTE deste processo, inelegível por
   * milissegundos num campo que o próprio banco acabara de escrever.
   *
   * `reivindica_eventos_da_fila` seleciona, valida e adquire numa instrução só,
   * com `now()` do banco e `FOR UPDATE SKIP LOCKED`. Não há tolerância de
   * relógio porque não há dois relógios. E `attempts` incrementa na
   * REIVINDICAÇÃO: tentativa que morre no meio ainda conta, senão um evento
   * problemático gira para sempre sem nunca chegar ao dead_letter.
   */
  const { data: events, error } = await admin.rpc("reivindica_eventos_da_fila", {
    p_worker: workerId,
    p_limite: 20,
  });

  if (error) {
    const corpo = { error: error.message, motivo: "reivindicacao_falhou" };
    return NextResponse.json({ ...corpo, livro: await livro("falhou", { motivo: corpo.motivo }, error.message) }, { status: 500 });
  }

  let delivered = 0;
  let failed = 0;
  let processed = 0;
  let consecutiveCredentialFailures = 0;
  let stoppedEarly: string | null = null;

  for (const event of (events ?? []) as OutboxEvent[]) {
    /**
     * A RPC já reivindicou: as linhas chegam com `status='processing'`, lock
     * posto e `attempts` INCREMENTADO. O compare-and-swap por linha que existia
     * aqui virou redundante — e mantê-lo incrementaria a tentativa duas vezes.
     *
     * `originalAttempts` é o valor ANTES desta reivindicação, e ele importa: os
     * caminhos `token_unhealthy` e `rate_limited` gravam `attempts:
     * originalAttempts` justamente para NÃO queimar tentativa por um problema
     * temporário. Sem este ajuste, uma mensagem válida marcharia para o
     * dead_letter por causa de um token expirado.
     */
    const attempts = Number(event.attempts || 0);
    const originalAttempts = Math.max(0, attempts - 1);
    processed += 1;

    try {
      const now = new Date().toISOString();
      if (event.topic === "message.send" && event.aggregate_id) {
        const { data: message, error: messageError } = await admin.from("messages").select("id,channel,recipient,content,media,conversation_id").eq("id", event.aggregate_id).maybeSingle();
        if (messageError || !message) throw messageError ?? new Error("Mensagem não encontrada.");
        if (message.channel !== "whatsapp") throw new Error(`Canal ainda não conectado ao worker: ${message.channel}`);
        const normalizedRecipient = String(message.recipient || "").replace(/\D/g, "");
        // ── ERRO DE CONSULTA NÃO PODE VIRAR CONSENTIMENTO ────────────────────
        //
        // Até 02/08/2026 esta linha era `const { data: universalSuppression } =`
        // — o `error` ia para o lixo. A pergunta que ela faz é "este número
        // pediu para não receber?". Falhando a consulta, `universalSuppression`
        // fica `undefined`, o `if` abaixo não entra, e a mensagem SAI.
        //
        // Ou seja: banco indisponível, RLS negando, coluna renomeada — qualquer
        // uma dessas era lida como "não, ele não bloqueou". A ausência de
        // resposta virava um SIM para enviar.
        //
        // A linha 406 logo acima já fazia certo com a própria mensagem
        // (`if (messageError || !message) throw`). O padrão estava a três linhas
        // de distância.
        //
        // Opt-out é promessa ao cliente e é lei. Na dúvida não se envia: o
        // `throw` cai no catch do laço, que marca o evento e tenta de novo
        // depois — atraso é recuperável, mensagem indevida não é.
        const suppressionQuery = await admin.from("messaging_suppressions").select("id").eq("organization_id", event.organization_id).eq("channel", "whatsapp").eq("recipient", normalizedRecipient).maybeSingle();
        if (suppressionQuery.error) throw suppressionQuery.error;
        const universalSuppression = suppressionQuery.data;
        if (universalSuppression) {
          await gravar("messages.opt_out_universal", admin.from("messages").update({ status: "failed", error: "Contato bloqueado por opt-out." }).eq("id", message.id));
          // 'blocked' é terminal e diz a verdade (não foi entregue). Onde o
          // CHECK ainda não admite o valor, cai para 'delivered' — o mesmo
          // desfecho que o ramo de opt-out do lote de reativação já usa: sem
          // entrega e sem reenvio. Ficar preso em 'processing' era o único
          // resultado inaceitável.
          await closeOutboxEvent(admin, event.id, { status: "blocked", delivered_at: now, locked_at: null, locked_by: null, last_error: "Bloqueado por opt-out antes do envio." }, "delivered");
          continue;
        }
        const media = Array.isArray(message.media) ? message.media : [];
        const templateItem = media.find((item) => item && typeof item === "object" && (item as { type?: unknown }).type === "whatsapp_template") as { name?: string; language?: string; batchId?: string } | undefined;
        if (templateItem?.batchId) {
          const [{ data: batch }, { data: suppression }] = await Promise.all([
            admin.from("lead_reactivation_batches").select("status,quality_status").eq("id", templateItem.batchId).eq("organization_id", event.organization_id).single(),
            // A supressão é gravada com o número só-dígitos (ver opt-out no webhook).
            // Consultar com o recipient cru (com +, espaço, hífen) NUNCA achava a
            // linha — o opt-out valia num caminho e falhava neste. Mesma chave sempre.
            admin.from("messaging_suppressions").select("id").eq("organization_id", event.organization_id).eq("channel", "whatsapp").eq("recipient", message.recipient.replace(/\D/g, "")).maybeSingle(),
          ]);
          if (!batch || !["queued", "running"].includes(batch.status) || batch.quality_status === "red") {
            await closeOutboxEvent(admin, event.id, { status: "pending", available_at: new Date(Date.now() + 60 * 60_000).toISOString(), locked_at: null, locked_by: null, last_error: "Campanha pausada por governança ou qualidade." });
            continue;
          }
          if (suppression) {
            await Promise.all([
              gravar("messages.opt_out_no_lote", admin.from("messages").update({ status: "failed", error: "Contato bloqueado por opt-out." }).eq("id", message.id)),
              gravar("lead_reactivation_contacts.bloqueado", admin.from("lead_reactivation_contacts").update({ status: "blocked", block_reason: "opt_out" }).eq("batch_id", templateItem.batchId).eq("message_id", message.id)),
            ]);
            await closeOutboxEvent(admin, event.id, { status: "delivered", delivered_at: now, locked_at: null, locked_by: null, last_error: "Bloqueado por opt-out antes do envio." });
            continue;
          }
        }
        const template = templateItem?.name ? { name: templateItem.name, language: templateItem.language || "pt_BR" } : undefined;

        // JANELA DE 24 HORAS (política da Meta): texto livre só pode ser
        // enviado se o cliente mandou mensagem nas últimas 24h; fora disso,
        // apenas template aprovado. Antes esta checagem não existia — o envio
        // fora da janela virava erro da Meta (code 131047), consumia as 5
        // tentativas e morria em dead_letter. Como a janela não reabre por
        // insistência do NOSSO lado, reprocessar é inútil: falha TERMINAL, com
        // status visível na mensagem e instrução de usar template.
        if (!template) {
          const digits = String(message.recipient || "").replace(/\D/g, "");
          const windowStart = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
          const { data: lastInbound, error: inboundError } = await admin
            .from("messages")
            .select("id")
            .eq("organization_id", event.organization_id)
            .eq("channel", "whatsapp")
            .eq("direction", "inbound")
            .gte("created_at", windowStart)
            .or(`recipient.eq.${digits},sender.eq.${digits}`)
            .limit(1)
            .maybeSingle();
          // Erro de consulta não decide política: segue para o envio e deixa a
          // Meta arbitrar (comportamento anterior). Só a AUSÊNCIA comprovada de
          // inbound recente bloqueia aqui.
          if (!inboundError && !lastInbound) {
            const reason = "Fora da janela de 24h do WhatsApp: o cliente não escreveu nas últimas 24 horas. Use um template aprovado.";
            await gravar("messages.fora_da_janela_24h", admin.from("messages").update({ status: "failed", error: reason }).eq("id", message.id));
            await closeOutboxEvent(admin, event.id, { status: "dead_letter", locked_at: null, locked_by: null, last_error: reason });
            // Entra na DLQ com retry HUMANO: se o cliente responder depois, a
            // janela reabre e o reenvio deliberado passa — mas a decisão de
            // reenviar uma mensagem antiga é de gente, não do worker.
            // A carta morta e a ULTIMA linha de defesa: e onde a falha fica
            // registrada depois que as tentativas acabaram. Se o insert DELA
            // falhar em silencio, a falha some do mundo -- nao existe camada
            // abaixo desta para pegar. Ate 02/08/2026 o retorno era descartado.
            const cartaMorta = await admin.from("dead_letter_events").insert({
              organization_id: event.organization_id,
              outbox_event_id: event.id,
              topic: event.topic,
              payload: event.payload,
              error_message: reason,
              attempts,
            });
            if (cartaMorta.error) logger.error("outbox.carta_morta_nao_gravada", { eventId: event.id, topic: event.topic, motivoOriginal: reason, code: cartaMorta.error.code });
            logger.warn("outbox.whatsapp_outside_window", { eventId: event.id, organizationId: event.organization_id, messageId: message.id });
            failed += 1;
            continue;
          }
        }

        const externalMessageId = await deliverWhatsApp(message.recipient, message.content, template);
        // ── A LINHA MAIS PERIGOSA DO ARQUIVO ──────────────────────────────────
        //
        // A mensagem JÁ SAIU. O WhatsApp já entregou ao cliente. Se este
        // `update` falhar e ninguém olhar, a mensagem continua `queued` no
        // banco — e na próxima rodada do vigia ela é ENVIADA DE NOVO. O cliente
        // recebe duas vezes, três, até alguém perceber.
        //
        // Até 02/08/2026 o retorno era descartado. Não dá para desfazer o envio,
        // então não há como "consertar" aqui — o que dá é NÃO DEIXAR PASSAR
        // CALADO. O erro vai para o log com o id externo, que é a única prova de
        // que a entrega aconteceu, e o `throw` impede que o evento seja fechado
        // como sucesso enquanto o banco discorda da realidade.
        const marcouEnviada = await admin.from("messages").update({ status: "sent", sent_at: now, external_message_id: externalMessageId, error: null }).eq("id", message.id);
        if (marcouEnviada.error) {
          logger.error("outbox.mensagem_enviada_sem_registro", {
            messageId: message.id,
            externalMessageId,
            code: marcouEnviada.error.code,
          });
          throw marcouEnviada.error;
        }

        // ── ENVIAR É PRIMEIRO CONTATO ─────────────────────────────────────
        //
        // Este é o sentido pleno: foi a empresa que buscou a pessoa, dentro do
        // prazo. Sem isto, o corretor mandava WhatsApp PELO Atlas e o próprio
        // Atlas continuava cobrando "sem primeiro contato" — medido: 217 leads,
        // uma contatada.
        //
        // Best-effort: falha aqui não pode desfazer uma mensagem já entregue ao
        // cliente.
        if (message.conversation_id) {
          const { data: conversa, error: erroDaConversa } = await admin
            .from("conversations")
            .select("lead_id")
            .eq("id", message.conversation_id)
            .maybeSingle();
          // "não consegui ler a conversa" e "a conversa não tem lead" levavam ao
          // MESMO lugar: o primeiro contato não fechava e ninguém sabia por quê.
          if (erroDaConversa) logger.warn("outbox.conversa_nao_lida", { conversationId: message.conversation_id, code: erroDaConversa.code });
          if (conversa?.lead_id) {
            const fechamento = await fecharPrimeiroContatoPorWhatsapp(admin, {
              organizationId: event.organization_id,
              leadId: conversa.lead_id,
              origem: "saida",
              ocorridoEm: now,
            });
            if (fechamento.fechou) {
              logger.info("outbox.primeiro_contato_fechado", {
                organizationId: event.organization_id, leadId: conversa.lead_id, origem: "saida",
              });
            }
          }
        }
        if (templateItem?.batchId) {
          await gravar("lead_reactivation_contacts.enviado", admin.from("lead_reactivation_contacts").update({ status: "sent" }).eq("batch_id", templateItem.batchId).eq("message_id", message.id));
          const { count: remaining } = await admin.from("lead_reactivation_contacts").select("id", { count: "exact", head: true }).eq("batch_id", templateItem.batchId).in("status", ["pending_approval", "queued"]);
          await gravar("lead_reactivation_batches.progresso", admin.from("lead_reactivation_batches").update({ status: remaining ? "running" : "completed", updated_at: now }).eq("id", templateItem.batchId));
        }
      } else if (event.topic === "meta.lead.fetch" && event.aggregate_id) {
        const { data: metaEvent, error: metaError } = await admin.from("meta_lead_events").select("id,organization_id,source_id,external_lead_id,status,page_id,form_id,ad_id,adset_id,campaign_external_id").eq("id", event.aggregate_id).maybeSingle();
        /* `.single()` até 02/08/2026, e a mensagem abaixo NUNCA aparecia.
           Medido na fila de produção: um item morreu com
           "Cannot coerce the result to a single JSON object [code PGRST116]"
           — o erro cru do PostgREST. A causa real é banal: o
           `aggregate_id` aponta para uma linha de `meta_lead_events` que
           não existe mais (confirmado, a consulta devolve zero linhas).

           `.single()` transforma "zero linhas" em ERRO. Então `metaError`
           vinha preenchido, vencia o `??`, e a frase em português que o
           autor escreveu para exatamente este caso ficava inalcançável.
           O operador lia um código PostgREST e ia procurar defeito de
           serialização, quando o que havia era um agregado órfão.

           `.maybeSingle()` devolve `data: null, error: null` quando não
           acha — aí a guarda abaixo dispara a mensagem certa. Mesma
           família de "Falha desconhecida" que este repositório já
           corrigiu no `descreverFalha`: o diagnóstico existia e era
           descartado no caminho. */
        if (metaError || !metaEvent) throw metaError ?? new Error(`Evento Meta ${event.aggregate_id} não encontrado — agregado órfão na fila.`);
        if (metaEvent.status !== "imported") {
          await gravar("meta_lead_events.processando", admin.from("meta_lead_events").update({ status: "processing", last_error: null }).eq("id", metaEvent.id));
          const [leadData, sourceResult] = await Promise.all([
            fetchMetaLead(metaEvent.external_lead_id),
            admin.from("meta_lead_sources").select("active,default_owner_id,name,conversion_sharing_enabled,consent_basis,development_id").eq("id", metaEvent.source_id).single(),
          ]);
          const fields = leadData.field_data;
          const respostas = respostasDeQualificacao(fields);
          const name = metaField(fields, "full_name", "name") || [metaField(fields, "first_name"), metaField(fields, "last_name")].filter(Boolean).join(" ") || "Lead Meta";
          const email = metaField(fields, "email");
          const phone = metaField(fields, "phone_number", "phone");
          // Erro aqui virava "não existe" e a lead nascia DUPLICADA. Mesma
          // doença da consulta de opt-out acima: a pergunta é "esta lead já
          // entrou?" e a ausência de resposta era lida como "não". Ver o
          // gêmeo no ramo de portal, mais abaixo.
          const existingLeadQuery = await admin.from("leads").select("id").eq("organization_id", metaEvent.organization_id).contains("metadata", { meta: { externalLeadId: metaEvent.external_lead_id } }).maybeSingle();
          if (existingLeadQuery.error) throw existingLeadQuery.error;
          const existingLead = existingLeadQuery.data;
          // ── FONTE INATIVA RETÉM, NÃO CRIA ───────────────────────────────
          //
          // `active: false` significa "esta fonte ainda não foi aceita na
          // operação". Sem esta guarda o processador criava a lead assim mesmo,
          // e a flag não significava nada — qualquer formulário criado na
          // página da Meta injetaria leads no CRM sem ninguém decidir.
          //
          // O evento fica gravado com o payload inteiro: nada se perde, e a
          // lead aparece em Marketing → Leads represadas para a liderança
          // liberar. Reter é diferente de descartar, e é o ponto todo.
          if (sourceResult.data?.active === false) {
            await gravar("meta_lead_events.fonte_inativa", admin.from("meta_lead_events").update({
              status: "blocked",
              last_error: "Fonte inativa: libere o formulário em Marketing → Leads represadas para esta lead entrar.",
            }).eq("id", metaEvent.id));
            continue;
          }

          // O evento do webhook (metaEvent) e a leitura da Graph (leadData) podem
          // divergir; a Graph é a fonte mais fresca, o webhook é o fallback.
          const campaignExternalId = String(leadData.campaign_id || metaEvent.campaign_external_id || "").trim() || null;
          // Distribuição RBAC 10/10: dono padrão validado → cascata corretor→gerente→fila
          // (determinística, capacity-aware, offline-safe). Auditoria em lead_distribution_history.
          const [ownership, campaignLink] = existingLead
            ? ([null, null] as const)
            : await Promise.all([
              resolveLeadOwner(admin, metaEvent.organization_id, sourceResult.data?.default_owner_id || null),
              resolveMetaCampaign(admin, metaEvent.organization_id, campaignExternalId),
            ]);
          const leadMeta = { externalLeadId: metaEvent.external_lead_id, pageId: metaEvent.page_id, formId: leadData.form_id || metaEvent.form_id, adId: leadData.ad_id || metaEvent.ad_id, adsetId: leadData.adset_id || metaEvent.adset_id, campaignId: leadData.campaign_id || metaEvent.campaign_external_id, campaignLinkage: campaignLink?.linkage ?? null, sourceName: sourceResult.data?.name || null, dataSharingConsent: sourceResult.data?.conversion_sharing_enabled === true, consentBasis: sourceResult.data?.consent_basis || null,
            // A base legal desta lead veio do FORMULÁRIO da Meta, onde a pessoa
            // aceitou os termos antes de virar lead — não de alguém afirmando
            // depois, em nome dela. `lib/crm/meta-consent.ts` recusa marcar
            // "formulario_meta" à mão justamente para não confundir as duas.
            //
            // Só vale quando a FONTE declara `conversion_sharing_enabled`: é lá
            // que fica registrado que aquele formulário tem a cláusula de
            // compartilhamento. Formulário sem a cláusula não ganha base por
            // estar no mesmo sistema que outro que tem.
            estado: sourceResult.data?.conversion_sharing_enabled === true ? "concedido" : "nao_perguntado",
            origem: sourceResult.data?.conversion_sharing_enabled === true ? "formulario_meta" : "declarado_pelo_corretor",
            registradoEm: new Date().toISOString(),
            // As respostas de qualificação, preservadas com a chave da pergunta.
            // Vazio quando o formulário só pede nome/e-mail/telefone — e vazio
            // aqui significa "o formulário não perguntou", não "a pessoa não
            // respondeu". São coisas diferentes e quem lê precisa distinguir.
            respostas,
            formularioPerguntouQualificacao: respostas.length > 0 };
          // ── DUAS IDENTIDADES PARA O MESMO EMPREENDIMENTO ────────────────
          //
          // Drift medido em 2026-07-28: os mesmos 4 empreendimentos vivem em
          // `crm_projects` E em `developments`, com ids diferentes. As FKs se
          // dividem por convenção — `leads.project_id` → crm_projects,
          // `leads.development_id` → developments — e a fonte guarda o id de
          // crm_projects (apesar de a coluna dela se chamar development_id).
          //
          // A versão anterior copiava ESSE MESMO id para as duas colunas da
          // lead. Na certa funcionava; na errada estourava a FK (23503) e a
          // LEAD INTEIRA se perdia. Dormente enquanto nenhuma fonte tinha
          // empreendimento; armado desde que os formulários com qualificação
          // foram vinculados.
          //
          // A ponte é `crm_projects.development_id` (migration 20260728010000).
          // Ponte ausente NÃO inventa vínculo: grava nulo e avisa no log —
          // fallback silencioso aqui viraria funil por empreendimento errado.
          const crmProjectId = sourceResult.data?.development_id ?? null;
          let developmentIdDaPonte: string | null = null;
          if (crmProjectId && !existingLead) {
            const { data: ponte, error: erroDaPonte } = await admin.from("crm_projects").select("development_id").eq("id", crmProjectId).maybeSingle();
            // Erro de leitura da ponte NÃO é "não há empreendimento": o aviso
            // abaixo já existia para a ausência, e agora distingue a falha.
            if (erroDaPonte) logger.warn("outbox.ponte_de_empreendimento_nao_lida", { crmProjectId, code: erroDaPonte.code });
            developmentIdDaPonte = (ponte?.development_id as string | null) ?? null;
            if (!developmentIdDaPonte) {
              logger.warn("meta.lead.ponte_de_empreendimento_ausente", {
                sourceId: metaEvent.source_id,
                crmProjectId,
                acao: "preencha crm_projects.development_id para este projeto — a lead entra sem vínculo em developments até lá",
              });
            }
          }

          const leadPayload = {
            organization_id: metaEvent.organization_id,
            name,
            email,
            phone,
            source: "Meta Lead Ads",
            status: "novo",
            temperature: "frio",
            // ── SCORE ZERO FIXO ERA CEGUEIRA NA ENTRADA ───────────────────
            //
            // A criação por API sempre pontuou; esta ingestão gravava 0 no
            // literal. Medido em 2026-07-28: 190 das 195 leads de anúncio com
            // score 0 — a fila do corretor ordena por score, então toda lead
            // de campanha nascia empatada com todas as outras.
            //
            // Nada é inventado: a régua é determinística e só soma o que a
            // lead TEM (e-mail, telefone, etapa...). Uma lead de formulário
            // com e-mail e telefone vale 25, não zero — e 25 com lastro
            // ordena melhor do que zero por omissão.
            score: calculateLeadScore({ email, phone, source: "Meta Lead Ads", status: "novo" }).score,
            assigned_to: ownership?.ownerId ?? null,
            // MESMO dono nas duas colunas. `assigned_to` é a canônica da fase V3;
            // `assigned_user_id` é a que a aplicação de fato consulta — fila do
            // corretor, vigia de SLA, distribuição. Gravar só a canônica produz
            // uma lead com dono no banco e ÓRFÃ na tela, e o vigia nem cobra o
            // SLA dela (ele filtra lead sem user_id de propósito).
            assigned_user_id: ownership?.ownerId ?? null,
            // O empreendimento vem do formulário — cada id na SUA tabela.
            development_id: developmentIdDaPonte,
            project_id: crmProjectId,
            // campaign_id é o elo que liga o lead ao dinheiro gasto; metadata.meta
            // continua idêntico (nada removido) e ganha só a linhagem da resolução.
            campaign_id: campaignLink?.campaignId ?? null,
            metadata: { meta: leadMeta, distribution: ownership ? { tier: ownership.tier, reason: ownership.reason } : undefined },
            created_at: leadData.created_time || now,
            next_action_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          };
          const insertLead = (payload: typeof leadPayload) => admin.from("leads").insert(payload).select("id").single();
          let leadInsert = existingLead ? { data: existingLead, error: null } : await insertLead(leadPayload);
          // REDE DE SEGURANÇA DO ELO — a promessa desta rota ("falha de registro
          // nunca derruba a ingestão") tem de valer também com o banco atrasado.
          // private.capture_lead_attribution é AFTER INSERT em public.leads e
          // repassa new.campaign_id para lead_attribution_touches.campaign_id,
          // cuja FK ainda aponta para public.campaigns onde 20260722175000 não
          // foi aplicada (medido na homologação em 2026-07-22: a FK antiga está
          // lá, public.campaigns tem 0 linhas e o gatilho está ATIVO). Nesse
          // banco, o primeiro lead com campanha resolvida derrubaria o próprio
          // INSERT do lead na mesma transação e, na 5ª tentativa, o evento iria
          // para dead_letter: lead pago PERDIDO. Perder o elo é ruim; perder o
          // lead é pior. O elo volta sozinho assim que o DDL entrar.
          //
          // A condição é o CÓDIGO do erro + existir campaign_id, não o texto da
          // mensagem: casar por texto é mais preciso, mas se a mensagem não
          // trouxer o nome da tabela a rede de segurança falha calada e o lead
          // se perde — exatamente o desastre que ela evita. Um 23503 de outra
          // origem (assigned_to, por exemplo) só custa uma segunda tentativa
          // que falha igual e segue para o catch. A mensagem vai no log.
          if (leadInsert.error?.code === FOREIGN_KEY_VIOLATION && leadPayload.campaign_id) {
            logger.warn("outbox.campaign_link_rejected_by_fk", { organizationId: metaEvent.organization_id, campaignId: leadPayload.campaign_id, code: leadInsert.error.code, detail: String(leadInsert.error.message || "").slice(0, 200) });
            leadInsert = await insertLead({
              ...leadPayload,
              campaign_id: null,
              metadata: { ...leadPayload.metadata, meta: { ...leadMeta, campaignLinkage: "registro_de_campanha_indisponivel" } },
            });
          }
          const { data: lead, error: leadError } = leadInsert;
          if (leadError || !lead) {
            await discardOrphanCampaign(admin, campaignLink, metaEvent.organization_id);
            throw leadError ?? new Error("Falha ao criar lead Meta.");
          }
          if (ownership?.ownerId) await recordDistribution(admin, { organizationId: metaEvent.organization_id, leadId: lead.id, ownerId: ownership.ownerId, reason: ownership.reason });
          await Promise.all([
            admin.from("meta_lead_events").update({ status: "imported", lead_id: lead.id, processed_at: now, last_error: null }).eq("id", metaEvent.id),
            admin.from("campaign_events").insert({ organization_id: metaEvent.organization_id, lead_id: lead.id, event_type: "lead_created", source: "meta", external_event_id: metaEvent.external_lead_id, payload: { pageId: metaEvent.page_id, formId: leadData.form_id || metaEvent.form_id, adId: leadData.ad_id || metaEvent.ad_id, adsetId: leadData.adset_id || metaEvent.adset_id, campaignId: leadData.campaign_id || metaEvent.campaign_external_id }, occurred_at: leadData.created_time || now }),
          ]);
          await queueMetaConversion({ organizationId: metaEvent.organization_id, leadId: lead.id, eventName: "Lead", eventId: `meta-lead-${metaEvent.external_lead_id}`, occurredAt: leadData.created_time || now, customData: { campaign_id: leadData.campaign_id || metaEvent.campaign_external_id, form_id: leadData.form_id || metaEvent.form_id } });
          // ── O SORTEIO ACONTECE NA ENTRADA, E É CEGO ─────────────────────
          //
          // §3 de docs/design/ATENDIMENTO_AUTONOMO_MODELO.md. Esta é a porta de
          // MAIOR volume: 57% da demanda orgânica chega entre 19h e 7h59, e o
          // tempo mediano até alguém tocar a lead era de 92,8 horas.
          //
          // A jornada nasce em SOMBRA — nada é enviado. Ela é a unidade do
          // experimento, e até 02/08/2026 só existia como efeito colateral de
          // uma mensagem que depende de template aprovado pelo dono; por isso
          // `ai_sales_journeys` estava em zero absoluto.
          //
          // Falha aqui NUNCA derruba a ingestão: a promessa desta rota é que
          // lead paga não se perde por causa de registro acessório. A função
          // não lança — devolve desfecho — e o que não deu vai para o log.
          const jornadaEmSombra = await abrirJornadaEmSombra({
            id: lead.id,
            organizacaoId: metaEvent.organization_id,
            corretorId: ownership?.ownerId ?? null,
            status: "novo",
            entradaEm: leadData.created_time || now,
            empreendimentoId: developmentIdDaPonte,
            nome: name,
            origem: "Meta Lead Ads",
          });
          if (jornadaEmSombra.desfecho === "falhou") {
            logger.warn("outbox.jornada_em_sombra_falhou", { leadId: lead.id, code: jornadaEmSombra.code, motivo: jornadaEmSombra.motivo });
          }
        }
      } else if (event.topic === "meta.conversion.send" && event.aggregate_id) {
        const [{ data: conversion, error: conversionError }, { data: config, error: configError }] = await Promise.all([
          admin.from("meta_conversion_events").select("id,organization_id,lead_id,event_name,event_id,action_source,custom_data,occurred_at,status,attempts").eq("id", event.aggregate_id).maybeSingle(),
          admin.from("meta_conversion_configs").select("dataset_id,mode,enabled,test_event_code,consent_required").eq("organization_id", event.organization_id).maybeSingle(),
        ]);
        /* `.maybeSingle()` desde 02/08/2026, nas três consultas acima e na de
           `meta_lead_events`. Com `.single()`, "zero linhas" vira ERRO do
           PostgREST, o `??` escolhe esse erro, e a frase em português que o
           autor escreveu para exatamente este caso fica INALCANÇÁVEL — o
           operador lê `PGRST116` e vai procurar defeito de serialização.
           Medido na fila de produção: foi assim que um item morreu.
           Este caminho é o das conversões da Meta (Grupo A): registro
           ausente aqui precisa dizer QUAL registro, não um código. */
        if (conversionError || !conversion) throw conversionError ?? new Error("Evento de conversão não encontrado.");
        if (configError || !config) throw configError ?? new Error("Configuração de conversão não encontrada.");
        if (!config.enabled || config.mode !== "test" || !config.test_event_code) throw new Error("Conversões Meta permanecem bloqueadas fora do modo de teste.");
        const accessToken = process.env.META_CONVERSIONS_ACCESS_TOKEN;
        if (!accessToken) throw new Error("META_CONVERSIONS_ACCESS_TOKEN não configurado.");
        const { data: lead, error: leadError } = await admin.from("leads").select("id,email,phone,metadata").eq("id", conversion.lead_id).eq("organization_id", conversion.organization_id).single();
        if (leadError || !lead) throw leadError ?? new Error("Lead da conversão não encontrado.");
        const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
        const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {};
        if (config.consent_required && meta.dataSharingConsent !== true) throw new Error("Compartilhamento bloqueado: consentimento não registrado.");
        const userData: { em?: string[]; ph?: string[]; external_id: string[]; fbc?: string; fbp?: string } = { external_id: [hashMetaValue(`atlas:${conversion.organization_id}:${lead.id}`)] };
        if (lead.email) userData.em = [hashMetaValue(lead.email)];
        if (lead.phone) {
          const phone = normalizeMetaPhone(lead.phone);
          if (phone) userData.ph = [hashMetaValue(phone)];
        }
        if (typeof meta.fbc === "string" && /^fb\.1\.\d{10,}\.\w+$/i.test(meta.fbc)) userData.fbc = meta.fbc.slice(0, 255);
        if (typeof meta.fbp === "string" && /^fb\.1\.\d{10,}\.\w+$/i.test(meta.fbp)) userData.fbp = meta.fbp.slice(0, 255);
        if (!userData.em && !userData.ph) throw new Error("Conversão sem e-mail ou telefone consentido para correspondência.");
        await gravar("meta_conversion_events.processando", admin.from("meta_conversion_events").update({ status: "processing", attempts: Number(conversion.attempts || 0) + 1, last_error: null }).eq("id", conversion.id));
        const apiVersion = metaGraphVersion();
        const response = await resilientFetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(config.dataset_id)}/events`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ data: [{ event_name: conversion.event_name, event_time: Math.floor(new Date(conversion.occurred_at).getTime() / 1000), event_id: conversion.event_id, action_source: conversion.action_source, user_data: userData, custom_data: { ...conversion.custom_data, atlas_signal_version: "andromeda-v1" } }], test_event_code: config.test_event_code }),
        }, { timeoutMs: 30_000, retries: 1, retryUnsafe: true, operation: "Meta Conversions API" });
        const metaResponse = await response.json() as Record<string, unknown>;
        // Mesma razão do WhatsApp: preserva code/subcode na mensagem para o
        // catch distinguir token expirado de erro de dado da conversão.
        if (!response.ok) throw new Error(describeMetaGraphFailure(response.status, metaResponse));
        // Mesma forma da linha de envio do WhatsApp: a conversão JÁ foi entregue
        // à Meta. Falhando este `update` em silêncio, o evento volta na próxima
        // rodada e a MESMA conversão é enviada de novo — e conversão duplicada
        // não é só ruído: ela infla a atribuição da campanha e envenena a
        // decisão de onde investir. O `event_id` protege contra duplicata do
        // lado da Meta, mas só enquanto a janela de dedupe dela estiver aberta.
        const marcouEntregue = await admin.from("meta_conversion_events").update({ status: "delivered", delivered_at: now, meta_response: metaResponse, last_error: null }).eq("id", conversion.id);
        if (marcouEntregue.error) {
          logger.error("outbox.conversao_entregue_sem_registro", { conversionId: conversion.id, eventId: conversion.event_id, code: marcouEntregue.error.code });
          throw marcouEntregue.error;
        }
      } else if (event.topic === "whatsapp.inbound.analyze" && event.aggregate_id) {
        const { data: message, error: erroDaMensagem } = await admin.from("messages").select("id,organization_id,conversation_id,content,direction").eq("id", event.aggregate_id).maybeSingle();
        // Sem isto, falha de leitura pulava a análise da conversa exatamente
        // como se a mensagem não existisse — e a IA "não tinha o que analisar".
        if (erroDaMensagem) logger.warn("outbox.mensagem_do_insight_nao_lida", { eventId: event.id, code: erroDaMensagem.code });
        if (message && message.direction === "inbound") {
          const payload = event.payload && typeof event.payload === "object" ? event.payload as { conversationId?: string; leadId?: string } : {};
          const leadId = payload.leadId || null;
          const { data: recent, error: erroDoHistorico } = await admin.from("messages").select("direction,content,created_at").eq("conversation_id", message.conversation_id).order("created_at", { ascending: true }).limit(20);
          // `recent ?? []` transforma falha de leitura em conversa vazia: a IA
          // analisaria a última mensagem SEM histórico, sem saber que está cega.
          if (erroDoHistorico) logger.warn("outbox.historico_da_conversa_nao_lido", { conversationId: message.conversation_id, code: erroDoHistorico.code });
          const conversationText = (recent ?? []).map((m) => `${m.direction === "inbound" ? "Cliente" : "Corretor"}: ${String(m.content || "").slice(0, 300)}`).join("\n");
          const insight = await analyzeInboundWhatsApp({ organizationId: message.organization_id, conversationText, latestText: String(message.content || "") });
          const { data: insightRow, error: erroDoInsight } = await admin.from("whatsapp_message_insights").upsert({
            organization_id: message.organization_id,
            conversation_id: message.conversation_id,
            message_id: message.id,
            lead_id: leadId,
            intent: insight.intent,
            objection_keys: insight.objectionKeys,
            summary: insight.summary,
            recommended_action_key: insight.recommendedAction,
            temperature_signal: insight.temperature,
            source: insight.source,
            model: insight.model,
          }, { onConflict: "message_id", ignoreDuplicates: true }).select("id").maybeSingle();
          // A análise custou uma chamada de IA. Se a gravação falhar, ela é
          // jogada fora — e `insightRow` nulo é o MESMO valor que a deduplicação
          // legítima produz (`ignoreDuplicates: true`). Sem este aviso não há
          // como separar "já existia" de "não gravou".
          if (erroDoInsight) logger.warn("outbox.insight_nao_gravado", { messageId: message.id, code: erroDoInsight.code });
          if (insightRow && leadId) {
            // `gravar` já conferia o retorno — este ponto era o ÚNICO das sete
            // escritas que gritava. Mas gritava 42703 a cada insight de IA
            // porque mandava `title`, coluna inexistente. `linhaDeAtividade`
            // monta com as colunas reais e põe a manchete em `metadata.title`.
            await gravar("activities.whatsapp_recebido", admin.from("activities").insert(linhaDeAtividade({ organizationId: message.organization_id, leadId, type: "whatsapp_insight", titulo: `IA leu a conversa: ${insight.intent} (${insight.temperature})`, description: `${insight.summary} · Próxima ação sugerida: ${insight.recommendedAction}${insight.objectionKeys.length ? ` · Objeções: ${insight.objectionKeys.join(", ")}` : ""}`, metadata: { source: insight.source, model: insight.model, intent: insight.intent, objections: insight.objectionKeys, recommendedAction: insight.recommendedAction }, occurredAt: now })));
          }
        }
      } else if (event.topic === "portal.lead.ingest" && event.aggregate_id) {
        const { data: portalEvent, error: portalError } = await admin.from("portal_lead_events").select("id,organization_id,source_id,provider,external_lead_id,listing_id,contact,status").eq("id", event.aggregate_id).single();
        if (portalError || !portalEvent) throw portalError ?? new Error("Evento de portal não encontrado.");
        if (portalEvent.status !== "imported") {
          await gravar("portal_lead_events.processando", admin.from("portal_lead_events").update({ status: "processing", last_error: null }).eq("id", portalEvent.id));
          const { data: sourceRow, error: erroDaFonteDoPortal } = await admin.from("portal_lead_sources").select("default_owner_id,name").eq("id", portalEvent.source_id).single();
          // `.single()` erra com PGRST116 quando não há linha — mas o erro era
          // descartado, então "fonte apagada" e "banco fora do ar" produziam o
          // mesmo `sourceRow` nulo. Logo abaixo ele decide o dono padrão da lead:
          // sem ele a lead cai na fila geral, e ninguém saberia se foi porque a
          // fonte não tem dono ou porque a leitura falhou.
          if (erroDaFonteDoPortal) logger.warn("outbox.fonte_do_portal_nao_lida", { sourceId: portalEvent.source_id, code: erroDaFonteDoPortal.code });
          const contact = portalEvent.contact && typeof portalEvent.contact === "object" ? portalEvent.contact as { name?: string; email?: string; phone?: string; message?: string } : {};
          const providerLabel = integrationCatalog.find((item) => item.provider === portalEvent.provider)?.name || portalEvent.provider;
          // Gêmeo da dedupe do caminho Meta: erro virava "não existe" e a lead
          // do portal nascia DUPLICADA. E aqui o dano é maior, porque logo
          // abaixo `existingLead` decide se há atribuição de dono — sem ele, a
          // duplicata ainda cai na fila de um corretor.
          const existingLeadQuery = await admin.from("leads").select("id").eq("organization_id", portalEvent.organization_id).contains("metadata", { portal: { provider: portalEvent.provider, externalLeadId: portalEvent.external_lead_id } }).maybeSingle();
          if (existingLeadQuery.error) throw existingLeadQuery.error;
          const existingLead = existingLeadQuery.data;
          // Mesma cascata RBAC do caminho Meta — portais tinham o mesmo gap.
          const ownership = existingLead
            ? null
            : await resolveLeadOwner(admin, portalEvent.organization_id, sourceRow?.default_owner_id || null);
          // ── ATRIBUIÇÃO DO GOOGLE ────────────────────────────────────────
          // Três dos quatro empreendimentos atendidos anunciam no Google, e o
          // CRM tinha 2 leads de google_ads contra 201 da Meta — não porque o
          // Google traga menos, mas porque ninguém lia o que ele manda. O gclid
          // e as UTMs viajam no payload do portal e estavam sendo descartados.
          //
          // Sem identificador de clique isto devolve null e nada muda: UTM
          // sozinha pode ser link de e-mail, e atribuir por palpite move verba.
          const atribuicaoGoogle = lerAtribuicaoDoGoogle({ ...contact, ...(portalEvent.contact as Record<string, unknown> ?? {}) });
          let campanhaDoGoogle: string | null = null;
          if (atribuicaoGoogle) {
            const chave = chaveDaCampanhaDoGoogle(atribuicaoGoogle);
            if (chave) {
              // Mesma disciplina do registro de campanha da Meta: a chave é o id
              // estável, não o nome — renomear no Google não pode partir o
              // histórico em duas campanhas.
              const existente = await admin.from("marketing_campaigns").select("id")
                .eq("organization_id", portalEvent.organization_id).eq("platform", "GOOGLE")
                .eq("external_campaign_id", chave).maybeSingle();
              if (existente.data?.id) campanhaDoGoogle = existente.data.id;
              else {
                const criada = await admin.from("marketing_campaigns").insert({
                  organization_id: portalEvent.organization_id,
                  name: nomeDaCampanhaDoGoogle(atribuicaoGoogle),
                  platform: "GOOGLE",
                  external_campaign_id: chave,
                  status: "PAUSED",
                }).select("id").maybeSingle();
                campanhaDoGoogle = criada.data?.id ?? null;
              }
            }
            logger.info("outbox.google_attribution_reconhecida", {
              organizationId: portalEvent.organization_id,
              clickIdTipo: atribuicaoGoogle.clickIdTipo,
              campanha: chave,
              campanhaRegistrada: Boolean(campanhaDoGoogle),
            });
          }

          const leadInsert = existingLead ? { data: existingLead, error: null } : await admin.from("leads").insert({
            organization_id: portalEvent.organization_id,
            name: contact.name || `Lead ${providerLabel}`,
            email: contact.email || null,
            phone: contact.phone || null,
            // Clique pago do Google identificado vence o rótulo do portal: a
            // lead chegou POR ele, e é assim que o custo dela fica rastreável.
            source: atribuicaoGoogle ? "google_ads" : providerLabel,
            campaign_id: campanhaDoGoogle,
            status: "novo",
            temperature: "frio",
            // Mesma régua da ingestão da Meta e da criação por API: três portas
            // para a mesma lead não podem pontuar de formas diferentes.
            score: calculateLeadScore({
              email: contact.email || undefined,
              phone: contact.phone || undefined,
              source: atribuicaoGoogle ? "google_ads" : providerLabel,
              status: "novo",
            }).score,
            assigned_to: ownership?.ownerId ?? null,
            // O mesmo cuidado da ingestão da Meta, 190 linhas acima, que já
            // explica por quê: gravar só a canônica produz lead com dono no
            // banco e ÓRFÃ na tela, e o vigia de SLA nem cobra o prazo dela.
            // O caminho do PORTAL nasceu sem esse cuidado e ficou assim.
            assigned_user_id: ownership?.ownerId ?? null,
            metadata: { portal: { provider: portalEvent.provider, externalLeadId: portalEvent.external_lead_id, listingId: portalEvent.listing_id, sourceName: sourceRow?.name || null, message: contact.message || null }, ...(atribuicaoGoogle ? { google: atribuicaoGoogle } : {}), distribution: ownership ? { tier: ownership.tier, reason: ownership.reason } : undefined },
            created_at: now,
            next_action_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          }).select("id").single();
          const { data: lead, error: leadError } = leadInsert;
          if (leadError || !lead) throw leadError ?? new Error("Falha ao criar lead de portal.");
          if (ownership?.ownerId) await recordDistribution(admin, { organizationId: portalEvent.organization_id, leadId: lead.id, ownerId: ownership.ownerId, reason: ownership.reason });
          await Promise.all([
            admin.from("portal_lead_events").update({ status: "imported", lead_id: lead.id, processed_at: now, last_error: null }).eq("id", portalEvent.id),
            admin.from("campaign_events").insert({ organization_id: portalEvent.organization_id, lead_id: lead.id, event_type: "lead_created", source: "portal", external_event_id: portalEvent.external_lead_id, payload: { provider: portalEvent.provider, listingId: portalEvent.listing_id }, occurred_at: now }),
          ]);
        }
      } else {
        throw new Error(`Tópico não suportado: ${event.topic}`);
      }

      await closeOutboxEvent(admin, event.id, { status: "delivered", delivered_at: now, locked_at: null, locked_by: null, last_error: null, cause: null });
      delivered += 1;
      consecutiveCredentialFailures = 0;
    } catch (processingError) {
      /* ── O QUE NÃO É `Error` TAMBÉM TEM O QUE DIZER ────────────────────
         Antes: qualquer coisa lançada que não fosse `Error` virava a string
         "Falha desconhecida", e o diagnóstico morria ali.

         MEDIDO em 01/08/2026 na fila de produção: das 8 entregas mortas, SETE
         tinham `last_error = "Falha desconhecida"`. Só uma guardou a mensagem
         real — `Meta Graph HTTP 400 [code 100/33] Object with ID … does not
         exist`. As outras sete não deixaram rastro nenhum de por que
         morreram, no exato momento em que o rastro era a única coisa que
         importava.

         Agora o que não é `Error` é SERIALIZADO. String vira ela mesma; objeto
         vira JSON; o resto vira `String(...)`. Só cai no texto genérico o que
         de fato não tem representação — e, ainda assim, com o tipo junto. */
      const message = descreverFalha(processingError);
      const cause = classifyOutboxFailure({ message });

      // Erro de CREDENCIAL (token 190/463/467): não é culpa do evento. NÃO
      // consome tentativa (reverte o incremento do claim), mantém o evento
      // retryable com backoff longo e marca causa='token_unhealthy'. Assim,
      // renovar o token faz a fila voltar a fluir sozinha — nada vai a
      // dead_letter só porque o token expirou. Erro de dado continua abaixo.
      if (cause === "token_unhealthy") {
        const retryAt = new Date(Date.now() + 30 * 60_000).toISOString();
        await closeOutboxEvent(admin, event.id, { status: "failed", attempts: originalAttempts, available_at: retryAt, locked_at: null, locked_by: null, last_error: message, cause: "token_unhealthy" });
        // Agregados aterrissam em estado retryable (nunca dead_letter/consumo):
        // ao reprocessar com token são, os guards (status !== 'imported') deixam
        // o fluxo seguir de novo.
        if (event.topic === "meta.lead.fetch" && event.aggregate_id) await admin.from("meta_lead_events").update({ status: "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
        if (event.topic === "meta.conversion.send" && event.aggregate_id) await admin.from("meta_conversion_events").update({ status: "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
        if (event.topic === "portal.lead.ingest" && event.aggregate_id) await admin.from("portal_lead_events").update({ status: "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
        // Sinal estruturado para readiness/observabilidade: token precisa renovar.
        logger.warn("outbox.token_unhealthy", { eventId: event.id, topic: event.topic, organizationId: event.organization_id });
        failed += 1;
        consecutiveCredentialFailures += 1;
        if (consecutiveCredentialFailures >= CREDENTIAL_FAILURE_BREAK) {
          stoppedEarly = "token_unhealthy";
          logger.warn("outbox.batch_stopped_by_credential", { workerId, consecutiveCredentialFailures, remaining: (events ?? []).length - processed });
          break;
        }
        continue;
      }

      // RATE LIMIT da Meta (codes 4/17/32/613/80004): mesma natureza da
      // credencial — não é culpa do evento. Antes caía em causa='data' e
      // queimava tentativa até dead_letter: mensagem VÁLIDA morria só porque a
      // Meta pediu para desacelerar. Backoff curto (5 min, o limite renova por
      // janela) sem consumir tentativa, e o lote para: continuar martelando a
      // mesma janela só agrava o limite.
      if (cause === "rate_limited") {
        const retryAt = new Date(Date.now() + 5 * 60_000).toISOString();
        await closeOutboxEvent(admin, event.id, { status: "failed", attempts: originalAttempts, available_at: retryAt, locked_at: null, locked_by: null, last_error: message, cause: "rate_limited" });
        logger.warn("outbox.rate_limited", { eventId: event.id, topic: event.topic, organizationId: event.organization_id });
        failed += 1;
        stoppedEarly = "rate_limited";
        break;
      }
      consecutiveCredentialFailures = 0;

      const terminal = attempts >= 5;
      const nextAttempt = new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString();

      /* `cause` era gravada como `null` AQUI — depois de ser calculada oito
         linhas acima por `classifyOutboxFailure`. A classificação existia,
         custava uma chamada, e era descartada na hora de persistir. Medido: as
         8 entregas mortas da fila têm `cause` nula, inclusive a que carrega o
         código 100/33 da Graph, que a função classifica sem esforço.
         Sem causa, `/api/ready` sabe QUANTAS falharam e não sabe POR QUÊ. */
      await closeOutboxEvent(admin, event.id, { status: terminal ? "dead_letter" : "failed", available_at: nextAttempt, locked_at: null, locked_by: null, last_error: message, cause });
      if (event.topic === "meta.lead.fetch" && event.aggregate_id) await admin.from("meta_lead_events").update({ status: "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
      if (event.topic === "meta.conversion.send" && event.aggregate_id) await admin.from("meta_conversion_events").update({ status: terminal ? "dead_letter" : "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
      if (event.topic === "portal.lead.ingest" && event.aggregate_id) await admin.from("portal_lead_events").update({ status: terminal ? "dead_letter" : "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
      const reactivationBatchId = event.payload && typeof event.payload === "object" ? String((event.payload as { reactivationBatchId?: unknown }).reactivationBatchId || "") : "";
      if (terminal && reactivationBatchId && event.aggregate_id) {
        await gravar("lead_reactivation_contacts.falhou", admin.from("lead_reactivation_contacts").update({ status: "failed", block_reason: message.slice(0, 500) }).eq("batch_id", reactivationBatchId).eq("message_id", event.aggregate_id));
      }
      if (terminal) {
        // Mesma razao da carta morta do ramo acima: sem camada abaixo, o
        // silencio aqui apaga o registro da falha terminal.
        const cartaMortaTerminal = await admin.from("dead_letter_events").insert({
          organization_id: event.organization_id,
          outbox_event_id: event.id,
          topic: event.topic,
          payload: event.payload,
          error_message: message,
          attempts,
        });
        if (cartaMortaTerminal.error) logger.error("outbox.carta_morta_nao_gravada", { eventId: event.id, topic: event.topic, motivoOriginal: message, code: cartaMortaTerminal.error.code });
      }
      failed += 1;
      logger.error("outbox.delivery_failed", processingError, { eventId: event.id, topic: event.topic, attempts });
    }
  }

  // `processed` passa a contar o que foi REALMENTE reivindicado: com a parada
  // por credencial, dizer que o lote inteiro foi processado seria mentira.
  const claimed = (events ?? []).length;
  const corpo = {
    workerId,
    claimed,
    processed,
    delivered,
    failed,
    stoppedEarly,
    remaining: stoppedEarly ? claimed - processed : 0,
    leases,
    // Transições de estado que não confirmaram. Zero é o valor esperado; um
    // número consistentemente diferente de zero é o sinal de que o banco está
    // recusando escrita que o worker acha que fez. Antes de 02/08/2026 este
    // número não existia — as 16 escritas simplesmente não eram conferidas.
    gravacoesNaoConfirmadas: escritasQueFalharam.length,
    ondeNaoConfirmou: escritasQueFalharam.slice(0, 10),
    // `motivo` existe para que "não entreguei nada" nunca seja ambíguo. Cada
    // valor pede uma ação diferente de quem lê, e é essa a razão de existirem
    // cinco em vez de um booleano.
    motivo:
      stoppedEarly === "token_unhealthy" ? "credencial_quebrada"
      : stoppedEarly === "rate_limited" ? "limite_da_plataforma"
      : claimed === 0 ? "fila_vazia"
      : delivered === 0 ? "nenhuma_entrega_no_lote"
      : failed ? "entregue_com_falhas_parciais"
      : "ok",
  };

  // Credencial quebrada é a ÚNICA saída deste bloco que precisa de gente: a fila
  // não anda mais sozinha. 500 é o que faz o agendador acender.
  if (stoppedEarly === "token_unhealthy") {
    logger.error("outbox.credencial_quebrada", { workerId, claimed, processed, remaining: corpo.remaining });
    return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo) }, { status: 500 });
  }

  // Fila vazia NÃO é falha: o vigia acordou, olhou e não havia o que enviar — e
  // é exatamente esse o desfecho que hoje se confunde com "nunca rodou".
  return NextResponse.json({ ...corpo, livro: await livro(claimed === 0 ? "sem_trabalho" : "ok", corpo) });
}
