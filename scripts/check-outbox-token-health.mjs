/**
 * Check adversarial do classificador de falha do outbox (TRACK B).
 *
 * Invariante central: erro de CREDENCIAL (Graph 190/102/463/467) →
 * 'token_unhealthy' (não consome tentativa, não vai a dead_letter); qualquer
 * outra coisa → 'data' (consome tentativa como antes). Um número solto na
 * mensagem NÃO pode ser confundido com código de erro.
 *
 * Rodar: node --experimental-strip-types scripts/check-outbox-token-health.mjs
 *
 * O repo usa moduleResolution 'bundler' (imports relativos SEM extensão). O
 * loader ESM do Node exige extensão, então registramos um resolve hook que
 * completa `.ts` para specifiers relativos — sem tocar o código-fonte.
 */

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const EXTS = ['.ts','.mts','.cts','.js','.mjs','.cjs','.tsx','.json','.node'];
      export async function resolve(specifier, context, next) {
        const rel = specifier.startsWith('./') || specifier.startsWith('../');
        const hasExt = EXTS.some((e) => specifier.endsWith(e));
        if (rel && !hasExt) {
          try { return await next(specifier + '.ts', context); } catch {}
        }
        return next(specifier, context);
      }
    `),
  pathToFileURL("./").href,
);

const { classifyOutboxFailure, extractGraphCodes } = await import(
  "../lib/meta/outbox-failure.ts"
);
const { describeMetaGraphFailure } = await import("../lib/meta/graph.ts");

const failures = [];
let passed = 0;
const t = (name, ok) => {
  if (ok) passed += 1;
  else failures.push(name);
  console.log(`${ok ? "✅" : "❌"} ${name}`);
};

// Constrói a mensagem exatamente como o route a produz (describeMetaGraphFailure).
const graphMsg = (status, code, subcode) =>
  describeMetaGraphFailure(status, {
    error: { message: "erro simulado", code, error_subcode: subcode },
  });

// 1. Token expirado clássico: code 190 → token_unhealthy
t("code 190 → token_unhealthy", classifyOutboxFailure({ message: graphMsg(400, 190) }) === "token_unhealthy");

// 2. Sessão invalidada: subcode 463 (com code 190) → token_unhealthy
t("190/463 → token_unhealthy", classifyOutboxFailure({ message: graphMsg(400, 190, 463) }) === "token_unhealthy");

// 3. Sessão expirada: subcode 467 → token_unhealthy
t("190/467 → token_unhealthy", classifyOutboxFailure({ message: graphMsg(400, 190, 467) }) === "token_unhealthy");

// 4. code 102 (sessão) também é credencial → token_unhealthy
t("code 102 → token_unhealthy", classifyOutboxFailure({ message: graphMsg(401, 102) }) === "token_unhealthy");

// 5. Parâmetro inválido (code 100) é DADO → data (continua consumindo tentativa)
t("code 100 → data", classifyOutboxFailure({ message: graphMsg(400, 100) }) === "data");

// 6. Rate limit (code 4) NÃO é credencial → data (preserva comportamento antigo)
t("code 4 (rate limit) → data", classifyOutboxFailure({ message: graphMsg(400, 4) }) === "data");

// 7. Permissão faltando (code 10) → data (não é token expirado)
t("code 10 (permission) → data", classifyOutboxFailure({ message: graphMsg(403, 10) }) === "data");

// 8. Erro de negócio sem envelope Graph → data
t("mensagem sem código → data", classifyOutboxFailure({ message: "Mensagem não encontrada." }) === "data");

// 9. Mensagem vazia → data
t("mensagem vazia → data", classifyOutboxFailure({ message: "" }) === "data");

// 10. Input estruturado: code 190 sem message → token_unhealthy
t("struct code 190 → token_unhealthy", classifyOutboxFailure({ code: 190 }) === "token_unhealthy");

// 11. Input estruturado: subcode 463 sem code → token_unhealthy
t("struct subcode 463 → token_unhealthy", classifyOutboxFailure({ subcode: 463 }) === "token_unhealthy");

// 12. Input estruturado: code 100 → data
t("struct code 100 → data", classifyOutboxFailure({ code: 100 }) === "data");

// 13. Sem nenhum sinal (objeto vazio) → data
t("input vazio → data", classifyOutboxFailure({}) === "data");

// 14. ARMADILHA: número 190 solto no texto (não é [code ...]) → data
t("'190' solto no texto não vira token", classifyOutboxFailure({ message: "Timeout após 190 segundos no lead 4671." }) === "data");

// 15. ARMADILHA: '463' num id não pode virar credencial
t("'463' em id não vira token", classifyOutboxFailure({ message: "Lead 463190 sem telefone consentido." }) === "data");

// 16. extractGraphCodes lê code/subcode do colchete
{
  const parsed = extractGraphCodes("Meta Graph HTTP 400 [code 190/463]: token inválido");
  t("extractGraphCodes 190/463", parsed.code === 190 && parsed.subcode === 463);
}

// 17. extractGraphCodes sem subcode
{
  const parsed = extractGraphCodes("Meta Graph HTTP 400 [code 100]: parâmetro inválido");
  t("extractGraphCodes 100 sem subcode", parsed.code === 100 && parsed.subcode === null);
}

// 18. extractGraphCodes sem colchete → null/null (não inventa código)
{
  const parsed = extractGraphCodes("erro genérico 190 sem colchete");
  t("extractGraphCodes sem colchete → null", parsed.code === null && parsed.subcode === null);
}

// 19. Input estruturado tem prioridade sobre parse do texto
t("code explícito vence o texto", classifyOutboxFailure({ code: 100, message: graphMsg(400, 190) }) === "data");

// 20. Erro real de token do WhatsApp (mensagem realista) → token_unhealthy
t("token WhatsApp realista → token_unhealthy", classifyOutboxFailure({ message: graphMsg(190, 190, 463) }) === "token_unhealthy");

console.log(`\n${passed} passaram, ${failures.length} falharam.`);
if (failures.length > 0) {
  console.error("REPROVADO:\n" + failures.map((f) => `- ${f}`).join("\n"));
  process.exit(1);
}
console.log("Classificador de saúde de token do outbox: aprovado.");
