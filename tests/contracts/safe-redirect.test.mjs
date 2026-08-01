import assert from "node:assert/strict";
import test from "node:test";

import { safeAuthDestination } from "../../lib/auth/safe-redirect.ts";

test("aceita somente destinos internos seguros", () => {
  assert.equal(safeAuthDestination("/dashboard?period=30d"), "/dashboard?period=30d");
  assert.equal(safeAuthDestination("/leads/abc"), "/leads/abc");
});

test("bloqueia redirecionamentos externos e caminhos de autenticação", () => {
  assert.equal(safeAuthDestination("https://evil.example"), "/dashboard");
  assert.equal(safeAuthDestination("//evil.example"), "/dashboard");
  assert.equal(safeAuthDestination("/\\evil.example"), "/dashboard");
  assert.equal(safeAuthDestination("/login"), "/dashboard");
  assert.equal(safeAuthDestination("/forgot-password?next=/dashboard"), "/dashboard");
});

test("respeita fallback explícito", () => {
  assert.equal(safeAuthDestination(null, "/command-center"), "/command-center");
  assert.equal(safeAuthDestination("/auth/callback", "/command-center"), "/command-center");
});
