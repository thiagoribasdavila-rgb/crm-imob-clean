/**
 * Roda a varredura completa com os olhos de um CORRETOR.
 *
 * A varredura padrão usa papel executivo, que enxerga tudo — e é justamente por
 * isso que ela não mede o que o corretor vê. Um 403 legítimo para executivo é
 * raro; para corretor é o caminho normal, e é ali que moram os becos sem saída.
 *
 * Cria um corretor descartável com a hierarquia que o RBAC exige
 * (access_role='broker' + reports_to um diretor operacional ativo), roda a
 * varredura com as credenciais dele e apaga tudo — inclusive se falhar.
 *
 * A senha existe só em memória e só é passada por variável de ambiente ao
 * processo filho; nunca é gravada nem impressa.
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const ORG = "7c8c71c1-e963-464c-be5c-ff8c7936f51a";
const DIRETOR_OPERACIONAL = "240a6bc5-5163-42ab-9d0f-729c7d0b0d35";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const senha = crypto.randomBytes(24).toString("base64url");
const email = `varredura-corretor-${Date.now()}@atlas-teste.local`;
let userId = null;

try {
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  userId = data.user.id;

  const { error: erroPerfil } = await admin.from("profiles").upsert({
    id: userId, name: "Varredura Corretor", full_name: "Varredura Corretor", email,
    organization_id: ORG, role: "broker", access_role: "broker", commercial_role: "broker",
    reports_to: DIRETOR_OPERACIONAL, active: true,
  });
  if (erroPerfil) throw new Error(`profile: ${erroPerfil.message}`);

  console.log(`corretor descartável criado · varrendo…\n`);
  const r = spawnSync("node", ["scripts/varredura-completa.mjs"], {
    stdio: "inherit",
    env: { ...process.env, TESTE_EMAIL: email, TESTE_SENHA: senha },
  });
  process.exitCode = r.status ?? 1;
} finally {
  if (userId) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    console.log("\ncorretor descartável removido");
  }
}
