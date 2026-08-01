import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

const checks = [
  {
    file: "app/globals.css",
    label: "Tema claro opt-in existe",
    required: [':root[data-theme="light"]'],
  },
  {
    file: "app/globals.css",
    label: "Shell interno possui cobertura clara",
    required: [
      ':root[data-theme="light"] .atlas-app-shell',
      ':root[data-theme="light"] .atlas-sidebar',
      ':root[data-theme="light"] .atlas-app-topbar',
    ],
  },
  {
    file: "app/globals.css",
    label: "Kanban possui camada clara própria",
    required: [
      ".atlas-kanban-readiness",
      ':root[data-theme="light"] .atlas-pipeline-page',
      ':root[data-theme="light"] .atlas-pipeline-hero',
      ':root[data-theme="light"] .atlas-pipeline-column',
      ':root[data-theme="light"] .atlas-pipeline-lead',
    ],
  },
  {
    file: "components/atlas/theme-toggle.tsx",
    label: "Toggle persiste tema do Atlas",
    required: ["atlas:theme", "data-theme", "localStorage"],
  },
  {
    file: "app/layout.tsx",
    label: "Layout aplica tema antes do primeiro paint",
    required: ["atlas:theme", "document.documentElement.setAttribute"],
  },
  {
    file: "app/(crm)/pipeline/page.tsx",
    label: "Pipeline real usa a nova fundação do Kanban",
    required: [
      "atlas-pipeline-page",
      "atlas-kanban-readiness",
      "Kanban de execução",
      "Fila de execução",
    ],
  },
];

const failures = [];

for (const check of checks) {
  const content = read(check.file);
  const missing = check.required.filter((needle) => !content.includes(needle));
  if (missing.length > 0) {
    failures.push({ ...check, missing });
  }
}

if (failures.length > 0) {
  console.error("❌ Fundação do layout claro incompleta:");
  for (const failure of failures) {
    console.error(`\n- ${failure.label} (${failure.file})`);
    for (const missing of failure.missing) {
      console.error(`  ausente: ${missing}`);
    }
  }
  process.exit(1);
}

console.log("✅ Fundação do layout claro validada: shell, toggle e Kanban conectados.");
