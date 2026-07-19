import fs from "node:fs";
const c = [];
const n = (f, ...ts) => {
  const s = fs.readFileSync(f, "utf8");
  for (const t of ts) c.push([`${f}: ${t}`, s.includes(t)]);
};
n(
  "scripts/package-hostinger.mjs",
  "RELEASE_FILES.sha256",
  "sourceTimestamp",
  "privateDataIncluded: false",
  "zipFiles.join",
);
n(
  "scripts/verify-hostinger-package.mjs",
  "Checksum externo divergente",
  "Caminho inseguro no ZIP",
  "Manifesto não corresponde",
  "Integridade interna divergente",
);
n(
  "scripts/smoke-hostinger-release.mjs",
  "/api/health",
  "/api/ready",
  "/forgot-password",
  "AbortSignal.timeout",
);
n(
  "config/final-hostinger-release.json",
  '"phase": 100',
  '"automatic_deploy": false',
  '"production_requires_director_go": true',
);
n(
  "docs/HOSTINGER_FINAL_RELEASE_PHASE_100.md",
  "Aceite obrigatório antes da produção",
  "Verificação do artefato",
  "Retorno seguro",
);
for (const [x, o] of c) console.log(`${o ? "✓" : "✗"} ${x}`);
if (c.some(([, o]) => !o)) process.exit(1);
console.log(
  `\nFase 100 aprovada: ${c.length} controles de fechamento e empacotamento.`,
);
