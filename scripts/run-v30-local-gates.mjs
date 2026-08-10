import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const program = JSON.parse(
  readFileSync(resolve(root, "config/v30-consolidation-30-phases.json"), "utf8"),
);
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const args = new Map(
  process.argv
    .slice(2)
    .map((argument) => argument.split("="))
    .filter(([key, value]) => key && value),
);
const from = Number(args.get("--from") || 1);
const to = Number(args.get("--to") || 28);
const outputPath = resolve(
  root,
  args.get("--output") || "artifacts/v30/local-gate-results.json",
);

const externalOnly = new Map([
  ["security:dependencies", "depende do registry npm para auditoria atualizada"],
  ["smoke:v3", "depende de aplicação executando em URL de homologação"],
  ["smoke:all", "depende de aplicação executando em URL de homologação"],
  ["routes:real", "depende de URL, Supabase e conta de teste reais"],
]);
const finalOnly = new Map([
  ["release:prebuild-check", "reservado ao gate final da fase 29"],
  ["build", "único build completo permitido somente na fase 29"],
  ["package:hostinger", "somente após o build final aprovado"],
  ["package:hostinger:clean-build", "somente após a criação do ZIP final"],
]);
const environmentFailurePatterns = new Map([
  [
    "test:e2e",
    /@playwright\/test.*não está instalado|\.env\.local ausente|ATLAS E2E: ambiente ainda não está pronto|E2E bloqueado/i,
  ],
  [
    "preflight:production",
    /Production Preflight|Preflight bloqueado|variáveis? obrigatórias?/i,
  ],
  [
    "runtime:evidence:check",
    /ATLAS RUNTIME EVIDENCE: homologação e decisão humana ainda pendentes/i,
  ],
]);
const installationFailurePatterns = new Map([
  [
    "test:e2e:dependencies",
    /ATLAS E2E DEPENDENCIES: instalação pendente/i,
  ],
]);

const cache = new Map();
const phases = [];

function tail(value, limit = 1800) {
  const text = String(value || "").trim();
  return text.length > limit ? text.slice(-limit) : text;
}

function runTest(name) {
  if (cache.has(name)) return { ...cache.get(name), reused: true };
  if (!packageJson.scripts?.[name]) {
    const result = { name, status: "failed", reason: "script npm inexistente" };
    cache.set(name, result);
    return result;
  }
  if (externalOnly.has(name)) {
    const result = {
      name,
      status: "waiting_environment",
      reason: externalOnly.get(name),
    };
    cache.set(name, result);
    return result;
  }
  if (finalOnly.has(name)) {
    const result = {
      name,
      status: "reserved_final_gate",
      reason: finalOnly.get(name),
    };
    cache.set(name, result);
    return result;
  }

  const startedAt = Date.now();
  const execution = spawnSync("npm", ["run", "--silent", name], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const combinedOutput = `${execution.stdout || ""}\n${execution.stderr || ""}`;
  const waitingForEnvironment =
    execution.status !== 0 &&
    environmentFailurePatterns.has(name) &&
    environmentFailurePatterns.get(name).test(combinedOutput);
  const waitingForInstallation =
    execution.status !== 0 &&
    installationFailurePatterns.has(name) &&
    installationFailurePatterns.get(name).test(combinedOutput);
  const result = {
    name,
    status:
      execution.status === 0
        ? "passed"
        : waitingForInstallation
          ? "waiting_installation"
          : waitingForEnvironment
            ? "waiting_environment"
            : "failed",
    exitCode: execution.status ?? 1,
    durationMs: Date.now() - startedAt,
    stdoutTail: tail(execution.stdout),
    stderrTail: tail(execution.stderr),
    ...(waitingForInstallation
      ? {
          reason:
            "gate executado e bloqueado somente pela instalação da dependência de teste",
        }
      : waitingForEnvironment
        ? {
            reason:
              "gate executado e bloqueado somente por dependências do ambiente real",
          }
        : {}),
  };
  cache.set(name, result);
  return result;
}

for (const phase of program.phases) {
  if (phase.id < from || phase.id > to) continue;
  const tests = phase.tests.map(runTest);
  const failed = tests.filter((test) => test.status === "failed");
  const waitingInstallation = tests.filter(
    (test) => test.status === "waiting_installation",
  );
  const waiting = tests.filter((test) => test.status === "waiting_environment");
  const reserved = tests.filter((test) => test.status === "reserved_final_gate");
  const status = failed.length
    ? "blocked"
    : waitingInstallation.length
      ? "waiting_installation"
      : waiting.length
        ? "waiting_environment"
        : reserved.length
          ? "reserved_final_gate"
          : "approved_locally";
  phases.push({
    id: phase.id,
    title: phase.title,
    status,
    tests,
  });
  console.log(
    `${String(phase.id).padStart(2, "0")} ${status.padEnd(20)} ${phase.title}`,
  );
}

const result = {
  program: program.program,
  generatedAt: new Date().toISOString(),
  range: { from, to },
  policy: {
    fullBuildExecuted: false,
    packageCreated: false,
    realEnvironmentTestsExecuted: false,
  },
  summary: {
    phases: phases.length,
    approvedLocally: phases.filter((phase) => phase.status === "approved_locally")
      .length,
    waitingEnvironment: phases.filter(
      (phase) => phase.status === "waiting_environment",
    ).length,
    waitingInstallation: phases.filter(
      (phase) => phase.status === "waiting_installation",
    ).length,
    blocked: phases.filter((phase) => phase.status === "blocked").length,
    reservedFinalGate: phases.filter(
      (phase) => phase.status === "reserved_final_gate",
    ).length,
    uniqueTests: cache.size,
    passedTests: [...cache.values()].filter((test) => test.status === "passed")
      .length,
    failedTests: [...cache.values()].filter((test) => test.status === "failed")
      .length,
  },
  phases,
};

mkdirSync(resolve(outputPath, ".."), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Evidência: ${outputPath}`);
console.log(JSON.stringify(result.summary, null, 2));

if (result.summary.blocked > 0) process.exitCode = 1;
