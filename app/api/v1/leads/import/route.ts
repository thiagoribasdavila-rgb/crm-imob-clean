import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { consentimentoDaFonte } from "@/lib/crm/meta-consent";
import { calculateLeadScore } from "@/lib/atlas/scoring";
import {
  parseDelimited,
  processRows,
  type ImportMapping,
  type LeadImportField,
} from "@/lib/import/lead-import-pipeline";

export const dynamic = "force-dynamic";

/**
 * SALTO V4.2 — Importação governada da base histórica.
 *
 * O cliente envia o TEXTO cru + mapeamento; o servidor re-executa o MESMO
 * pipeline puro (nunca confia no relatório do browser), dedupa contra a base
 * viva e devolve o relatório de qualidade. Só o modo "commit" escreve — e
 * grava lote em import_batches + leads com import_batch_id/source_row, sem
 * distribuição automática (base histórica entra como legado explícito).
 */

const MAX_TEXT_BYTES = 6_000_000; // ~17k linhas confortáveis
const INSERT_CHUNK = 500;
const DEDUPE_CHUNK = 200;

type ImportBody = {
  mode?: "dry_run" | "commit";
  text?: string;
  mapping?: Record<string, LeadImportField>;
  sourceName?: string;
  sourceFile?: string;
  /**
   * Formulário da Meta de onde este arquivo foi exportado, quando for o caso.
   *
   * Opcional de propósito: é ele que traz a base legal do consentimento (a
   * cláusula de compartilhamento fica registrada em `meta_lead_sources`). Sem
   * ele, a lead nasce `nao_perguntado` — planilha de origem desconhecida não
   * ganha base legal por estar no mesmo sistema que um formulário que tem.
   */
  formId?: string;
};

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 10, scope: "lead-import" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = identity.access.profile.commercialRole || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);
  if (!["director", "superintendent", "manager"].includes(role)) {
    return apiError("FORBIDDEN", "Importação de base pertence à liderança.", identity.meta, { status: 403 });
  }
  const org = identity.access.organization.id;

  const body = (await request.json().catch(() => null)) as ImportBody | null;
  const mode = body?.mode === "commit" ? "commit" : "dry_run";
  const text = String(body?.text ?? "");
  if (!text.trim()) return apiError("EMPTY_FILE", "Envie o conteúdo do arquivo (CSV/TXT).", identity.meta, { status: 400 });
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
    return apiError("FILE_TOO_LARGE", "Arquivo acima de 6 MB — divida a base em partes.", identity.meta, { status: 413 });
  }

  // Re-processa no servidor com o pipeline puro (fonte única de verdade).
  const sheet = parseDelimited(text);
  if (!sheet.headers.length || !sheet.rows.length) {
    return apiError("NO_ROWS", "Nenhuma linha de dados encontrada após o cabeçalho.", identity.meta, { status: 422 });
  }
  const mapping: ImportMapping = {};
  for (const [key, field] of Object.entries(body?.mapping ?? {})) mapping[Number(key)] = field;
  if (!Object.values(mapping).includes("name")) {
    return apiError("MAPPING_NAME_REQUIRED", "Mapeie a coluna de NOME antes de continuar.", identity.meta, { status: 422 });
  }
  const { leads, report } = processRows(sheet, mapping);
  if (!leads.length) {
    return apiSuccess({ mode, report, dedupe: { existingMatches: 0 }, imported: 0 }, identity.meta, { headers: limited.headers });
  }

  const admin = getSupabaseAdmin();

  // Dedupe contra a base viva: telefone normalizado (coluna phone_normalized,
  // pós-cadeia) + e-mail caso-exato. Limitação declarada no relatório.
  const phones = [...new Set(leads.map((l) => l.phone).filter(Boolean))] as string[];
  const emails = [...new Set(leads.map((l) => l.email).filter(Boolean))] as string[];
  const existingPhones = new Set<string>();
  const existingEmails = new Set<string>();
  let phoneNormalizedAvailable = true;
  {
    const probe = await admin.from("leads").select("phone_normalized").limit(1);
    if (probe.error) phoneNormalizedAvailable = false;
  }
  for (let i = 0; i < phones.length; i += DEDUPE_CHUNK) {
    const chunk = phones.slice(i, i + DEDUPE_CHUNK);
    if (phoneNormalizedAvailable) {
      const { data } = await admin.from("leads").select("phone_normalized").eq("organization_id", org).in("phone_normalized", chunk);
      for (const row of data ?? []) if (row.phone_normalized) existingPhones.add(row.phone_normalized);
    } else {
      const { data } = await admin.from("leads").select("phone").eq("organization_id", org).in("phone", chunk);
      for (const row of data ?? []) if (row.phone) existingPhones.add(row.phone);
    }
  }
  for (let i = 0; i < emails.length; i += DEDUPE_CHUNK) {
    const chunk = emails.slice(i, i + DEDUPE_CHUNK);
    const { data } = await admin.from("leads").select("email").eq("organization_id", org).in("email", chunk);
    for (const row of data ?? []) if (row.email) existingEmails.add(String(row.email).toLowerCase());
  }
  const fresh = leads.filter((lead) =>
    !(lead.phone && existingPhones.has(lead.phone)) && !(lead.email && existingEmails.has(lead.email)),
  );
  const existingMatches = leads.length - fresh.length;
  const dedupe = {
    existingMatches,
    byPhoneNormalized: phoneNormalizedAvailable,
    note: phoneNormalizedAvailable
      ? "Dedupe por telefone normalizado + e-mail caso-exato."
      : "Coluna phone_normalized ausente (pré-ativação) — dedupe por telefone caso-exato + e-mail caso-exato; aplicar a cadeia melhora a precisão.",
  };

  if (mode === "dry_run") {
    return apiSuccess({ mode, report, dedupe, importable: fresh.length, imported: 0 }, identity.meta, { headers: limited.headers });
  }

  // COMMIT — lote auditável + inserts em blocos. Sem distribuição automática.
  const { data: batch, error: batchError } = await admin
    .from("import_batches")
    .insert({
      organization_id: org,
      source_name: String(body?.sourceName || "Base histórica").slice(0, 120),
      source_file: String(body?.sourceFile || "").slice(0, 200) || null,
      total_rows: report.totalRows,
      imported_rows: 0,
      duplicate_rows: report.duplicateRowsInFile + existingMatches,
      invalid_rows: report.errorRows,
      created_by: identity.access.profile.id,
    })
    .select("id")
    .single();
  if (batchError || !batch) return apiError("BATCH_FAILED", `Não foi possível abrir o lote: ${batchError?.message ?? "sem id"}.`, identity.meta, { status: 500 });

  // ── CONSENTIMENTO NA IMPORTAÇÃO ───────────────────────────────────────────
  //
  // A lead que entra pelo webhook nasce com consentimento quando a fonte declara
  // a cláusula de compartilhamento. A que entra por arquivo nascia SEM metadata
  // nenhum — sem consentimento, sem formulário, sem origem. Foi assim que 173
  // das 199 leads chegaram, e elas só têm a base legal porque alguém registrou
  // em lote depois, uma a uma.
  //
  // `formId` é opcional de propósito: quem importa o export de um formulário da
  // Meta informa qual é, e a base legal daquele formulário se aplica. Planilha
  // de origem desconhecida não informa nada — e aí a lead nasce
  // `nao_perguntado`, que é a resposta honesta. A regra é a MESMA do webhook,
  // na mesma função, para os dois caminhos não divergirem de novo.
  const formId = typeof body?.formId === "string" ? body.formId.trim() : "";
  const { data: fonte } = formId
    ? await admin.from("meta_lead_sources")
        .select("conversion_sharing_enabled,consent_basis,name")
        .eq("organization_id", org).eq("form_id", formId).maybeSingle()
    : { data: null };
  const consentimento = consentimentoDaFonte(fonte);
  const metadataDaImportacao = {
    meta: {
      ...(formId ? { form_id: formId, sourceName: fonte?.name ?? null } : {}),
      estado: consentimento.estado,
      origem: consentimento.origem,
      dataSharingConsent: consentimento.dataSharingConsent,
      consentBasis: consentimento.consentBasis,
      registradoPor: identity.access.profile.id,
      registradoEm: new Date().toISOString(),
      importBatchId: batch.id,
    },
  };

  let imported = 0;
  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    const chunk = fresh.slice(i, i + INSERT_CHUNK).map((lead) => {
    // ── A IMPORTAÇÃO TAMBÉM PONTUA ────────────────────────────────────────
    //
    // A criação por API (app/api/v1/leads/route.ts) sempre chamou
    // `calculateLeadScore`; a importação nunca chamou. Medido em 2026-07-28:
    // 193 das 200 leads com score 0 — todas importadas. A fila do corretor
    // ordena por score, então a base inteira entrou empatada em zero.
    //
    // Nada é inventado: a régua é determinística e só soma o que a lead TEM
    // (e-mail, telefone, orçamento, região, tipologia, objetivo, interação,
    // próxima ação, etapa). Planilha sem esses campos pontua baixo — e baixo
    // com lastro é informação, zero por omissão não é.
    //
    // Mesma função da criação, de propósito: duas réguas para o mesmo número
    // é a divergência que já custou caro neste repositório.
    const pontuacao = calculateLeadScore({
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
      source: lead.source ?? undefined,
      status: lead.status ?? "novo",
    });
    return {
      metadata: metadataDaImportacao,
      score: pontuacao.score,
      score_ia: pontuacao.score,
      organization_id: org,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      project: lead.project,
      source: lead.source || "Base histórica",
      campaign: lead.campaign,
      status: lead.status,
      created_at: lead.created_at ?? undefined,
      legacy_broker: lead.legacy_broker,
      notes: lead.notes,
      import_batch_id: batch.id,
      source_row: lead.sourceRow,
      ...(phoneNormalizedAvailable && lead.phone ? { phone_normalized: lead.phone } : {}),
    };
    });
    const { error: insertError } = await admin.from("leads").insert(chunk);
    if (insertError) {
      await admin.from("import_batches").update({ imported_rows: imported }).eq("id", batch.id);
      return apiError("IMPORT_PARTIAL", `Importadas ${imported} de ${fresh.length} antes da falha: ${insertError.message}. Lote ${batch.id} registra o parcial.`, identity.meta, { status: 502 });
    }
    imported += chunk.length;
  }
  await admin.from("import_batches").update({ imported_rows: imported }).eq("id", batch.id);
  return apiSuccess({ mode, report, dedupe, importable: fresh.length, imported, batchId: batch.id }, identity.meta, { headers: limited.headers });
}
