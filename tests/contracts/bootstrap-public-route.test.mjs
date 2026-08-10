import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

import { bootstrapState } from "../../lib/bootstrap/policy.ts";

const root = resolve(import.meta.dirname, "../..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

globalThis.AsyncLocalStorage = AsyncLocalStorage;
const { unstable_doesMiddlewareMatch } = await import(
  "next/experimental/testing/server.js"
);

function proxyMatcher() {
  const proxy = read("proxy.ts");
  const match = proxy.match(/matcher:\s*\[\s*("(?:\\.|[^"])*")/s);
  assert.ok(match, "matcher do proxy não encontrado");
  return JSON.parse(match[1]);
}

test("setup público não passa pelo proxy de sessão", () => {
  const config = { matcher: [proxyMatcher()] };
  for (const url of ["/setup", "/setup/", "/setup?source=clean-install"]) {
    assert.equal(
      unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }),
      false,
      `${url} não pode executar o proxy autenticado`,
    );
  }
  assert.equal(
    unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "/dashboard",
    }),
    true,
    "rotas privadas continuam no proxy",
  );
});

test("zero base libera uma única ativação e qualquer perfil torna o bootstrap imutável", () => {
  assert.equal(bootstrapState(0), "available");
  assert.equal(bootstrapState(1), "locked");
  assert.equal(bootstrapState(10), "locked");
  assert.throws(() => bootstrapState(-1));
});

test("setup não depende de sessão e endpoint mantém os três controles obrigatórios", () => {
  const setupPage = read("app/(auth)/setup/page.tsx");
  const setupLayout = read("app/(auth)/setup/layout.tsx");
  const route = read("app/api/bootstrap/admin/route.ts");

  for (const forbidden of [
    "getUser(",
    "getClaims(",
    "requireAccessContext",
    "redirect(\"/login",
    "redirect('/login",
  ]) {
    assert.equal(
      setupPage.includes(forbidden) || setupLayout.includes(forbidden),
      false,
      `setup não pode depender de autenticação: ${forbidden}`,
    );
  }

  assert.match(route, /ATLAS_BOOTSTRAP_SECRET/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /atlas-bootstrap-diagnostic/);
  assert.match(route, /atlas-bootstrap-admin/);
  assert.match(route, /bootstrapState\(existingProfiles \?\? 0\) === "locked"/);
  assert.match(route, /updateUserById\(precreatedAuthUser\.id/);
  assert.match(setupLayout, /Instalação já concluída/);
});

test("setup e login apresentam a identidade Atlas One", () => {
  const sources = [
    read("app/(auth)/setup/page.tsx"),
    read("app/(auth)/setup/layout.tsx"),
    read("app/(auth)/login/page.tsx"),
  ].join("\n");

  assert.match(sources, /ATLAS/);
  assert.match(sources, /ONE/);
  assert.doesNotMatch(sources, />AI</);
  assert.doesNotMatch(sources, /Atlas OS/);
});
