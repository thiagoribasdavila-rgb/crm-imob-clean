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

if (!url || !serviceRoleKey) {
  fail("define NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
}
if (!email) fail("use --email=you@company.com");
if (!password || password.length < 12) fail("use --password= with at least 12 characters");

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
console.log("Next step: npm run dev and open http://localhost:3000/login\n");