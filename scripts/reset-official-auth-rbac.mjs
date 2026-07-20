import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY_TOKEN = "RESET_AND_INVITE_OFFICIAL_USERS";
const apply = process.argv.includes(`--confirm=${APPLY_TOKEN}`);
const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ATLAS_BASE_URL", "ATLAS_RECOVERY_INBOX"];
const missing = required.filter((key) => !process.env[key]);
if (process.env.ATLAS_ENV !== "homologation" || process.env.ATLAS_DATABASE_ENVIRONMENT !== "homologation") throw new Error("O reset oficial só pode ser executado em homologation.");
if (missing.length) throw new Error(`Variáveis ausentes: ${missing.join(", ")}`);
const baseUrl = process.env.ATLAS_BASE_URL.replace(/\/$/, "");
if (!/^https:\/\//i.test(baseUrl) || /(?:seu-dom[ií]nio|example|localhost)/i.test(baseUrl)) throw new Error("ATLAS_BASE_URL deve ser o domínio HTTPS real da homologação.");
const recoveryInbox = process.env.ATLAS_RECOVERY_INBOX.trim().toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(recoveryInbox)) throw new Error("ATLAS_RECOVERY_INBOX inválido.");
const [recoveryLocal, recoveryDomain] = recoveryInbox.split("@");

// Roster oficial do piloto (aprovado 2026-07-20).
// O trigger private.validate_commercial_hierarchy (migration official_auth_rbac) impõe
// APENAS 3 níveis de access_role, com commercial_role e supervisor determinados:
//   • director_decisor / admin -> commercial_role='director', SEM supervisor (raiz)
//   • director                 -> commercial_role='manager', supervisor.access_role='director_decisor'
//   • broker                   -> commercial_role='broker',  supervisor.access_role='director'
// Não existe um 4º nível "gerente" separado: DIRETOR e GERENTE caem no MESMO nível de
// acesso (access_role='director' / commercial_role='manager'); só o rótulo `role`
// (livre, sem CHECK) distingue "director" de "manager" para exibição e RLS grosseira
// (role in ('admin','manager') libera edição da organização/feature-flags).
// Thiago é a raiz decisora: access_role='director_decisor' (para poder supervisionar os
// diretores operacionais) + role='admin' (poderes de admin na RLS). Perfis inativos
// pulam a validação de hierarquia — é assim que o reset aposenta os antigos como legado.
const definitions = [
  { key: "THIAGO",  name: "Thiago Ribas D'Avila", accessRole: "director_decisor", role: "admin",    commercialRole: "director", supervisor: null },
  { key: "SENNA",   name: "Senna",                accessRole: "director",         role: "director", commercialRole: "manager",  supervisor: "THIAGO" },
  { key: "DIEGO",   name: "Diego",                accessRole: "director",         role: "manager",  commercialRole: "manager",  supervisor: "THIAGO" },
  { key: "LUCIANO", name: "Luciano",              accessRole: "director",         role: "manager",  commercialRole: "manager",  supervisor: "THIAGO" },
  { key: "ADOLFO",  name: "Adolfo",               accessRole: "broker",           role: "broker",   commercialRole: "broker",   supervisor: "DIEGO" },
].map((item) => ({ ...item, email: (process.env[`ATLAS_INITIAL_${item.key}_EMAIL`] || `${recoveryLocal}+atlas-${item.key.toLowerCase()}@${recoveryDomain}`).trim().toLowerCase() }));

const invalid = definitions.filter((item) => !/^\S+@\S+\.\S+$/.test(item.email));
if (invalid.length) throw new Error(`Preencha os e-mails oficiais: ${invalid.map((item) => `ATLAS_INITIAL_${item.key}_EMAIL`).join(", ")}`);
if (new Set(definitions.map((item) => item.email)).size !== definitions.length) throw new Error("Cada usuário inicial precisa de um e-mail exclusivo.");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let organizationId = process.env.ATLAS_AUTH_ORGANIZATION_ID;
if (!organizationId) {
  const { data: organizations, error } = await admin.from("organizations").select("id").eq("active", true).limit(2);
  if (error || organizations?.length !== 1) throw new Error("Informe ATLAS_AUTH_ORGANIZATION_ID quando houver zero ou mais de uma organização ativa.");
  organizationId = organizations[0].id;
}
const { data: organization, error: organizationError } = await admin.from("organizations").select("id,active").eq("id", organizationId).maybeSingle();
if (organizationError || !organization?.active) throw new Error("ATLAS_AUTH_ORGANIZATION_ID não aponta para uma organização ativa.");
const { error: schemaError } = await admin.from("profiles").select("id,access_role").limit(1);
if (schemaError) throw new Error("A migration official_auth_rbac ainda não foi aplicada.");

const authUsers = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  const batch = data?.users ?? [];
  authUsers.push(...batch);
  if (batch.length < 1000) break;
}
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", existingAuthUsers: authUsers.length, officialUsers: definitions.length, usersToBlock: authUsers.filter((user) => !definitions.some((item) => item.email === user.email?.toLowerCase())).length, passwordsStored: false, personalDataPrinted: false }, null, 2));
if (!apply) {
  console.log(`Simulação concluída. Para executar, repita com --confirm=${APPLY_TOKEN}.`);
  process.exit(0);
}

for (const user of authUsers) {
  const { error } = await admin.auth.admin.updateUserById(user.id, { ban_duration: "876000h" });
  if (error) throw error;
}
const { error: deactivateError } = await admin.from("profiles").update({ active: false, reports_to: null }).eq("organization_id", organizationId);
if (deactivateError) throw deactivateError;

const ids = new Map();
const credentials = [];
for (const item of definitions) {
  const password = `${randomBytes(18).toString("base64url")}!Aa7`;
  let user = authUsers.find((candidate) => candidate.email?.toLowerCase() === item.email);
  const isExisting = Boolean(user);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email: item.email, password, email_confirm: true, user_metadata: { full_name: item.name }, app_metadata: { organization_id: organizationId, access_role: item.accessRole } });
    if (error || !data.user) throw error || new Error(`Falha ao criar ${item.key}.`);
    user = data.user;
  }
  const { error: authError } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true, ban_duration: "none", app_metadata: { organization_id: organizationId, access_role: item.accessRole } });
  if (authError) throw authError;
  const reportsTo = item.supervisor ? ids.get(item.supervisor) : null;
  const { error: profileError } = await admin.from("profiles").upsert({ id: user.id, organization_id: organizationId, full_name: item.name, role: item.role, access_role: item.accessRole, commercial_role: item.commercialRole, reports_to: reportsTo, active: true }, { onConflict: "id" });
  if (profileError) throw profileError;
  if (isExisting) {
    const { error: recoveryError } = await admin.auth.resetPasswordForEmail(item.email, { redirectTo: `${baseUrl}/auth/callback?next=/reset-password` });
    if (recoveryError) throw recoveryError;
  }
  credentials.push({ name: item.name, email: item.email, password });
  ids.set(item.key, user.id);
}
if (credentials.length) {
  const outputDirectory = resolve(process.cwd(), "outputs");
  const outputFile = resolve(outputDirectory, "official-access-credentials.txt");
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(outputFile, `${credentials.map((item) => `${item.name}\nLogin: ${item.email}\nSenha temporária: ${item.password}`).join("\n\n")}\n`, { mode: 0o600 });
  chmodSync(outputFile, 0o600);
  console.log(`Credenciais novas gravadas localmente em ${outputFile}.`);
}
console.log(`RBAC oficial aplicado: ${definitions.length} acessos ativos; contas antigas classificadas como legado (bloqueadas, NÃO excluídas); dados (leads/clientes/histórico/projetos) intactos; senhas não armazenadas.`);
