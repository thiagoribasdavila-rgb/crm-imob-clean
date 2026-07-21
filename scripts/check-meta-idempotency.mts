import { findPriorExecution, recordExecution, tryReserve, releaseReservation, IDEMPOTENCY_TTL_MS } from "/Users/thiagoribasdavila/atlas-v3/lib/meta/marketing/idempotency.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); };

// sem banco (admin null) — camada de memória protege o caso comum
// 1. chave nova → sem execução anterior
t("chave nova → null", (await findPriorExecution(null, "k1")) === null);
// 2. grava e recupera
{
  await recordExecution(null, "k2", "org", { ids: ["1", "2"] });
  const prior = await findPriorExecution(null, "k2") as { ids: string[] };
  t("grava e recupera o resultado", prior?.ids?.join(",") === "1,2");
}
// 3. reserva bloqueia segunda reserva concorrente
{
  t("primeira reserva ok", tryReserve("k3") === true);
  t("segunda reserva barrada", tryReserve("k3") === false);
}
// 4. reserva não vira execução → release libera
{
  tryReserve("k4");
  releaseReservation("k4");
  t("após release, pode reservar de novo", tryReserve("k4") === true);
}
// 5. release NÃO apaga uma execução real (só reservas)
{
  await recordExecution(null, "k5", "org", { real: true });
  releaseReservation("k5"); // não deve apagar — não é reserva
  t("release preserva execução real", (await findPriorExecution(null, "k5")) !== null);
}
// 6. reserva depois vira execução (record sobrescreve a reserva)
{
  tryReserve("k6");
  await recordExecution(null, "k6", "org", { ids: ["x"] });
  const p = await findPriorExecution(null, "k6") as { ids?: string[] };
  t("record sobrescreve a reserva", p?.ids?.[0] === "x");
  t("execução gravada barra nova reserva", tryReserve("k6") === false);
}
// 7. banco que ERRA (throw) não quebra — degrada para memória
{
  const adminThrow = { from() { throw new Error("sem tabela"); } } as unknown as Parameters<typeof findPriorExecution>[0];
  let ok = true;
  try { await findPriorExecution(adminThrow, "k7"); await recordExecution(adminThrow, "k7", "org", { a: 1 }); } catch { ok = false; }
  t("erro de banco não propaga (degrada p/ memória)", ok);
  t("memória ainda guardou", (await findPriorExecution(null, "k7")) !== null);
}
// 8. banco com resultado → reidrata memória
{
  const adminData = {
    from() { return { select() { return { eq() { return { maybeSingle: async () => ({ data: { result: { fromDb: true } }, error: null }) }; } }; } }; },
  } as unknown as Parameters<typeof findPriorExecution>[0];
  const p = await findPriorExecution(adminData, "k8-db") as { fromDb?: boolean };
  t("lê do banco quando memória não tem", p?.fromDb === true);
  t("TTL é positivo e razoável", IDEMPOTENCY_TTL_MS > 0 && IDEMPOTENCY_TTL_MS <= 60 * 60_000);
}

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
