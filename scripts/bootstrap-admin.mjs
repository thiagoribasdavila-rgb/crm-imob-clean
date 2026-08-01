import { createClient } from "@supabase/supabase-js";

function readArg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value?.slice(prefix.length).trim();
}

function fail(message) {
  console.error(`\nAtlas bootstrap failed: ${message}\n`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = readArg("email");
const password = readArg("password");
const fullName = readArg("name") || "Atlas Administrator";
const confirmation = readArg("confirm");
const atlasEnvironment = process.env.ATLAS_ENV;
const bootstrapSecret = process.env.ATLAS_BOOTSTRAP_SECRET;

if (!["development", "homologation"].includes(atlasEnvironment)) {
  fail("ATLAS_ENV must be development or homologation; bootstrap is forbidden in production");
}
if (!bootstrapSecret || bootstrapSecret.length < 32) {
  fail("define a temporary ATLAS_BOOTSTRAP_SECRET with at least 32 characters");
}
if (confirmation !== "CREATE_FIRST_ADMIN") {
  fail("add --confirm=CREATE_FIRST_ADMIN after checking the target environment");
}

if (!url || !serviceRoleKey) {
  fail("define NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
}
if (!email) fail("use --email=you@company.com");
const passwordCategories = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((rule) => rule.test(password ?? "")).length;
if (!password || password.length < 12 || password.length > 128 || passwordCategories < 3) {
  fail("use --password= with 12-128 characters and at least three character categories");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { count, error: countError } = await admin
  .from("profiles")
  .select("id", { count: "exact", head: true });

if (countError) fail(countError.message);
if ((count ?? 0) > 0) fail("bootstrap is locked because a profile already exists");

const { data: organization, error: organizationError } = await admin
  .from("organizations")
  .select("id,name")
  .eq("active", true)
  .order("created_at", { ascending: true })
  .limit(1)
  .single();

if (organizationError || !organization) {
  fail(organizationError?.message || "no active organization found");
}

const { data: created, error: userError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});

if (userError || !created.user) fail(userError?.message || "user creation failed");

const { error: profileError } = await admin.from("profiles").upsert({
  id: created.user.id,
  organization_id: organization.id,
  full_name: fullName,
  role: "admin",
  active: true,
});

if (profileError) {
  await admin.auth.admin.deleteUser(created.user.id);
  fail(profileError.message);
}

console.log("\nAtlas administrator created successfully.");
console.log(`Organization: ${organization.name}`);
console.log(`Email: ${email}`);
console.log("Next steps: validate the first login, then remove ATLAS_BOOTSTRAP_SECRET and restart the application.\n");
