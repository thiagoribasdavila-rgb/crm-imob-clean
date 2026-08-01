#!/usr/bin/env node
/**
 * CONECTAR UM WHATSAPP PELO TERMINAL DO SERVIDOR.
 *
 * O QR é a chave de pareamento: quem o vê entra na conta. Este caminho existe
 * para que ele possa ser lido sem passar por navegador nenhum — quem tem acesso
 * ao terminal do servidor já tem acesso a tudo, então não há superfície nova.
 *
 * A alternativa (tela do corretor) continua valendo e é a de uso diário: lá o
 * QR só aparece para o dono da própria sessão, autenticado, e nunca é gravado.
 *
 * Uso:
 *   npm run whatsapp:conectar -- <profile_id>
 *
 * Descobrir o profile_id:
 *   npm run whatsapp:conectar -- --listar
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

const SEGREDO = process.env.ATLAS_WHATSAPP_BRIDGE_SECRET;
const PONTE = process.env.ATLAS_WHATSAPP_BRIDGE_URL || "http://127.0.0.1:8790";
const alvo = process.argv[2];

if (!SEGREDO) {
  console.error("❌ ATLAS_WHATSAPP_BRIDGE_SECRET não definido — a ponte está desligada.");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

if (!alvo || alvo === "--listar") {
  const { data } = await db
    .from("profiles")
    .select("id,full_name,name,commercial_role,organization_id")
    .eq("active", true)
    .order("commercial_role");
  console.log("\nPERFIS ATIVOS\n" + "─".repeat(76));
  for (const p of data ?? []) {
    console.log(`  ${p.id}  ${(p.commercial_role ?? "—").padEnd(14)} ${p.full_name || p.name || "sem nome"}`);
  }
  console.log(`\nConectar:  npm run whatsapp:conectar -- <profile_id>\n`);
  process.exit(0);
}

const { data: perfil } = await db
  .from("profiles")
  .select("id,full_name,name,organization_id,commercial_role")
  .eq("id", alvo)
  .maybeSingle();

if (!perfil) {
  console.error(`❌ Perfil ${alvo} não encontrado. Rode com --listar.`);
  process.exit(1);
}

const chamar = async (rota, corpo) => {
  const r = await fetch(`${PONTE}${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-atlas-bridge-secret": SEGREDO },
    body: JSON.stringify(corpo),
  });
  return r.json();
};

const nome = perfil.full_name || perfil.name || perfil.id.slice(0, 8);
console.log(`\nConectando o WhatsApp de: ${nome} (${perfil.commercial_role})`);
console.log("─".repeat(76));

let estado = await chamar("/conectar", { profileId: perfil.id, organizationId: perfil.organization_id });
if (estado.status === "falhou" && estado.erro) {
  console.error(`\n❌ ${estado.erro}\n`);
  process.exit(1);
}

// O QR troca a cada ~20s. Consultamos até conectar ou desistir.
const { default: qrcode } = await import("qrcode");
let ultimoQr = null;
const limite = Date.now() + 3 * 60_000;

while (Date.now() < limite) {
  estado = await chamar("/estado", { profileId: perfil.id });

  if (estado.status === "conectado") {
    console.log(`\n✅ CONECTADO — número ${String(estado.phoneE164 ?? "").replace(/^(\d{2})(\d{2})\d+(\d{4})$/, "+$1 $2 *****-$3")}`);
    console.log("   O CRM já registra as conversas com leads deste número.\n");
    process.exit(0);
  }

  if (estado.status === "banido" || estado.status === "falhou") {
    console.error(`\n❌ ${estado.status}: ${estado.erro ?? "sem detalhe"}\n`);
    process.exit(1);
  }

  // A ponte devolve o QR como data URL; aqui reimprimimos no terminal.
  if (estado.qrPayload && estado.qrPayload !== ultimoQr) {
    ultimoQr = estado.qrPayload;
    // Desenhado no terminal, nunca gravado: um PNG de QR esquecido no disco é
    // a chave de pareamento da conta largada em arquivo.
    console.log("\n" + (await qrcode.toString(estado.qrPayload, { type: "terminal", small: true })));
    console.log("   WhatsApp › Aparelhos conectados › Conectar um aparelho");
    console.log(`   (expira em ~20s; um novo aparece sozinho)`);
  }

  await new Promise((ok) => setTimeout(ok, 3000));
}

console.error("\n⏱️  Três minutos sem leitura. Rode de novo quando estiver com o celular em mãos.\n");
process.exit(1);
