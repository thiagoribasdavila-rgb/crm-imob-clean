import { createClient } from "@supabase/supabase-js";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ATLAS_ENV",
  "ATLAS_BOOTSTRAP_SECRET",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error("Variáveis ausentes:", missing);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = new URL(url).hostname.split(".")[0];

console.log("Diagnóstico Atlas Bootstrap");
console.log({
  projectRef,
  environment: process.env.ATLAS_ENV,
  allowedEnvironment: ["development", "homologation"].includes(process.env.ATLAS_ENV),
  bootstrapSecretStrong: process.env.ATLAS_BOOTSTRAP_SECRET.length >= 32,
});

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

const profiles = profilesCount ?? 0;
console.log({
  activeOrganizations: organizations?.length ?? 0,
  profilesCount: profiles,
  bootstrapStatus: profiles === 0 ? "AVAILABLE" : "LOCKED",
  mutatingActionsPerformed: 0,
});

if (!["development", "homologation"].includes(process.env.ATLAS_ENV)) process.exitCode = 1;
if (process.env.ATLAS_BOOTSTRAP_SECRET.length < 32) process.exitCode = 1;
if (!organizations?.length) process.exitCode = 1;
