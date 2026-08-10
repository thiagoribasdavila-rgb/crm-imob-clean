import fs from "node:fs";

const checks = [];
const requireSource = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) {
    checks.push([`${file}: ${token}`, source.includes(token)]);
  }
};
const requireSourceInsensitive = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8").toLocaleLowerCase("pt-BR");
  for (const token of tokens) {
    checks.push([`${file}: ${token}`, source.includes(token.toLocaleLowerCase("pt-BR"))]);
  }
};

requireSource(
  "app/(crm)/pipeline/page.tsx",
  "const pipelineAttention = useMemo",
  "new Map(",
  "pipelineAttention.critical",
  "pipelineAttention.hotUnprotected",
  "pipelineAttention.valueAtRisk",
  "data-pipeline-decision-contract=\"unique-attention\"",
  "setFocus(decisionCommand.focus)",
  "setSort(decisionCommand.sort)",
  "setFocusMode(decisionCommand.focusMode)",
  "setCompact(decisionCommand.compact)",
  "setHideEmpty(decisionCommand.hideEmpty)",
  "compactBrl.format(pipelineAttention.valueAtRisk)",
);

requireSource(
  "app/globals.css",
  ".atlas-decision-command-action:focus-visible",
  "font-variant-numeric: tabular-nums",
);

requireSourceInsensitive(
  "docs/PIPELINE_UNIQUE_ATTENTION_DECISION_CONTRACT.md",
  "atenção única",
  "comando operacional",
  "sem alteração de banco",
);

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "✓" : "✗"} ${label}`);
}

if (failed.length > 0) {
  console.error(`\nContrato decisório do Pipeline reprovado: ${failed.length} verificação(ões) falharam.`);
  process.exit(1);
}

console.log(`\nContrato decisório do Pipeline aprovado: ${checks.length} verificações.`);
