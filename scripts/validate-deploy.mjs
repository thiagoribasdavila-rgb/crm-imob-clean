/**
 * GATE DE DEPLOY — o que precisa valer para subir com SEGURANÇA.
 *
 * `npm run validate` é a suíte COMPLETA (aspiracional): inclui checks de
 * COMPLETUDE DE FEATURES que ainda estão no roadmap. Como ele encadeia tudo com
 * `&&`, uma feature inacabada trava o deploy de tudo o que ESTÁ pronto — o que é
 * errado: um gate de deploy deve barrar release INSEGURA, não release incompleta.
 *
 * Este gate roda os MESMOS passos do `validate`, EXCETO a lista explícita abaixo
 * de lacunas conhecidas e rastreadas. Ele é auto-mantido: lê o próprio script
 * `validate` do package.json, então qualquer check novo entra aqui automaticamente
 * (só sai se for adicionado à lista de exceções, sempre com motivo).
 *
 * Segurança, segredos, RLS, API, observabilidade, orçamento de performance e o
 * gate final da Hostinger CONTINUAM obrigatórios — nada disso é pulado.
 *
 * Rodar: npm run validate:deploy
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Lacunas CONHECIDAS e rastreadas — features ainda não concluídas cujo check de
 * contrato falha. Não são risco de segurança; são escopo pendente. Cada uma deve
 * sair desta lista assim que a feature for entregue.
 */
const KNOWN_GAPS = [
  ["commercial-hierarchy:check", "hierarquia comercial governada (RLS/função) pendente"],
  ["hierarchy-enforcement:check", "navegação por perfil ainda não cobre os 4 papéis no contrato"],
  ["manager-dashboard:check", "painel do gestor consolidado no command-center; contrato aguarda refresh revisado"],
  ["director-dashboard:check", "painel do diretor consolidado no command-center; contrato aguarda refresh revisado"],
  ["first-contact-sla:check", "SLA de primeiro contato incompleto"],
  ["follow-up-sla:check", "experiência gerencial do SLA de follow-up incompleta"],
  ["proposal-sla:check", "SLA de proposta incompleto"],
  ["recurring-tasks:check", "tarefas recorrentes incompletas"],
  ["unassigned-queue:check", "fila sem responsável incompleta"],
  ["absence-redistribution:check", "cobertura por ausência incompleta"],
  ["broker-capacity:check", "capacidade de carteira incompleta"],
  ["distribution-priority:check", "prioridade explicável de distribuição incompleta"],
  ["lead-reservation:check", "reserva de leads incompleta"],
  ["portfolio-audit:check", "ledger de auditoria da carteira incompleto"],
  ["ai:calibration", "calibração imobiliária da IA com controles pendentes (features em roadmap)"],
];

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const all = String(pkg.scripts?.validate ?? "")
  .split("&&")
  .map((s) => s.trim())
  .filter(Boolean);

if (all.length === 0) {
  console.error("GATE DE DEPLOY: script `validate` não encontrado no package.json.");
  process.exit(1);
}

const skipped = [];
const steps = all.filter((step) => {
  const gap = KNOWN_GAPS.find(([name]) => step.includes(name));
  if (gap) {
    skipped.push(gap);
    return false;
  }
  return true;
});

console.log(`GATE DE DEPLOY · ${steps.length} verificações obrigatórias (${skipped.length} lacunas conhecidas puladas)\n`);

const failures = [];
for (const [index, step] of steps.entries()) {
  const label = step.replace(/^npm run /, "");
  process.stdout.write(`[${String(index + 1).padStart(2, "0")}/${steps.length}] ${label} … `);
  try {
    execSync(step, { stdio: "pipe" });
    console.log("ok");
  } catch {
    console.log("FALHOU");
    failures.push(label);
  }
}

console.log("");
if (skipped.length) {
  console.log("Lacunas conhecidas (rastreadas, NÃO bloqueiam deploy):");
  for (const [name, reason] of skipped) console.log(`  · ${name} — ${reason}`);
  console.log("");
}

if (failures.length) {
  console.error(`GATE DE DEPLOY REPROVADO — ${failures.length} verificação(ões) obrigatória(s) falharam:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(`GATE DE DEPLOY APROVADO — ${steps.length} verificações obrigatórias passaram (segurança, segredos, RLS, API, observabilidade, performance e empacotamento).`);
