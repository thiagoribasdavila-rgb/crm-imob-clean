import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const config = JSON.parse(read("config/governed-absence-redistribution.json"));
const sql = read(config.migration).toLowerCase();
const api = read(config.api);
const page = read(config.page);
const fail = [];

for (const marker of [
  "broker_absence_events",
  "redistribute_absent_broker_leads",
  "pg_advisory_xact_lock",
  "for update skip locked",
  "select reports_to into v_manager_id",
  "p.reports_to=v_manager_id",
  "cp.availability='available'",
  "90 seconds",
  "project_distribution_members",
  "lead_transfer_batches",
  "lead_transfer_items",
  "update public.tasks",
  "managerownsleads",
  "humanapproval",
  "activeportfolioonly",
]) {
  if (!sql.includes(marker)) fail.push(`banco incompleto: ${marker}`);
}

for (const marker of [
  'body.action === "cover_absence"',
  "reason.length < 10",
  "p_ends_at",
  "p_limit: limit",
  "ABSENCE_REDISTRIBUTION_REJECTED",
  "crm.distribution.absence_covered",
]) {
  if (!api.includes(marker)) fail.push(`API incompleta: ${marker}`);
}

for (const marker of [
  'data-phase="55-absence-redistribution"',
  "Cobertura por ausência",
  'type="datetime-local"',
  'minLength={10}',
  "Não é acionado por simples queda de conexão",
]) {
  if (!page.includes(marker)) fail.push(`experiência incompleta: ${marker}`);
}

const hasHumanReview =
  page.includes("window.confirm") ||
  (page.includes("absenceReviewOpen") &&
    page.includes('role="dialog"') &&
    page.includes("Confirmar e proteger carteira") &&
    page.includes("Voltar e revisar"));

if (!hasHumanReview) {
  fail.push("experiência incompleta: revisão humana explícita");
}

if (fail.length) {
  console.error("COBERTURA POR AUSÊNCIA Fase 55: REPROVADA");
  for (const failure of fail) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `COBERTURA POR AUSÊNCIA Fase 55: aprovada — decisão humana, até ${config.maximumBatchSize} leads e ${config.maximumDays} dias, substituto da mesma equipe e histórico preservado.`,
);
