import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const [filePath, mode = "apply"] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const organizationId = process.env.ATLAS_IMPORT_ORGANIZATION_ID;
const actorId = process.env.ATLAS_IMPORT_ACTOR_ID;

if (!filePath || !url || !key || !organizationId || !actorId) {
  throw new Error("Informe o JSONL e configure ATLAS_IMPORT_ORGANIZATION_ID e ATLAS_IMPORT_ACTOR_ID.");
}
if (!new Set(["apply", "dry-run"]).has(mode)) throw new Error("Use apply ou dry-run.");

const normalizePhone = (value) => String(value || "").replace(/\D/g, "").replace(/^0+/, "").slice(-11);
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const searchable = (facts) => Object.entries(facts && typeof facts === "object" ? facts : {})
  .map(([name, value]) => `${name} ${String(value || "")}`).join(" ")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function classify(row) {
  const text = searchable(row.facts);
  let score = 30;
  const reasons = [];
  if (row.phone) { score += 20; reasons.push("telefone disponível"); }
  if (row.email) { score += 8; reasons.push("e-mail disponível"); }
  if (/imovel|imobili|apartamento|apto|studio|casa|bairro|regiao|visita|proposta|negoci/.test(text)) {
    score += 25; reasons.push("sinal imobiliário histórico");
  }
  if (/compr|negocio_feito|venda|reuniao|agendamento/.test(text)) {
    score += 12; reasons.push("interação comercial anterior");
  }
  if (Number(row.duplicate_group_size || 1) > 1) { score -= 8; reasons.push("histórico consolidado"); }
  score = Math.max(0, Math.min(100, score));
  return { score, tier: score >= 70 ? "focus" : score >= 40 ? "watch" : "suppress", reasons };
}

const db = createClient(url, key, { auth: { persistSession: false } });
const existing = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("leads").select("id,phone,email")
    .eq("organization_id", organizationId).range(from, from + 999);
  if (error) throw error;
  existing.push(...(data || []));
  if (!data || data.length < 1000) break;
}

const phones = new Set((existing || []).map((item) => normalizePhone(item.phone)).filter((item) => item.length >= 10));
const emails = new Set((existing || []).map((item) => normalizeEmail(item.email)).filter(Boolean));
const seen = new Set();
const candidates = [];
const totals = { preparedRows: 0, historyOnly: 0, masterCandidates: 0, duplicates: 0, invalid: 0, imported: 0, focus: 0, watch: 0, suppress: 0 };

for await (const line of createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  totals.preparedRows += 1;
  const row = JSON.parse(line);
  if (row.memory_role !== "master_candidate") { totals.historyOnly += 1; continue; }
  totals.masterCandidates += 1;
  const phone = normalizePhone(row.phone);
  const email = normalizeEmail(row.email);
  if (phone.length < 10 && !email) { totals.invalid += 1; continue; }
  const identity = phone.length >= 10 ? `phone:${phone}` : `email:${email}`;
  if ((phone.length >= 10 && phones.has(phone)) || (email && emails.has(email)) || seen.has(identity)) {
    totals.duplicates += 1; continue;
  }
  seen.add(identity);
  const classification = classify(row);
  totals[classification.tier] += 1;
  candidates.push({
    id: randomUUID(),
    name: String(row.name || "Contato histórico").trim().slice(0, 200),
    phone: phone.length >= 10 ? phone : null,
    email: email || null,
    preferred_neighborhoods: [],
    organization_id: organizationId,
    assigned_user_id: null,
    source: "Memória histórica protegida",
    campaign: "Reativação de base fria",
    status: "arquivado",
    score_ia: classification.score,
    classificacao_ia: classification.tier,
    temperature: "FRIO",
    next_action: "Aguardar aprovação humana para reativação",
    notes: [
      "Memória histórica consolidada; contato automático desativado.",
      `Origem: ${String(row.source_file || "base histórica").slice(0, 180)} / ${String(row.source_sheet || "aba não informada").slice(0, 120)}.`,
      `Registros consolidados: ${Math.max(1, Number(row.duplicate_group_size || 1))}.`,
      `Score local: ${classification.score}/100 (${classification.tier}); sinais: ${classification.reasons.join(", ") || "cadastro histórico"}.`,
    ].join("\n"),
    source_row: Number.isInteger(Number(row.source_row)) ? Number(row.source_row) : null,
  });
}

if (mode === "dry-run") {
  console.log(JSON.stringify({ mode, existingLeads: existing?.length || 0, ...totals, readyToImport: candidates.length }, null, 2));
  process.exit(0);
}

const batchId = randomUUID();
const { error: batchError } = await db.from("import_batches").insert({
  id: batchId,
  organization_id: organizationId,
  source_name: "Memória histórica protegida — reativação",
  source_file: filePath,
  total_rows: totals.preparedRows,
  imported_rows: 0,
  duplicate_rows: totals.historyOnly + totals.duplicates,
  invalid_rows: totals.invalid,
  created_by: actorId,
});
if (batchError) throw batchError;

for (let index = 0; index < candidates.length; index += 250) {
  const chunk = candidates.slice(index, index + 250).map((lead) => ({ ...lead, import_batch_id: batchId }));
  const { error } = await db.from("leads").insert(chunk);
  if (error) throw new Error(`Falha no lote ${index / 250 + 1}: ${error.message}`);
  totals.imported += chunk.length;
  process.stdout.write(`\r${totals.imported}/${candidates.length} contatos frios importados`);
}

const { error: updateError } = await db.from("import_batches").update({ imported_rows: totals.imported }).eq("id", batchId);
if (updateError) throw updateError;
console.log(`\n${JSON.stringify({ mode, batchId, ...totals }, null, 2)}`);
