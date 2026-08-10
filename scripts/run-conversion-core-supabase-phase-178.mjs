import { buildMigrationCollisionDossier } from "../lib/testing/supabase-migration-collision-dossier.mjs";

const dossier = buildMigrationCollisionDossier(process.cwd());
console.log(JSON.stringify({ phase: 178, mode: "read_only_static_assessment", ...dossier }, null, 2));
if (!dossier.resolved) {
  console.error("[phase-178] Bloqueado com segurança: histórico remoto somente leitura ainda é necessário.");
}

