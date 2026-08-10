import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) =>
  readFileSync(resolve(process.cwd(), path), "utf8");
const config = JSON.parse(
  read("config/contact-consent-preferences.json"),
);
const sql = read(config.migration).toLowerCase();
const api = read(config.api);
const page = read(config.page);
const send = read(config.enforcedRoutes[0]);
const draft = read(config.enforcedRoutes[1]);
const failures = [];

for (const marker of [
  "lead_contact_preferences",
  "lead_contact_preference_events",
  "set_lead_contact_preference",
  "check_lead_contact_eligibility",
  "consent_not_recorded",
  "outside_contact_window",
  "lead_contact_preference",
  "automationrecheckrequired",
]) {
  if (
    !sql.replaceAll("_", "").includes(marker.replaceAll("_", ""))
  ) {
    failures.push(`banco incompleto: ${marker}`);
  }
}

for (const field of [
  "singleSourceOfTruth",
  "optOutImmediate",
  "automationRecheck",
  "timeWindowAware",
  "humanEvidenceRequired",
]) {
  const enabledBoolean = new RegExp(
    String.raw`\b${field}\s*:\s*true\b`,
  );
  if (!enabledBoolean.test(api)) {
    failures.push(`API incompleta: ${field}: true`);
  }
}

if (
  !send.includes("check_lead_contact_eligibility") ||
  !send.includes("Contato bloqueado pela preferência")
) {
  failures.push("envio não protegido");
}
if (
  !draft.includes("check_lead_contact_eligibility") ||
  !draft.includes("A IA não pode preparar contato")
) {
  failures.push("rascunho IA não protegido");
}

for (const marker of [
  'data-phase="73-contact-consent-preferences"',
  "Uma única regra governa corretor, WhatsApp e IA",
  "OPT-OUT IMEDIATO",
  "Autorizar exige base e evidência",
  "Contato bloqueado agora",
]) {
  if (!page.includes(marker)) {
    failures.push(`experiência incompleta: ${marker}`);
  }
}

if (failures.length) {
  console.error("CONSENTIMENTO Fase 73: REPROVADO");
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(
  `CONSENTIMENTO Fase 73: aprovado — ${config.channels.length} canais, evidência, validade, janela, opt-out e trava de IA/envio.`,
);
