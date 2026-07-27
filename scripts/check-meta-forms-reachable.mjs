#!/usr/bin/env node
/**
 * OS FORMULÁRIOS ATIVOS EXISTEM MESMO NA META?
 *
 * ── Por que este portão existe ──────────────────────────────────────────────
 *
 * `meta_lead_sources` tinha duas linhas chamadas "Spin Mood": uma com o
 * form_id certo (27957321800558327, 17 dígitos) e outra com ele truncado em 15
 * (279573218005583). A truncada estava ATIVA e com dono padrão definido — o
 * backfill bateria num formulário que não existe.
 *
 * Id de formulário Meta é numérico e longo. Truncar é o tipo de erro que
 * acontece copiando de planilha, de log ou de coluna estreita, e que NENHUMA
 * validação de formato pega: 15 dígitos é tão plausível quanto 17.
 *
 * Só perguntando à Meta dá para saber. Este portão pergunta.
 *
 * Rodar: npm run meta:formularios
 */

import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
for (const arquivo of [".env.local", ".env"]) {
  const caminho = path.join(raiz, arquivo);
  if (!fs.existsSync(caminho)) continue;
  for (const linha of fs.readFileSync(caminho, "utf8").split("\n")) {
    const m = linha.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TOKEN = process.env.META_ADS_ACCESS_TOKEN;
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_SB = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TOKEN || !URL_SB || !KEY_SB) {
  console.log("⏭️  Meta ou Supabase não configurados — nada a conferir.");
  process.exit(0);
}

const { createClient } = await import("@supabase/supabase-js");
const db = createClient(URL_SB, KEY_SB, { auth: { persistSession: false } });

const { data: fontes, error } = await db
  .from("meta_lead_sources")
  .select("name,form_id,active,default_owner_id")
  .eq("active", true);

if (error) {
  console.log(`⏭️  meta_lead_sources indisponível (${error.message}) — nada a conferir.`);
  process.exit(0);
}

console.log(`\nFORMULÁRIOS META ATIVOS\n${"─".repeat(70)}`);
const quebrados = [];

for (const f of fontes ?? []) {
  const r = await fetch(
    `https://graph.facebook.com/v23.0/${encodeURIComponent(f.form_id)}?fields=name,status&access_token=${TOKEN}`,
  );
  const corpo = await r.json();
  if (!r.ok || corpo.error) {
    quebrados.push(f);
    console.log(`  ✗ ${String(f.form_id).padEnd(19)} ${f.name} — NÃO EXISTE NA META`);
  } else {
    console.log(`  ✓ ${String(f.form_id).padEnd(19)} ${corpo.name} (${corpo.status})`);
  }
}

if (!quebrados.length) {
  console.log(`\n✅ As ${(fontes ?? []).length} fontes ativas existem na Meta.\n`);
  process.exit(0);
}

console.error(`
❌ ${quebrados.length} FONTE(S) ATIVA(S) APONTAM PARA FORMULÁRIO INEXISTENTE.

   O backfill vai bater em 404 nelas, e lead nova dessas fontes não entra.
   Causa mais comum: id truncado ao copiar — 15 dígitos é tão plausível quanto
   17, e nenhuma validação de formato pega isso.

   Confira o id no Gerenciador de Anúncios e corrija, ou desative a fonte:

${quebrados.map((f) => `     ${f.name}  →  ${f.form_id}`).join("\n")}
`);
process.exit(1);
