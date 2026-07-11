import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const baseUrl = (process.env.ATLAS_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const email = process.env.ATLAS_TEST_EMAIL || "";
const password = process.env.ATLAS_TEST_PASSWORD || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const publicRoutes = [
  ["Home", "/", [200, 307, 308]],
  ["Login", "/login", [200]],
  ["Health", "/api/health", [200, 503]],
  ["Readiness", "/api/ready", [200, 503]],
];

const protectedPages = [
  "/dashboard",
  "/leads",
  "/leads/new",
  "/pipeline",
  "/customers",
  "/properties",
  "/developments",
  "/tasks",
  "/marketing",
  "/atlas-v2",
  "/atlas-v3",
  "/atlas-2030",
];

const authenticatedApis = [
  ["Pipeline API", "/api/v1/pipeline"],
  ["Launch OS API", "/api/v1/launch-os"],
  ["V3 status", "/api/v3/status"],
];

let failures = 0;

async function check(name, path, expected, options = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: "manual", ...options });
    const duration = Date.now() - startedAt;
    const passed = expected.includes(response.status);
    console.log(`${passed ? "✅" : "❌"} ${name}: HTTP ${response.status} (${duration} ms)`);
    if (!passed) {
      failures += 1;
      const body = await response.text().catch(() => "");
      if (body) console.log(`   ${body.slice(0, 240)}`);
    }
  } catch (error) {
    failures += 1;
    console.log(`❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\nATLAS AI — Auditoria de rotas reais (${baseUrl})\n`);

for (const [name, path, expected] of publicRoutes) {
  await check(name, path, expected);
}

for (const path of protectedPages) {
  await check(`Proteção ${path}`, path, [200, 307, 308]);
}

if (email && password && supabaseUrl && supabaseAnonKey) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    failures += 1;
    console.log(`❌ Login técnico: ${error?.message || "token não retornado"}`);
  } else {
    console.log("✅ Login técnico: sessão real obtida");
    const headers = { Authorization: `Bearer ${data.session.access_token}` };
    for (const [name, path] of authenticatedApis) {
      await check(name, path, [200], { headers });
    }
    await supabase.auth.signOut();
  }
} else {
  console.log("⚠️  APIs autenticadas não testadas. Defina ATLAS_TEST_EMAIL e ATLAS_TEST_PASSWORD no ambiente.");
}

if (failures > 0) {
  console.error(`\n❌ Auditoria concluída com ${failures} falha(s).`);
  process.exit(1);
}

console.log("\n✅ Auditoria de rotas reais concluída sem falhas.\n");
