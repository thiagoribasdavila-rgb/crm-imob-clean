import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const [filePath] = process.argv.slice(2);
const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const organizationId=process.env.ATLAS_IMPORT_ORGANIZATION_ID, ownerId=process.env.ATLAS_IMPORT_OWNER_ID, actorId=process.env.ATLAS_IMPORT_ACTOR_ID;
if(!filePath||!url||!key||!organizationId||!ownerId||!actorId) throw new Error("Informe o JSONL e configure ATLAS_IMPORT_ORGANIZATION_ID, ATLAS_IMPORT_OWNER_ID e ATLAS_IMPORT_ACTOR_ID.");

function classify(row) {
  const facts = row.facts && typeof row.facts === "object" ? row.facts : {};
  const searchable = Object.entries(facts).map(([name, value]) => `${name} ${String(value || "")}`).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let score = row.memory_role === "master_candidate" ? 30 : 12;
  const reasons = [];
  if (row.phone) { score += 20; reasons.push("telefone disponível"); }
  if (row.email) { score += 8; reasons.push("e-mail disponível"); }
  if (/imovel|imobili|apartamento|apto|studio|casa|bairro|regiao|visita|proposta|negoci/.test(searchable)) { score += 25; reasons.push("sinal imobiliário histórico"); }
  if (/compr|negocio_feito|venda|reuniao|agendamento/.test(searchable)) { score += 12; reasons.push("interação comercial anterior"); }
  if (Number(row.duplicate_group_size || 1) > 1) { score -= 8; reasons.push("histórico consolidado"); }
  score = Math.max(0, Math.min(100, score));
  return { score, tier: score >= 70 ? "focus" : score >= 40 ? "watch" : "suppress", reasons: reasons.slice(0, 5), engine: "atlas-local-reactivation-v1", classifiedAt: new Date().toISOString(), humanApprovalRequired: true, automaticContact: false };
}

const db=createClient(url,key,{auth:{persistSession:false}}); const totals={processed:0,created:0,memory_attached:0,blocked:0,failed:0,classified:{focus:0,watch:0,suppress:0}};
for await (const line of createInterface({input:createReadStream(filePath),crlfDelay:Infinity})) {
  if(!line.trim()) continue; const row=JSON.parse(line); totals.processed+=1;
  const classification=classify(row);
  const {data,error}=await db.rpc("import_historical_lead_memory",{p_organization_id:organizationId,p_owner_id:ownerId,p_imported_by:actorId,p_name:row.name,p_phone:row.phone,p_email:row.email,p_source_file:row.source_file,p_source_sheet:row.source_sheet,p_source_row:row.source_row,p_source_fingerprint:row.source_fingerprint,p_commercial_facts:row.facts,p_excluded_sensitive_fields:row.excluded_sensitive_fields,p_duplicate_group_size:row.duplicate_group_size,p_memory_role:row.memory_role});
  if(error) totals.failed+=1; else {
    totals[data?.status] = (totals[data?.status]||0)+1;
    totals.classified[classification.tier] += 1;
    if(data?.status==="created"&&data?.leadId){
      const {data:lead}=await db.from("leads").select("metadata").eq("id",data.leadId).single();
      const metadata=lead?.metadata&&typeof lead.metadata==="object"?lead.metadata:{};
      const {error:updateError}=await db.from("leads").update({status:"arquivado",metadata:{...metadata,historicalMemory:true,reactivationClassification:classification}}).eq("id",data.leadId).eq("organization_id",organizationId);
      if(updateError) totals.failed+=1;
    }
  }
  if(totals.processed%250===0) process.stdout.write(`\r${totals.processed} memórias processadas`);
}
console.log(`\n${JSON.stringify(totals)}`);
