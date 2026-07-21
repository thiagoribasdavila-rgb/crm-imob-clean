/**
 * Teste adversarial do GATE DE DEPLOY (scripts/validate-deploy.mjs).
 *
 * O gate existe para deixar passar lacunas de ESCOPO (features incompletas) sem
 * jamais deixar passar lacunas de SEGURANÇA. O risco real é alguém "destravar o
 * deploy" jogando um passo crítico (security:secrets, rls:check, typecheck…) na
 * lista de exceções KNOWN_GAPS. Este check existe para que isso QUEBRE em vermelho.
 *
 * Estratégia (100% determinístico: só arquivos e subprocessos `node -e`, sem
 * rede, sem banco, sem relógio, sem aleatório):
 *  - análise estática do alvo (lê o `validate` do package.json; forma das lacunas);
 *  - simulação do filtro real sobre o `validate` REAL do package.json;
 *  - execução REAL do gate num diretório temporário com um package.json falso
 *    cujos passos são `node -e "process.exit(n)"` — assim medimos comportamento
 *    (código de saída, o que foi pulado, o que foi executado), não só texto.
 *
 * Rodar da raiz do repo: node scripts/check-validate-deploy.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = path.join(root, "scripts", "validate-deploy.mjs");
const pkgPath = path.join(root, "package.json");

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
    console.log(`❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

// --------------------------------------------------------------------------
// Passos que NUNCA podem ser pulados pelo gate.
// --------------------------------------------------------------------------
const CRITICAL_STEPS = [
  "security:secrets",
  "security:dependencies",
  "security:governance",
  "rls:check",
  "api-security:check",
  "typecheck",
  "lint",
  "build",
];
// Empacotamento pode ainda não estar no `validate`; o nome é reservado mesmo assim.
const PACKAGING_PATTERN = /package|hostinger|empacot/i;

const targetSource = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";

// --------------------------------------------------------------------------
// caso 1: o gate é auto-mantido — lê o script `validate` do package.json
// --------------------------------------------------------------------------
{
  const lePackageJson = /readFileSync\(\s*["']package\.json["']/.test(targetSource);
  const leValidate = /scripts\s*\??\.\s*validate/.test(targetSource);
  const quebraPorAnd = /split\(\s*["']&&["']\s*\)/.test(targetSource);
  check(
    "caso 1: gate lê o script `validate` do package.json e o quebra por && (auto-mantido)",
    targetSource.length > 0 && lePackageJson && leValidate && quebraPorAnd,
    `arquivo=${targetSource.length > 0} readFileSync(package.json)=${lePackageJson} scripts.validate=${leValidate} split(&&)=${quebraPorAnd}`,
  );
}

// --------------------------------------------------------------------------
// Extrai a lista KNOWN_GAPS do FONTE do alvo (não dá para importar: o módulo
// executa a suíte inteira no import).
// --------------------------------------------------------------------------
let KNOWN_GAPS = null;
let gapsParseError = "";
{
  const start = targetSource.indexOf("const KNOWN_GAPS");
  const open = start >= 0 ? targetSource.indexOf("[", start) : -1;
  if (open >= 0) {
    let depth = 0;
    let end = -1;
    for (let i = open; i < targetSource.length; i += 1) {
      const c = targetSource[i];
      if (c === "[") depth += 1;
      else if (c === "]") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end > open) {
      const literal = targetSource.slice(open, end + 1);
      try {
        // Literal puro de array de strings — avaliado isolado, sem escopo do alvo.
        KNOWN_GAPS = new Function(`"use strict"; return (${literal});`)();
      } catch (err) {
        gapsParseError = String(err?.message ?? err);
      }
    } else {
      gapsParseError = "colchete de fechamento de KNOWN_GAPS não encontrado";
    }
  } else {
    gapsParseError = "declaração `const KNOWN_GAPS = [` não encontrada no alvo";
  }
}

check(
  "caso 2: lista de exceções KNOWN_GAPS existe e é um array literal legível",
  Array.isArray(KNOWN_GAPS),
  gapsParseError || `tipo=${typeof KNOWN_GAPS}`,
);

const gaps = Array.isArray(KNOWN_GAPS) ? KNOWN_GAPS : [];
const gapNames = gaps.map((g) => (Array.isArray(g) ? String(g[0] ?? "") : String(g ?? "")));

// --------------------------------------------------------------------------
// caso 3: toda lacuna tem NOME e MOTIVO
// --------------------------------------------------------------------------
{
  const invalidas = gaps.filter(
    (g) =>
      !Array.isArray(g) ||
      g.length !== 2 ||
      typeof g[0] !== "string" ||
      typeof g[1] !== "string" ||
      g[0].trim().length === 0 ||
      g[1].trim().length < 5,
  );
  check(
    "caso 3: toda entrada de KNOWN_GAPS é [nome, motivo] com ambos preenchidos",
    gaps.length > 0 && invalidas.length === 0,
    invalidas.length ? `entradas sem nome/motivo: ${JSON.stringify(invalidas)}` : `total=${gaps.length}`,
  );
}

// --------------------------------------------------------------------------
// caso 4: sem lacunas duplicadas (exceção repetida esconde rastreio)
// --------------------------------------------------------------------------
{
  const dup = gapNames.filter((n, i) => gapNames.indexOf(n) !== i);
  check("caso 4: nenhuma lacuna duplicada em KNOWN_GAPS", dup.length === 0, `duplicadas: ${JSON.stringify(dup)}`);
}

// --------------------------------------------------------------------------
// caso 5: NENHUM passo crítico está em KNOWN_GAPS (casamento nos dois sentidos:
//         o gate filtra com step.includes(nome), então "security" mataria
//         "security:secrets" tanto quanto o nome exato)
// --------------------------------------------------------------------------
{
  const proibidas = [];
  for (const name of gapNames) {
    const alvo = name.trim();
    if (!alvo) continue;
    for (const crit of CRITICAL_STEPS) {
      if (crit.includes(alvo) || alvo.includes(crit)) proibidas.push(`${alvo} → ${crit}`);
    }
    if (PACKAGING_PATTERN.test(alvo)) proibidas.push(`${alvo} → empacotamento/package`);
  }
  check(
    "caso 5: nenhum passo crítico (segurança/RLS/API/typecheck/lint/build/empacotamento) está em KNOWN_GAPS",
    proibidas.length === 0,
    proibidas.length ? `exceção proibida: ${proibidas.join(" ; ")}` : `${gapNames.length} lacunas, todas de escopo`,
  );
}

// --------------------------------------------------------------------------
// Simulação do filtro real sobre o `validate` REAL do package.json
// --------------------------------------------------------------------------
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const realSteps = String(pkg.scripts?.validate ?? "")
  .split("&&")
  .map((s) => s.trim())
  .filter(Boolean);

function aplicaFiltro(steps) {
  const skipped = [];
  const kept = steps.filter((step) => {
    const gap = gaps.find((g) => step.includes(Array.isArray(g) ? g[0] : g));
    if (gap) {
      skipped.push(gap);
      return false;
    }
    return true;
  });
  return { kept, skipped };
}

// --------------------------------------------------------------------------
// caso 6: os passos críticos estão de fato no `validate` do package.json
// --------------------------------------------------------------------------
{
  const ausentes = CRITICAL_STEPS.filter((c) => !realSteps.some((s) => s.includes(c)));
  check(
    "caso 6: `validate` do package.json contém todos os passos críticos",
    realSteps.length > 0 && ausentes.length === 0,
    ausentes.length ? `faltando no validate: ${ausentes.join(", ")}` : `${realSteps.length} passos`,
  );
}

// --------------------------------------------------------------------------
// caso 7: aplicando o filtro real, todo passo crítico SOBREVIVE
// --------------------------------------------------------------------------
{
  const { kept } = aplicaFiltro(realSteps);
  const engolidos = CRITICAL_STEPS.filter(
    (c) => realSteps.some((s) => s.includes(c)) && !kept.some((s) => s.includes(c)),
  );
  check(
    "caso 7: após o filtro de KNOWN_GAPS, nenhum passo crítico é removido do plano real",
    engolidos.length === 0,
    engolidos.length ? `pulados indevidamente: ${engolidos.join(", ")}` : `${kept.length} obrigatórios mantidos`,
  );
}

// --------------------------------------------------------------------------
// caso 8: nenhuma exceção morta (toda lacuna corresponde a um passo do validate)
// --------------------------------------------------------------------------
{
  const orfas = gapNames.filter((n) => n.trim() && !realSteps.some((s) => s.includes(n)));
  check(
    "caso 8: toda lacuna de KNOWN_GAPS corresponde a um passo existente do `validate`",
    orfas.length === 0,
    orfas.length ? `exceções órfãs (rot): ${orfas.join(", ")}` : `${gapNames.length} lacunas rastreadas`,
  );
}

// --------------------------------------------------------------------------
// Execução REAL do gate em sandbox temporária
// --------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gate-deploy-"));

function fakeStep(name, ok) {
  // `#` vira comentário no shell: o comando roda, mas o passo carrega o nome.
  return `node -e "process.exit(${ok ? 0 : 1})" # ${name}`;
}

function rodaGate(validateScript) {
  const dir = fs.mkdtempSync(path.join(tmp, "run-"));
  const fake = { name: "fake-gate-fixture", private: true, scripts: {} };
  if (validateScript !== null) fake.scripts.validate = validateScript;
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(fake, null, 2), "utf8");
  const res = spawnSync(process.execPath, [targetPath], { cwd: dir, encoding: "utf8" });
  return { status: res.status, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

// --------------------------------------------------------------------------
// caso 9: todos os obrigatórios passando ⇒ exit 0 e mensagem de aprovação
// --------------------------------------------------------------------------
{
  const chain = [fakeStep("npm run security:secrets", true), fakeStep("npm run rls:check", true)].join(" && ");
  const { status, out } = rodaGate(chain);
  check(
    "caso 9: gate aprova (exit 0) quando todos os obrigatórios passam",
    status === 0 && /APROVADO/i.test(out) && /2 verifica/.test(out),
    `status=${status} out=${JSON.stringify(out.slice(0, 300))}`,
  );
}

// --------------------------------------------------------------------------
// caso 10: um obrigatório falhando ⇒ exit 1 dizendo QUAL falhou
// --------------------------------------------------------------------------
{
  const chain = [fakeStep("npm run security:secrets", true), fakeStep("npm run rls:check", false)].join(" && ");
  const { status, out } = rodaGate(chain);
  check(
    "caso 10: gate reprova com exit 1 e nomeia o obrigatório que falhou",
    status === 1 && /REPROVADO/i.test(out) && out.includes("rls:check") && !/APROVADO/i.test(out),
    `status=${status} out=${JSON.stringify(out.slice(-400))}`,
  );
}

// --------------------------------------------------------------------------
// caso 11: TODO passo crítico falhando ⇒ TODOS aparecem como reprovados
//          (prova comportamental de que nenhum deles é pulado pelo KNOWN_GAPS real)
// --------------------------------------------------------------------------
{
  const chain = CRITICAL_STEPS.map((c) => fakeStep(`npm run ${c}`, false)).join(" && ");
  const { status, out } = rodaGate(chain);
  const naoReportados = CRITICAL_STEPS.filter((c) => !out.includes(`✗ node -e "process.exit(1)" # npm run ${c}`));
  check(
    "caso 11: com todos os críticos quebrados, o gate reprova e reporta TODOS (nenhum foi pulado)",
    status === 1 &&
      naoReportados.length === 0 &&
      out.includes(`${CRITICAL_STEPS.length} verifica`) &&
      out.includes("(0 lacunas conhecidas puladas)"),
    naoReportados.length
      ? `críticos que o gate silenciou: ${naoReportados.join(", ")}`
      : `status=${status} out=${JSON.stringify(out.slice(0, 200))}`,
  );
}

// --------------------------------------------------------------------------
// caso 12: lacuna conhecida é REALMENTE pulada (não executada) e impressa com motivo
// --------------------------------------------------------------------------
{
  // Escolhe uma lacuna legítima (de escopo) para isolar este caso do caso 5/11.
  const gapEntry = gaps.find(
    (g) =>
      Array.isArray(g) &&
      realSteps.some((s) => s.includes(g[0])) &&
      !CRITICAL_STEPS.some((c) => c.includes(g[0]) || String(g[0]).includes(c)) &&
      !PACKAGING_PATTERN.test(String(g[0])),
  );
  const gapName = gapEntry ? gapEntry[0] : "";
  const gapReason = gapEntry ? gapEntry[1] : "";
  const chain = [
    fakeStep("npm run security:secrets", true),
    fakeStep(`npm run ${gapName}`, false), // falharia se fosse executado
  ].join(" && ");
  const { status, out } = rodaGate(chain);
  check(
    "caso 12: lacuna conhecida não é executada e é impressa com o motivo",
    Boolean(gapEntry) &&
      status === 0 &&
      out.includes("Lacunas conhecidas") &&
      out.includes(`${gapName} — ${gapReason}`) &&
      out.includes("(1 lacunas conhecidas puladas)"),
    `gap=${gapName} status=${status} out=${JSON.stringify(out.slice(0, 400))}`,
  );
}

// --------------------------------------------------------------------------
// caso 13: sem script `validate` no package.json ⇒ exit 1 (falha fechada)
// --------------------------------------------------------------------------
{
  const { status, out } = rodaGate(null);
  check(
    "caso 13: gate falha fechado (exit 1) quando o `validate` não existe",
    status === 1 && /validate/.test(out),
    `status=${status} out=${JSON.stringify(out.slice(0, 200))}`,
  );
}

// --------------------------------------------------------------------------
// caso 14: motivo de cada lacuna é humano (não é placeholder tipo "TODO"/"x")
// --------------------------------------------------------------------------
{
  const fracos = gaps.filter(
    (g) => Array.isArray(g) && (/^\s*(todo|tbd|wip|n\/a|-+)\s*$/i.test(String(g[1])) || String(g[1]).trim().split(/\s+/).length < 3),
  );
  check(
    "caso 14: todo motivo de lacuna é descritivo (≥3 palavras, sem placeholder)",
    fracos.length === 0,
    fracos.length ? `motivos vagos: ${JSON.stringify(fracos)}` : `${gaps.length} motivos ok`,
  );
}

fs.rmSync(tmp, { recursive: true, force: true });

// --------------------------------------------------------------------------
console.log("");
console.log(`check-validate-deploy: ${passed} passaram, ${failures.length} falharam`);
if (failures.length) {
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
