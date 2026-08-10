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
const requestedOrganizationName = readArg("organization") || "Atlas One";
const requestedOrganizationSlug = readArg("organization-slug");
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

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
}

const { count, error: countError } = await admin
  .from("profiles")
  .select("id", { count: "exact", head: true });

if (countError) fail(countError.message);
if ((count ?? 0) > 0) fail("bootstrap is locked because a profile already exists");

const { data: organizations, error: organizationError } = await admin
  .from("organizations")
  .select("id,name")
  .eq("active", true)
  .order("created_at", { ascending: true })
  .limit(2);

if (organizationError) fail(organizationError.message);
if ((organizations?.length ?? 0) > 1) {
  fail("more than one active organization exists; use the protected application bootstrap and select the tenant");
}

let organization = organizations?.[0];
let createdOrganizationId = null;
if (!organization) {
  const slug = slugify(requestedOrganizationSlug || requestedOrganizationName);
  if (slug.length < 3) fail("use --organization= with a valid organization name");
  const { data, error } = await admin
    .from("organizations")
    .insert({ name: requestedOrganizationName, slug, status: "ACTIVE" })
    .select("id,name")
    .single();
  if (error || !data) fail(error?.message || "organization creation failed");
  organization = data;
  createdOrganizationId = data.id;
}

const { data: created, error: userError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
  app_metadata: {
    organization_id: organization.id,
    access_role: "admin",
    commercial_role: "director",
  },
});

if (userError || !created.user) {
  if (createdOrganizationId) {
    await admin.from("organizations").delete().eq("id", createdOrganizationId);
  }
  fail(userError?.message || "user creation failed");
}

const { error: profileError } = await admin.from("profiles").upsert({
  id: created.user.id,
  organization_id: organization.id,
  full_name: fullName,
  name: fullName,
  email,
  role: "admin",
  access_role: "admin",
  commercial_role: "director",
  reports_to: null,
  active: true,
});

if (profileError) {
  await admin.auth.admin.deleteUser(created.user.id);
  if (createdOrganizationId) {
    await admin.from("organizations").delete().eq("id", createdOrganizationId);
  }
  fail(profileError.message);
}

console.log("\nAtlas administrator created successfully.");
console.log(`Organization: ${organization.name}`);
console.log(`Email: ${email}`);
console.log("Next steps: validate the first login, then remove ATLAS_BOOTSTRAP_SECRET and restart the application.\n");
