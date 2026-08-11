import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const config = JSON.parse(read("config/realtime-task-notifications.json"));
const sql = read(config.migration);
const page = read(config.page);
const surface = config.surface ? read(config.surface) : "";
const notifications = `${page}\n${surface}`;
const topbar = read(config.topbar);
const failures = [];

for (const marker of [
  "replica identity full",
  "pg_publication_tables",
  "supabase_realtime",
  "add table public.task_reminders",
]) {
  if (!sql.includes(marker)) failures.push(`realtime incompleto: ${marker}`);
}

for (const marker of [
  "FASE 45 · NOTIFICAÇÕES EM TEMPO REAL",
  "postgres_changes",
  "assigned_to=eq.",
  "SUBSCRIBED",
  "CHANNEL_ERROR",
  "TIMED_OUT",
  "removeChannel",
  "aria-live",
  "Atualizar",
]) {
  if (!notifications.includes(marker)) {
    failures.push(`página ou superfície incompleta: ${marker}`);
  }
}

for (const marker of [
  "reminderCount",
  "task_reminders",
  "postgres_changes",
  "assigned_to=eq.",
  "read_at",
  "dismissed_at",
  "removeChannel",
  "99+",
]) {
  if (!topbar.includes(marker)) failures.push(`topbar incompleto: ${marker}`);
}

if (failures.length) {
  console.error("NOTIFICAÇÕES EM TEMPO REAL Fase 45: REPROVADO");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "NOTIFICAÇÕES EM TEMPO REAL Fase 45: aprovado — assinatura pessoal, contador real e fallback manual.",
);
