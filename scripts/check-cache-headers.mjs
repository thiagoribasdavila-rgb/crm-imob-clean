/**
 * Check adversarial do helper lib/api/cache-headers.ts (Track C — performance).
 *
 * Garante o CONTRATO do Cache-Control de leitura autenticada:
 *  - sempre `private` (nunca compartilhado: dado por org/usuário);
 *  - formato exato `private, max-age=N[, stale-while-revalidate=M]`;
 *  - TTLs viram inteiros >= 0; entrada inválida/<=0 não vira número inventado;
 *  - maxAge 0 → `private, no-store` (sem TTL não cacheia);
 *  - o helper é puro (sem fetch/Date.now/random no núcleo);
 *  - o helper é aplicado nas rotas de leitura pesadas (integração).
 *
 * Falha → failures[] + exit 1.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

const failures = [];
const eq = (label, got, want) => {
  if (got !== want) failures.push(`${label}: esperado ${JSON.stringify(want)}, veio ${JSON.stringify(got)}`);
};
const truthy = (label, cond) => {
  if (!cond) failures.push(label);
};

const mod = await import(pathToFileURL(resolve(root, "lib/api/cache-headers.ts")).href).catch((e) => {
  failures.push(`import falhou (tsx/loader?): ${e?.message ?? e}`);
  return null;
});

if (mod && typeof mod.cacheHeaders === "function") {
  const cacheHeaders = mod.cacheHeaders;

  // 1) caso base: maxAge + swr → formato completo, privado.
  eq("caso base 60/120", cacheHeaders({ maxAge: 60, swr: 120 })["Cache-Control"], "private, max-age=60, stale-while-revalidate=120");

  // 2) TTL curto sem swr → só max-age.
  eq("sem swr", cacheHeaders({ maxAge: 30 })["Cache-Control"], "private, max-age=30");

  // 3) swr explícito 0 → tratado como ausente.
  eq("swr=0 omitido", cacheHeaders({ maxAge: 45, swr: 0 })["Cache-Control"], "private, max-age=45");

  // 4) maxAge=0 → private, no-store (sem TTL não cacheia).
  eq("maxAge=0 no-store", cacheHeaders({ maxAge: 0, swr: 120 })["Cache-Control"], "private, no-store");

  // 5) maxAge negativo → clamp para no-store (não inventa número).
  eq("maxAge negativo", cacheHeaders({ maxAge: -10, swr: 120 })["Cache-Control"], "private, no-store");

  // 6) fracionários viram inteiro (floor), sem casas decimais no header.
  eq("maxAge fracionário", cacheHeaders({ maxAge: 59.9, swr: 121.7 })["Cache-Control"], "private, max-age=59, stale-while-revalidate=121");

  // 7) swr negativo → ignorado (só max-age).
  eq("swr negativo", cacheHeaders({ maxAge: 60, swr: -5 })["Cache-Control"], "private, max-age=60");

  // 8) NaN em maxAge → no-store (entrada inválida não vira número).
  eq("maxAge NaN", cacheHeaders({ maxAge: Number.NaN, swr: 100 })["Cache-Control"], "private, no-store");

  // 9) Infinity em maxAge → no-store (não é TTL válido).
  eq("maxAge Infinity", cacheHeaders({ maxAge: Number.POSITIVE_INFINITY })["Cache-Control"], "private, no-store");

  // 10) Infinity em swr → ignorado, mantém max-age válido.
  eq("swr Infinity", cacheHeaders({ maxAge: 60, swr: Number.POSITIVE_INFINITY })["Cache-Control"], "private, max-age=60");

  // 11) SEMPRE começa com "private, " — nunca cache compartilhado.
  for (const input of [{ maxAge: 1, swr: 1 }, { maxAge: 5 }, { maxAge: 0 }, { maxAge: -1 }, { maxAge: Number.NaN }]) {
    const cc = cacheHeaders(input)["Cache-Control"];
    truthy(`private obrigatório em ${JSON.stringify(input)} (veio: ${cc})`, cc.startsWith("private, "));
    truthy(`nunca public em ${JSON.stringify(input)}`, !cc.includes("public"));
  }

  // 12) retorno é objeto com a única chave "Cache-Control".
  const keys = Object.keys(cacheHeaders({ maxAge: 60, swr: 120 }));
  eq("chave única", keys.length, 1);
  eq("nome da chave", keys[0], "Cache-Control");

  // 13) determinismo/pureza: mesma entrada → mesma saída em chamadas repetidas.
  const a = cacheHeaders({ maxAge: 60, swr: 120 })["Cache-Control"];
  const b = cacheHeaders({ maxAge: 60, swr: 120 })["Cache-Control"];
  eq("determinístico", a, b);
} else if (mod) {
  failures.push("cacheHeaders não é exportado como função");
}

// 14) pureza estática do núcleo: sem fetch/Date.now/random no helper.
const helperSrc = read("lib/api/cache-headers.ts");
for (const forbidden of ["Date.now", "Math.random", "fetch(", "new Date("]) {
  if (helperSrc.includes(forbidden)) failures.push(`núcleo impuro: helper usa ${forbidden}`);
}

// 15) integração: as rotas de leitura pesada nomeadas aplicam caching privado.
const routeChecks = [
  ["app/api/v1/marketing/cost-report/route.ts", "cacheHeaders("],
  ["app/api/v1/marketing/andromeda/route.ts", "cacheHeaders("],
  ["app/api/v1/ai/proactive/route.ts", "cacheHeaders("],
  ["app/api/v1/ai/director-briefing/route.ts", "cacheHeaders("],
  ["app/api/v1/analytics/team-sla/route.ts", "cacheHeaders("],
  ["app/api/v1/analytics/pipeline-aging/route.ts", "private, max-age="],
  ["app/api/v1/analytics/funnel-velocity/route.ts", "private, max-age="],
];
for (const [file, marker] of routeChecks) {
  let src = "";
  try { src = read(file); } catch { failures.push(`rota ausente: ${file}`); continue; }
  if (!src.includes(marker)) failures.push(`${file}: cache privado não aplicado (falta ${marker})`);
}

// 16) core.ts respeita Cache-Control fornecido (não força no-store por cima).
const coreSrc = read("lib/api/core.ts");
if (!coreSrc.includes('if (!headers.has("Cache-Control"))')) {
  failures.push("core.ts: responseHeaders ainda força Cache-Control (helper seria inerte)");
}

if (failures.length) {
  console.error("CACHE HEADERS (Track C): REPROVADO");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log("CACHE HEADERS (Track C): aprovado — Cache-Control privado, formato e TTLs validados; núcleo puro; rotas de leitura aplicam caching.");
