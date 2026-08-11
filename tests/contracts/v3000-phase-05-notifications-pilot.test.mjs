import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/(crm)/notifications/page.tsx", "utf8");
const surface = readFileSync(
  "components/atlas/notifications-v3000-surface.tsx",
  "utf8",
);
const api = readFileSync("app/api/v1/task-reminders/route.ts", "utf8");

test("piloto usa o template V3000 sem transformar a rota em Client Component", () => {
  assert.match(page, /<NotificationsProvider>/);
  assert.match(page, /<V3000PageTemplate/);
  assert.doesNotMatch(page, /^["']use client["'];/m);

  for (const slot of [
    "NotificationsFeedback",
    "NotificationsMetrics",
    "NotificationsPriority",
    "NotificationsWorkspace",
    "NotificationsRealtimeStatus",
    "NotificationsGovernance",
  ]) {
    assert.match(page, new RegExp(`<${slot}`));
  }
});

test("ilha cliente preserva autenticação, leitura e mutações reais", () => {
  assert.match(surface, /^["']use client["'];/m);
  assert.match(surface, /supabase\.auth\.getSession\(\)/);
  assert.match(surface, /fetch\("\/api\/v1\/task-reminders"/);
  assert.match(surface, /Authorization: `Bearer \$\{token\}`/);
  assert.match(surface, /cache: "no-store"/);
  assert.match(surface, /method: "PATCH"/);
  assert.match(surface, /action: "read" \| "dismiss"/);
  assert.match(surface, /JSON\.stringify\(\{ id, action \}\)/);
});

test("assinatura Realtime continua pessoal, acessível e recuperável", () => {
  for (const marker of [
    "postgres_changes",
    "task_reminders",
    "assigned_to=eq.",
    "SUBSCRIBED",
    "CHANNEL_ERROR",
    "TIMED_OUT",
    "removeChannel",
    "aria-live",
    "Atualizar",
  ]) {
    assert.ok(surface.includes(marker), `contrato Realtime ausente: ${marker}`);
  }

  assert.match(surface, /void load\(true\)/);
  assert.match(surface, /AtlasRecoverableError/);
  assert.match(surface, /AtlasSkeleton/);
  assert.match(surface, /AtlasEmpty/);
});

test("ações operacionais e navegação permanecem iguais ao módulo original", () => {
  assert.match(surface, /`\/leads\/\$\{task\.lead_id\}`/);
  assert.match(surface, /"\/tasks"/);
  assert.match(surface, /act\(reminder\.id, "read"\)/);
  assert.match(surface, /act\(reminder\.id, "dismiss"\)/);
  assert.match(surface, /data-v3000-pilot="notifications"/);
  assert.match(
    surface,
    /data-contract="FASE 45 · NOTIFICAÇÕES EM TEMPO REAL"/,
  );
});

test("API mantém autorização, tenant e responsabilidade individual", () => {
  assert.match(api, /requireAccessContext/);
  assert.match(api, /enforceRateLimit/);
  assert.match(
    api,
    /\.eq\("organization_id", identity\.access\.organization\.id\)/,
  );
  assert.match(api, /\.eq\("assigned_to", identity\.access\.profile\.id\)/);
  assert.match(api, /!\["read", "dismiss"\]\.includes\(action\)/);
});
