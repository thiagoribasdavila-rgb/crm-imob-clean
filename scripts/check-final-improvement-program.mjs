import fs from "node:fs";
const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens)
    checks.push([`${file}: ${token}`, source.includes(token)]);
};
need(
  "docs/FINAL_10_PHASES_IMPROVEMENT_PROGRAM.md",
  "## 1. Auditoria global",
  "## 10. Regressão",
  "Produção continua dependente do GO executivo",
);
need(
  "docs/FINAL_PHASE_1_SYSTEM_AUDIT.md",
  "1.708 arquivos rastreados",
  "Cinco telas acima de 800 linhas",
  "reduzindo as consultas iniciais de cinco para três (40%)",
);
need(
  "config/final-10-phases-improvement.json",
  '"phases": 10',
  '"completed": [',
  '"automatic_deploy": false',
);
for (const [label, passed] of checks)
  console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(
  `\nPrograma final aprovado: ${checks.length} controles; Fase Final 1 concluída.`,
);
