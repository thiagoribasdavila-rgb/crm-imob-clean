import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const evidenceContracts = [
  {
    label: "cadeia técnica F02–F16",
    path: "artifacts/runtime/human-gates/f02-f16-upstream-readiness-evidence.json",
    isReady: (value) => value?.ready === true,
  },
  {
    label: "cadeia de decisão F17–F21",
    path: "artifacts/runtime/human-gates/f17-f21-readiness-evidence.json",
    isReady: (value) => value?.ready === true,
  },
  {
    label: "ambiente de ensaio isolado F22",
    path: "artifacts/runtime/phase-022/environment-readiness-evidence.json",
    isReady: (value) =>
      value?.ready === true ||
      value?.readiness?.ready === true ||
      value?.gates?.ready === true,
  },
  {
    label: "dossiê sanitizado F23",
    path: "artifacts/runtime/phase-023/sanitized-homologation-evidence-dossier.json",
    isReady: (value) =>
      value?.decision?.ready_for_human_homologation_decision === true,
  },
  {
    label: "decisão humana final F24",
    path: "artifacts/runtime/phase-024/final-human-homologation-decision-evidence.json",
    isReady: (value) =>
      value?.decision?.approved === true ||
      value?.final_decision?.approved === true ||
      value?.ready === true,
  },
];

const pending = [];

for (const contract of evidenceContracts) {
  const absolutePath = resolve(process.cwd(), contract.path);
  if (!existsSync(absolutePath)) {
    pending.push({
      label: contract.label,
      path: contract.path,
      status: "evidência ausente",
    });
    continue;
  }

  try {
    const value = JSON.parse(readFileSync(absolutePath, "utf8"));
    if (!contract.isReady(value)) {
      pending.push({
        label: contract.label,
        path: contract.path,
        status: value.status || "não aprovada",
      });
    }
  } catch {
    pending.push({
      label: contract.label,
      path: contract.path,
      status: "evidência inválida",
    });
  }
}

if (pending.length) {
  console.error(
    "ATLAS RUNTIME EVIDENCE: homologação e decisão humana ainda pendentes.",
  );
  pending.forEach((item) =>
    console.error(`- ${item.label}: ${item.status} (${item.path})`),
  );
  process.exit(1);
}

console.log(
  "ATLAS RUNTIME EVIDENCE: cadeia técnica, ensaio, dossiê e decisão final aprovados.",
);
