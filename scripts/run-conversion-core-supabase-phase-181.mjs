import {
  buildMigrationCollisionLineage,
  loadHistoricalCollisionSnapshot,
} from "../lib/testing/supabase-migration-collision-lineage.mjs";

const root = process.cwd();
const lineage = buildMigrationCollisionLineage({
  root,
  historicalSnapshot: loadHistoricalCollisionSnapshot(root),
});

console.log(JSON.stringify({ phase: 181, mode: "local_collision_lineage_dossier", ...lineage }, null, 2));
console.error(
  "[phase-181] As seis linhagens foram catalogadas; o histórico permanece apenas referencial e qualquer ação continua bloqueada.",
);
