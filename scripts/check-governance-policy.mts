import { classifyRisk, autonomyDecision, governanceHealth, type TrackRecord, type DecisionRecord } from "../lib/governance/policy.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); };

// ---- classifyRisk ----
t("pausar reversível campanha → baixo", classifyRisk({ kind: "pausar", reversible: true, scope: "campanha" }).riskTier === "baixo");
t("criar campanha irreversível → alto", classifyRisk({ kind: "criar", reversible: false, scope: "campanha", activates: false }).riskTier === "alto");
t("ativar (gasta) → sobe o risco", classifyRisk({ kind: "ativar", reversible: true, scope: "campanha", activates: true }).riskTier !== "baixo");
t("raio organização → alto blast", classifyRisk({ kind: "x", scope: "organizacao" }).blastRadius === "organizacao");
t("verba alta empurra o score", classifyRisk({ kind: "verba", reversible: true, scope: "campanha", amountBrl: 3000 }).score > classifyRisk({ kind: "verba", reversible: true, scope: "campanha", amountBrl: 100 }).score);
t("drivers explicam o porquê", classifyRisk({ kind: "x", reversible: false }).drivers.some((d) => d.includes("irreversível")));
t("individual reversível sem dinheiro → baixo", classifyRisk({ kind: "reagendar", reversible: true, scope: "individual" }).riskTier === "baixo");

// ---- autonomyDecision ----
const goodTrack: TrackRecord = { moveKind: "pausar", approved: 12, rejected: 1, autoUndone: 0 };
const lowRisk = classifyRisk({ kind: "pausar", reversible: true, scope: "campanha" });
const highRisk = classifyRisk({ kind: "criar", reversible: false, scope: "conta", activates: true });

t("autonomia DESLIGADA → sempre humano", autonomyDecision(lowRisk, goodTrack, { autonomyEnabled: false }).mode === "requer_humano");
t("ligada + baixo risco + bom histórico → auto", autonomyDecision(lowRisk, goodTrack, { autonomyEnabled: true }).mode === "auto_com_desfazer");
t("auto tem janela de desfazer > 0", autonomyDecision(lowRisk, goodTrack, { autonomyEnabled: true }).undoWindowMin > 0);
t("risco alto → humano mesmo com histórico", autonomyDecision(highRisk, { ...goodTrack, moveKind: "criar" }, { autonomyEnabled: true }).mode === "requer_humano");
t("sem histórico → humano", autonomyDecision(lowRisk, null, { autonomyEnabled: true }).mode === "requer_humano");
t("poucas aprovações → humano", autonomyDecision(lowRisk, { moveKind: "pausar", approved: 3, rejected: 0, autoUndone: 0 }, { autonomyEnabled: true }).mode === "requer_humano");
t("rejeição alta → humano", autonomyDecision(lowRisk, { moveKind: "pausar", approved: 10, rejected: 6, autoUndone: 0 }, { autonomyEnabled: true }).mode === "requer_humano");
t("auto-undo recente → volta a humano", autonomyDecision(lowRisk, { moveKind: "pausar", approved: 12, rejected: 0, autoUndone: 1 }, { autonomyEnabled: true }).mode === "requer_humano");
t("irreversível baixo-score → humano", autonomyDecision(classifyRisk({ kind: "x", reversible: false, scope: "individual" }), goodTrack, { autonomyEnabled: true }).mode === "requer_humano");

// ---- governanceHealth ----
const rec = (createdAgoMin: number, decidedAfterSec: number | null, decision: DecisionRecord["decision"]): DecisionRecord => {
  const created = 1_000_000_000_000 - createdAgoMin * 60_000;
  return { createdAtMs: created, decidedAtMs: decidedAfterSec == null ? null : created + decidedAfterSec * 1000, decision };
};
t("vazio → sem_dados", governanceHealth([]).verdict === "sem_dados");
{
  // 6 aprovadas em <5s = carimbo
  const carimbo = Array.from({ length: 6 }, () => rec(10, 2, "approved"));
  t("aprovações <5s → carimbando", governanceHealth(carimbo).verdict === "carimbando");
}
{
  // saudável: mix de aprovado/rejeitado com latência normal
  const saud = [rec(60, 300, "approved"), rec(60, 600, "approved"), rec(60, 400, "rejected"), rec(60, 500, "approved"), rec(60, 700, "rejected")];
  const h = governanceHealth(saud);
  t("mix normal → saudável", h.verdict === "saudavel" && h.rejectionRate > 0);
}
{
  // gargalo: muita expiração
  const garg = [rec(60, 300, "approved"), ...Array.from({ length: 4 }, () => rec(9999, null, "expired") as DecisionRecord)]
    .map((r) => r.decision === "expired" ? { ...r, decidedAtMs: r.createdAtMs + 99999999 } : r);
  t("muita expiração → gargalo", governanceHealth(garg as DecisionRecord[]).verdict === "gargalo");
}
{
  // latência mediana calculada
  const h = governanceHealth([rec(60, 60, "approved"), rec(60, 180, "approved"), rec(60, 300, "approved")]);
  t("mediana de latência em min", h.medianLatencyMin === 3);
}
t("pendentes não contam nas amostras", governanceHealth([rec(10, null, "pending"), rec(10, 300, "approved")]).samples === 1);

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
