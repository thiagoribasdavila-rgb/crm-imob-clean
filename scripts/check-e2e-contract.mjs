import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "playwright.config.mjs",
  "tests/e2e/login.spec.mjs",
  "tests/e2e/authenticated-journeys.spec.mjs",
];
const failures = [];

for (const path of requiredFiles) {
  if (!existsSync(path)) failures.push(`${path} ausente`);
}

function requireMarkers(path, markers) {
  if (!existsSync(path)) return;
  const source = readFileSync(path, "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`${path}: contrato ${marker} ausente`);
  }
}

requireMarkers("playwright.config.mjs", [
  "fullyParallel: false",
  "workers: 1",
  'trace: "retain-on-failure"',
  'screenshot: "only-on-failure"',
]);
requireMarkers("tests/e2e/login.spec.mjs", [
  "formulário público de acesso",
  "Esqueci minha senha",
]);
requireMarkers("tests/e2e/authenticated-journeys.spec.mjs", [
  "ATLAS_E2E_ADMIN_EMAIL",
  "ATLAS_E2E_DIRECTOR_EMAIL",
  "ATLAS_E2E_MANAGER_EMAIL",
  "ATLAS_E2E_BROKER_EMAIL",
  "/api/v1/auth/me",
  "TECHNICAL_ERROR_PATTERNS",
]);

if (failures.length) {
  console.error("ATLAS E2E CONTRACT: bloqueado.");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "ATLAS E2E CONTRACT: configuração, login público e quatro jornadas autenticadas presentes.",
);
