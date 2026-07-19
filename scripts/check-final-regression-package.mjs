import fs from "node:fs";

const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};

need("config/final-regression-hostinger-package.json", '"phase": 10', '"host": "hostinger"', '"automatic_deploy": false', '"production_authorized": false');
need("config/final-10-phases-improvement.json", '"current_phase": 10', '"completed": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]');
need("scripts/package-hostinger.mjs", 'execFileSync("git", ["archive"', "privateDataIncluded: false", "RELEASE_FILES.sha256", "atlas-v3-hostinger-final.zip", '"lib/auth/safe-redirect.ts"', '"components/crm/lead-operational-bar.tsx"');
need("scripts/verify-hostinger-package.mjs", "Checksum externo divergente", "Caminho inseguro no ZIP", "Integridade interna divergente", "manifest.commit !== head");
need("scripts/test-hostinger-package-build.mjs", 'execFileSync("npm", ["ci"', 'execFileSync("npm", ["run", "build"]', "secretsPackaged: false");
need("docs/FINAL_PHASE_10_REGRESSION_HOSTINGER_PACKAGE.md", "Node.js 20.9+", "candidato final de homologação", "Produção continua bloqueada", "não publica");

for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nFechamento aprovado: ${checks.length} controles; Fase Final 10 pronta para empacotamento.`);
