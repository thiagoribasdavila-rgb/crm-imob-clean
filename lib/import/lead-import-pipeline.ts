/**
 * SALTO V4.2 — Pipeline de importação da base histórica de leads.
 *
 * Puro e testável: parse robusto de CSV/TXT (aspas, ; , ou TAB, BOM, CRLF),
 * sugestão de mapeamento para cabeçalhos PT-BR do mercado imobiliário,
 * validação por linha (erro ≠ aviso), dedupe intra-arquivo por telefone/e-mail
 * normalizados e RELATÓRIO DE QUALIDADE antes de qualquer carga.
 *
 * Governança: nada aqui toca banco — o servidor re-valida e faz o dedupe contra
 * a base viva antes do commit (rota própria). XLSX: exporte como CSV na v1
 * (dependência nova exigiria tocar package.json, em uso por outra frente).
 */

export type LeadImportField =
  | "name" | "phone" | "email" | "project" | "source" | "campaign"
  | "status" | "created_at" | "legacy_broker" | "notes" | "ignore";

export type ImportMapping = Record<number, LeadImportField>;

export type ParsedSheet = { headers: string[]; rows: string[][]; delimiter: string };

export type RowIssue = { row: number; level: "error" | "warning"; field: LeadImportField | "row"; message: string };

export type NormalizedLead = {
  sourceRow: number;
  name: string;
  phone: string | null;
  email: string | null;
  project: string | null;
  source: string | null;
  campaign: string | null;
  status: string;
  created_at: string | null;
  legacy_broker: string | null;
  notes: string | null;
  dedupeKeys: string[];
};

export type QualityReport = {
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRowsInFile: number;
  fieldFill: Partial<Record<LeadImportField, number>>;
  issues: RowIssue[];
  issuesTruncated: boolean;
};

const MAX_ISSUES = 200;

// ---------------------------------------------------------------------------
// Parse — detecta delimitador pela 1ª linha (fora de aspas), respeita "..."
// ---------------------------------------------------------------------------

function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ";";
}

export function parseDelimited(text: string): ParsedSheet {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.slice(0, clean.indexOf("\n") === -1 ? clean.length : clean.indexOf("\n"));
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let field = "", record: string[] = [], inQuotes = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { record.push(field); field = ""; }
    else if (ch === "\n") { record.push(field); field = ""; if (record.some((c) => c.trim() !== "")) rows.push(record); record = []; }
    else field += ch;
  }
  record.push(field);
  if (record.some((c) => c.trim() !== "")) rows.push(record);
  const [headers = [], ...data] = rows;
  return { headers: headers.map((h) => h.trim()), rows: data, delimiter };
}

// ---------------------------------------------------------------------------
// Mapeamento sugerido — cabeçalhos PT-BR comuns do mercado
// ---------------------------------------------------------------------------

const HEADER_HINTS: Array<{ field: LeadImportField; patterns: RegExp }> = [
  { field: "name", patterns: /^(nome|cliente|lead|contato|nome completo|nome do lead)$/i },
  { field: "phone", patterns: /(telefone|celular|whats|fone|phone|tel\b)/i },
  { field: "email", patterns: /(e-?mail)/i },
  { field: "project", patterns: /(empreendimento|projeto|produto|im[óo]vel)/i },
  { field: "source", patterns: /(origem|fonte|canal|source|m[íi]dia)/i },
  { field: "campaign", patterns: /(campanha|campaign|an[úu]ncio|conjunto)/i },
  { field: "status", patterns: /(status|etapa|est[áa]gio|fase|situa[çc][ãa]o)/i },
  { field: "created_at", patterns: /(data|cadastro|criado|entrada|dt\b)/i },
  { field: "legacy_broker", patterns: /(corretor|respons[áa]vel|atendente|vendedor|broker)/i },
  { field: "notes", patterns: /(observa|nota|coment|obs\b|descri)/i },
];

export function suggestMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  const taken = new Set<LeadImportField>();
  headers.forEach((header, index) => {
    const hit = HEADER_HINTS.find((h) => h.patterns.test(header.trim()) && !taken.has(h.field));
    if (hit) { mapping[index] = hit.field; taken.add(hit.field); }
    else mapping[index] = "ignore";
  });
  return mapping;
}

// ---------------------------------------------------------------------------
// Normalização + validação
// ---------------------------------------------------------------------------

export function normalizePhoneBR(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email && email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

const STATUS_CANONICAL: Array<{ canonical: string; patterns: RegExp }> = [
  { canonical: "novo", patterns: /(novo|new|entrada)/i },
  { canonical: "contato", patterns: /(contato|contact|tentativa|liga[çc])/i },
  { canonical: "qualificacao", patterns: /(qualific)/i },
  { canonical: "visita", patterns: /(visita|agendad)/i },
  { canonical: "proposta", patterns: /(proposta|negocia)/i },
  { canonical: "ganho", patterns: /(ganho|vendid|fechad|won|convertid)/i },
  { canonical: "perdido", patterns: /(perdid|lost|descartad|desistiu)/i },
];

export function canonicalImportStatus(value: string | null): string {
  const raw = (value || "").trim();
  if (!raw) return "novo";
  const hit = STATUS_CANONICAL.find((s) => s.patterns.test(raw));
  return hit ? hit.canonical : "novo";
}

export function parseFlexibleDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (br) {
    const [, d, m, y, hh, mm] = br;
    const year = Number(y.length === 2 ? `20${y}` : y);
    const iso = Date.UTC(year, Number(m) - 1, Number(d), Number(hh ?? 12), Number(mm ?? 0));
    return Number.isFinite(iso) && Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31
      ? new Date(iso).toISOString() : null;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function processRows(sheet: ParsedSheet, mapping: ImportMapping): { leads: NormalizedLead[]; report: QualityReport } {
  const issues: RowIssue[] = [];
  const leads: NormalizedLead[] = [];
  const seen = new Map<string, number>();
  const fill: Partial<Record<LeadImportField, number>> = {};
  let errorRows = 0, duplicates = 0;

  const pick = (row: string[], field: LeadImportField): string => {
    const index = Object.entries(mapping).find(([, f]) => f === field)?.[0];
    return index === undefined ? "" : String(row[Number(index)] ?? "").trim();
  };
  const push = (issue: RowIssue) => { if (issues.length < MAX_ISSUES) issues.push(issue); };

  sheet.rows.forEach((row, i) => {
    const sourceRow = i + 2; // 1-based + cabeçalho
    const name = pick(row, "name");
    if (!name) { errorRows += 1; push({ row: sourceRow, level: "error", field: "name", message: "Nome vazio — linha não importável." }); return; }

    const rawPhone = pick(row, "phone");
    const phone = rawPhone ? normalizePhoneBR(rawPhone) : null;
    if (rawPhone && !phone) push({ row: sourceRow, level: "warning", field: "phone", message: `Telefone não normalizável: "${rawPhone.slice(0, 24)}".` });

    const rawEmail = pick(row, "email");
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    if (rawEmail && !email) push({ row: sourceRow, level: "warning", field: "email", message: `E-mail inválido: "${rawEmail.slice(0, 40)}".` });

    if (!phone && !email) push({ row: sourceRow, level: "warning", field: "row", message: "Sem telefone nem e-mail válidos — lead entra sem contato acionável." });

    const rawDate = pick(row, "created_at");
    const created = rawDate ? parseFlexibleDate(rawDate) : null;
    if (rawDate && !created) push({ row: sourceRow, level: "warning", field: "created_at", message: `Data não reconhecida: "${rawDate.slice(0, 24)}".` });

    const dedupeKeys = [phone ? `p:${phone}` : null, email ? `e:${email}` : null].filter(Boolean) as string[];
    const dupOf = dedupeKeys.map((k) => seen.get(k)).find((v) => v !== undefined);
    if (dupOf !== undefined) {
      duplicates += 1;
      push({ row: sourceRow, level: "warning", field: "row", message: `Duplicado no arquivo (mesmo contato da linha ${dupOf}).` });
      return;
    }
    dedupeKeys.forEach((k) => seen.set(k, sourceRow));

    const lead: NormalizedLead = {
      sourceRow,
      name: name.slice(0, 160),
      phone,
      email,
      project: pick(row, "project") || null,
      source: pick(row, "source") || null,
      campaign: pick(row, "campaign") || null,
      status: canonicalImportStatus(pick(row, "status")),
      created_at: created,
      legacy_broker: pick(row, "legacy_broker") || null,
      notes: pick(row, "notes")?.slice(0, 2000) || null,
      dedupeKeys,
    };
    (Object.keys(lead) as Array<keyof NormalizedLead>).forEach((key) => {
      if (key === "sourceRow" || key === "dedupeKeys") return;
      if (lead[key]) fill[key as LeadImportField] = (fill[key as LeadImportField] ?? 0) + 1;
    });
    leads.push(lead);
  });

  return {
    leads,
    report: {
      totalRows: sheet.rows.length,
      validRows: leads.length,
      errorRows,
      duplicateRowsInFile: duplicates,
      fieldFill: fill,
      issues,
      issuesTruncated: issues.length >= MAX_ISSUES,
    },
  };
}
