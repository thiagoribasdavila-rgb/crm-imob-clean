import { spawnSync } from "node:child_process";

const execution = spawnSync(
  process.execPath,
  ["scripts/preflight-production.mjs"],
  {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH || "",
      HOME: process.env.HOME || "",
      TMPDIR: process.env.TMPDIR || "",
      ATLAS_PREFLIGHT_IGNORE_LOCAL_ENV: "1",
    },
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  },
);

const output = `${execution.stdout || ""}\n${execution.stderr || ""}`;
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(execution.status !== 0, "preflight vazio deve falhar de forma segura");
expect(
  output.includes("❌ Banco isolado: configure ATLAS_DATABASE_ENVIRONMENT"),
  "banco sem ambiente não pode aparecer como aprovado",
);
expect(
  output.includes(
    "❌ NEXT_PUBLIC_SUPABASE_URL: configure NEXT_PUBLIC_SUPABASE_URL",
  ),
  "URL Supabase ausente deve mostrar orientação objetiva",
);
expect(
  output.includes(
    "❌ SUPABASE_SERVICE_ROLE_KEY: configure SUPABASE_SERVICE_ROLE_KEY somente no servidor",
  ),
  "service role ausente deve mostrar orientação segura",
);
expect(
  output.includes("⏭️ Smoke HTTP: aguardando domínio público real"),
  "preflight vazio não deve tentar chamar localhost como domínio público",
);
expect(
  !output.includes("fetch failed"),
  "preflight vazio não deve produzir falsos erros de rede",
);

if (failures.length) {
  console.error(`ATLAS production preflight contract: ${failures.length} falha(s)`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "ATLAS production preflight contract: fail-closed, mensagens acionáveis e smoke externo protegido.",
);
