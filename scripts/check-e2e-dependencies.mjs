import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const failures = [];

let playwright;
try {
  require.resolve("@playwright/test/package.json");
  playwright = require("playwright");
} catch {
  failures.push(
    "@playwright/test não está instalado como dependência de desenvolvimento",
  );
}

if (playwright) {
  const chromiumPath =
    process.env.ATLAS_E2E_CHROMIUM_PATH?.trim() ||
    playwright.chromium.executablePath();
  if (!existsSync(chromiumPath)) {
    failures.push(
      process.env.ATLAS_E2E_CHROMIUM_PATH
        ? "ATLAS_E2E_CHROMIUM_PATH não aponta para um executável existente"
        : "o navegador Chromium do Playwright ainda não foi instalado",
    );
  }
}

if (failures.length) {
  console.error("ATLAS E2E DEPENDENCIES: instalação pendente.");
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error(
    "- quando o registry estiver disponível: npm install --save-dev @playwright/test && npx playwright install chromium",
  );
  console.error(
    "- alternativa: informe ATLAS_E2E_CHROMIUM_PATH com o caminho de um Chromium compatível já instalado",
  );
  process.exit(1);
}

console.log(
  "ATLAS E2E DEPENDENCIES: Playwright e Chromium disponíveis no executor.",
);
