import { createClient } from "@supabase/supabase-js";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ATLAS_TEST_EMAIL",
  "ATLAS_TEST_PASSWORD",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error("Variáveis ausentes:", missing);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ATLAS_TEST_EMAIL.trim().toLowerCase();
const password = process.env.ATLAS_TEST_PASSWORD;
const projectRef = new URL(url).hostname.split(".")[0];

console.log("Diagnóstico Atlas Bootstrap");
console.log({ projectRef, emailDomain: email.split("@")[1], passwordLength: password.length });

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: organizations, error: organizationError } = await supabase
  .from("organizations")
  .select("id, name, slug, active")
  .eq("active", true)
  .limit(5);

if (organizationError) {
  console.error("Falha ao consultar organizations:", organizationError);
  process.exit(1);
}

const { count: profilesCount, error: profilesError } = await supabase
  .from("profiles")
  .select("id", { count: "exact", head: true });

if (profilesError) {
  console.error("Falha ao consultar profiles:", profilesError);
  process.exit(1);
}

console.log({ activeOrganizations: organizations?.length ?? 0, profilesCount: profilesCount ?? 0 });

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Administrador Atlas", role: "admin" },
});

if (error) {
  console.error("ERRO SUPABASE AUTH:");
  console.error({
    name: error.name,
    message: error.message,
    status: error.status,
    code: error.code,
  });
  process.exit(1);
}

const userId = data.user?.id;
if (!userId) {
  console.error("Supabase Auth não retornou o ID do usuário.");
  process.exit(1);
}

const organizationId = organizations?.[0]?.id;
if (!organizationId) {
  await supabase.auth.admin.deleteUser(userId);
  console.error("Nenhuma organização ativa encontrada; usuário removido para evitar inconsistência.");
  process.exit(1);
}

const { error: profileError } = await supabase.from("profiles").upsert(
  {
    id: userId,
    organization_id: organizationId,
    full_name: "Administrador Atlas",
    role: "admin",
    active: true,
  },
  { onConflict: "id" },
);

if (profileError) {
  await supabase.auth.admin.deleteUser(userId);
  console.error("Falha ao criar profile; usuário revertido:", profileError);
  process.exit(1);
}

console.log("Usuário piloto criado com sucesso:", {
  userId,
  organizationId,
  role: "admin",
});
