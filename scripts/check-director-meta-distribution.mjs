import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), "utf8");
const migration = read("supabase/migrations/20260805130000_director_meta_distribution.sql");
const api = read("app/api/v1/crm/distribution/route.ts");
const page = read("app/(crm)/distribution/page.tsx");
const roster = read("components/distribution/ProjectBrokerRoster.tsx");
const metaRoster = read("components/distribution/MetaSourceRoster.tsx");

for (const fragment of [
  "create table if not exists public.lead_source_distribution_members",
  "alter table public.lead_source_distribution_members enable row level security",
  "create or replace function public.configure_source_distribution_members",
  "actor_role is distinct from 'director'",
  "source_key in ('meta')",
  "assigned_to is null",
  "lead_source_distribution_members",
  "grant execute on function public.configure_source_distribution_members",
  "grant execute on function public.distribute_project_leads_v3",
]) {
  assert.ok(migration.includes(fragment), `Migration must contain: ${fragment}`);
}

for (const fragment of [
  'role !== "director"',
  "configure_source_members",
  "configure_source_distribution_members",
  "lead_source_distribution_members",
  "A fila comercial é configurada somente pela diretoria.",
]) {
  assert.ok(api.includes(fragment), `Distribution API must contain: ${fragment}`);
}

for (const fragment of [
  "MetaSourceRoster",
  "canManageDistribution",
  "diego|luciano",
]) {
  assert.ok(page.includes(fragment), `Distribution page must contain: ${fragment}`);
}

for (const fragment of ["developerFilter", "1. Incorporadora", "visibleProjects"]) {
  assert.ok(roster.includes(fragment), `Project roster must contain: ${fragment}`);
}

for (const fragment of [
  "Roleta exclusiva de leads da Meta",
  "Salvar roleta Meta",
  "Alterações salvas",
  "MetaRosterMember",
  "Peso de",
  "!dirty",
]) {
  assert.ok(metaRoster.includes(fragment), `Meta roster must contain: ${fragment}`);
}

console.log("Director Meta distribution contract passed.");
