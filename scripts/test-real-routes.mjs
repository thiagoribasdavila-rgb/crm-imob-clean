import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const baseUrl = (process.env.ATLAS_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const email = process.env.ATLAS_TEST_EMAIL || "";
const password = process.env.ATLAS_TEST_PASSWORD || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const publicRoutes = [
  ["Home", "/", [200, 307, 308]],
  ["Login", "/login", [200]],
  ["Password recovery", "/forgot-password", [200]],
  ["Legacy health", "/api/health", [200, 503]],
  ["Legacy readiness", "/api/ready", [200, 503]],
  ["API v1 manifest", "/api/v1", [200]],
  ["API v1 health", "/api/v1/health", [200, 503]],
  ["API v1 readiness", "/api/v1/ready", [200, 503]],
  ["OpenAPI", "/api/v1/openapi", [200]],
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
  ["Identity API", "/api/v1/auth/me", [200]],
  ["Leads API", "/api/v1/crm/leads?limit=5", [200]],
  ["Pipeline API", "/api/v1/pipeline", [200, 404]],
  ["Launch OS API", "/api/v1/launch-os", [200, 404]],
  ["V3 status", "/api/v3/status", [200, 404]],
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
      if (body) console.log(`   ${body.slice(0, 320)}`);
    }
    return response;
  } catch (error) {
    failures += 1;
    console.log(`❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

console.log(`\nATLAS AI — Auditoria de produção real (${baseUrl})\n`);

for (const [name, path, expected] of publicRoutes) {
  await check(name, path, expected);
}

for (const path of protectedPages) {
  const response = await check(`Proteção ${path}`, path, [307, 308]);
  const location = response?.headers.get("location") || "";
  if (response && !location.includes("/login")) {
    failures += 1;
    console.log(`❌ Proteção ${path}: redirecionamento não aponta para /login (${location || "sem Location"})`);
  }
}

if (email && password && supabaseUrl && supabaseAnonKey) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    failures += 1;
    console.log(`❌ Login técnico: ${error?.message || "token não retornado"}`);
  } else {
    console.log("✅ Login técnico: sessão real obtida");
    const headers = {
      Authorization: `Bearer ${data.session.access_token}`,
      "X-Request-Id": crypto.randomUUID(),
      "X-Correlation-Id": crypto.randomUUID(),
    };
    for (const [name, path, expected] of authenticatedApis) {
      await check(name, path, expected, { headers });
    }
    await supabase.auth.signOut();
  }
} else {
  console.log("⚠️  Login autenticado não executado. Defina ATLAS_TEST_EMAIL, ATLAS_TEST_PASSWORD e variáveis públicas do Supabase.");
}

if (failures > 0) {
  console.error(`\n❌ Auditoria concluída com ${failures} falha(s).`);
  process.exit(1);
}

console.log("\n✅ Auditoria de produção real concluída sem falhas.\n");
