/**
 * Política de governança — aprimora o "autônomo sob supervisão" de BINÁRIO
 * (propõe/aprova) para RISCO-CONSCIENTE, GRADUADO e MENSURÁVEL.
 *
 * Três peças puras:
 *  1) classifyRisk — todo movimento ganha nível de risco, reversibilidade e
 *     raio de impacto (a Caixa passa a ordenar/colorir por risco).
 *  2) autonomyDecision — dado o risco + o histórico da organização, decide se o
 *     movimento é ELEGÍVEL a auto-aprovação com janela de desfazer, ou exige
 *     humano. Conservador por padrão: sem histórico → sempre humano.
 *  3) governanceHealth — mede se a governança está no ponto (carimbando?
 *     gargalando? saudável?) a partir do histórico de decisões.
 *
 * Invariante preservada: auto-aprovação SÓ para o que é reversível, de baixo
 * risco e raio pequeno, e mesmo assim com janela de desfazer — a IA nunca
 * ganha poder sobre o irreversível ou o que gasta dinheiro sem humano.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// 1) Classificação de risco
// ---------------------------------------------------------------------------

export type RiskInput = {
  kind: string;
  reversible?: boolean;       // pode ser desfeito? (pausar sim; criar campanha não trivialmente)
  amountBrl?: number;         // dinheiro movimentado (verba, orçamento)
  scope?: "individual" | "campanha" | "conta" | "organizacao";
  externalSend?: boolean;     // envia mensagem/anúncio ao mundo (efeito público)
  activates?: boolean;        // liga algo que passa a gastar
};

export type RiskClass = {
  riskTier: "baixo" | "medio" | "alto";
  reversible: boolean;
  blastRadius: "individual" | "campanha" | "conta" | "organizacao";
  score: number; // 0-100, quanto maior mais arriscado
  drivers: string[];
};

const BLAST_WEIGHT: Record<RiskClass["blastRadius"], number> = {
  individual: 5, campanha: 15, conta: 35, organizacao: 60,
};

/** Classifica o risco de um movimento — determinístico. */
export function classifyRisk(input: RiskInput): RiskClass {
  const reversible = input.reversible !== false;
  const blastRadius = input.scope ?? "campanha";
  const drivers: string[] = [];
  let score = BLAST_WEIGHT[blastRadius];
  drivers.push(`raio ${blastRadius}`);

  if (!reversible) { score += 40; drivers.push("irreversível"); }
  if (input.activates) { score += 30; drivers.push("ativa gasto"); }
  if (input.externalSend) { score += 20; drivers.push("efeito externo (envio/veiculação)"); }
  const amount = Number(input.amountBrl) || 0;
  if (amount > 0) {
    const moneyScore = Math.min(30, Math.round(amount / 100)); // R$ 3.000 → +30
    score += moneyScore; drivers.push(`R$ ${r2(amount)} em jogo`);
  }
  score = Math.min(100, score);

  const riskTier: RiskClass["riskTier"] = score >= 55 ? "alto" : score >= 25 ? "medio" : "baixo";
  return { riskTier, reversible, blastRadius, score, drivers };
}

// ---------------------------------------------------------------------------
// 2) Autonomia graduada
// ---------------------------------------------------------------------------

export type TrackRecord = {
  moveKind: string;
  approved: number;   // quantas vezes esse tipo foi aprovado pelo humano
  rejected: number;   // quantas rejeitado
  autoUndone: number; // quantas auto-aprovações foram desfeitas na janela (sinal ruim)
};

export type AutonomyDecision = {
  mode: "auto_com_desfazer" | "requer_humano";
  undoWindowMin: number;
  reason: string;
};

export type AutonomyOpts = {
  /** mínimo de aprovações humanas do tipo antes de confiar. */
  minTrackApprovals?: number;
  /** taxa de rejeição acima da qual nunca automatiza. */
  maxRejectionRate?: number;
  /** janela de desfazer (min) da auto-aprovação. */
  undoWindowMin?: number;
  /** trava mestra: auto-aprovação habilitada pela organização? (default false — seguro). */
  autonomyEnabled?: boolean;
};

/**
 * Decide se um movimento pode ser auto-aprovado (com janela de desfazer) ou
 * exige humano. Padrão CONSERVADOR: só automatiza o reversível, de baixo risco,
 * raio pequeno, com histórico bom — e só se a organização LIGOU a autonomia.
 */
export function autonomyDecision(risk: RiskClass, track: TrackRecord | null, opts: AutonomyOpts = {}): AutonomyDecision {
  const minApprovals = opts.minTrackApprovals ?? 8;
  const maxRejection = opts.maxRejectionRate ?? 0.15;
  const undoWindowMin = opts.undoWindowMin ?? 60;
  const human = (reason: string): AutonomyDecision => ({ mode: "requer_humano", undoWindowMin: 0, reason });

  if (opts.autonomyEnabled !== true) return human("Autonomia graduada desligada — toda ação requer aprovação humana.");
  if (risk.riskTier !== "baixo") return human(`Risco ${risk.riskTier} — só o diretor decide (${risk.drivers.join(", ")}).`);
  if (!risk.reversible) return human("Ação irreversível — sempre humana.");
  if (risk.blastRadius === "conta" || risk.blastRadius === "organizacao") return human("Raio de impacto grande — sempre humana.");
  if (!track) return human("Sem histórico deste tipo — humano decide até criar confiança.");
  if (track.approved < minApprovals) return human(`Só ${track.approved}/${minApprovals} aprovações humanas — ainda construindo confiança.`);
  const total = track.approved + track.rejected;
  const rejectionRate = total > 0 ? track.rejected / total : 1;
  if (rejectionRate > maxRejection) return human(`Taxa de rejeição ${Math.round(rejectionRate * 100)}% alta — o humano ainda discorda demais.`);
  if (track.autoUndone > 0) return human("Uma auto-aprovação recente foi desfeita — volta a exigir humano.");

  return {
    mode: "auto_com_desfazer", undoWindowMin,
    reason: `Reversível, risco baixo, ${track.approved} aprovações limpas — auto-aprovado com ${undoWindowMin}min para desfazer. A liderança audita, não carimba.`,
  };
}

// ---------------------------------------------------------------------------
// 3) Saúde da governança
// ---------------------------------------------------------------------------

export type DecisionRecord = {
  createdAtMs: number;
  decidedAtMs: number | null; // null = ainda pendente
  decision: "approved" | "rejected" | "expired" | "pending";
};

export type GovernanceHealth = {
  samples: number;
  approvedRate: number;
  rejectionRate: number;
  expirationRate: number;
  /** aprovadas rápido demais para ter lido (carimbo). */
  rubberStampRate: number;
  medianLatencyMin: number | null;
  verdict: "saudavel" | "carimbando" | "gargalo" | "frouxa" | "sem_dados";
  notes: string[];
};

/** Mede se a governança está no ponto — nem burocrática, nem carimbo. */
export function governanceHealth(records: DecisionRecord[], opts: { rubberStampMs?: number } = {}): GovernanceHealth {
  const rubberMs = opts.rubberStampMs ?? 5_000; // aprovar em <5s = não leu
  const decided = records.filter((r) => r.decision !== "pending" && r.decidedAtMs != null);
  const n = decided.length;
  if (n === 0) return { samples: 0, approvedRate: 0, rejectionRate: 0, expirationRate: 0, rubberStampRate: 0, medianLatencyMin: null, verdict: "sem_dados", notes: ["Ainda sem histórico de decisões."] };

  const approved = decided.filter((r) => r.decision === "approved");
  const rejected = decided.filter((r) => r.decision === "rejected");
  const expired = decided.filter((r) => r.decision === "expired");
  const rubber = approved.filter((r) => (r.decidedAtMs as number) - r.createdAtMs < rubberMs);
  const latencies = decided
    .filter((r) => r.decision === "approved" || r.decision === "rejected")
    .map((r) => ((r.decidedAtMs as number) - r.createdAtMs) / 60_000)
    .sort((a, b) => a - b);
  const medianLatencyMin = latencies.length ? r2(latencies[Math.floor(latencies.length / 2)]) : null;

  const approvedRate = r2(approved.length / n);
  const rejectionRate = r2(rejected.length / n);
  const expirationRate = r2(expired.length / n);
  const rubberStampRate = approved.length ? r2(rubber.length / approved.length) : 0;

  const notes: string[] = [];
  let verdict: GovernanceHealth["verdict"] = "saudavel";
  if (rubberStampRate > 0.5) { verdict = "carimbando"; notes.push(`${Math.round(rubberStampRate * 100)}% das aprovações em <5s — provável carimbo sem leitura.`); }
  else if (expirationRate > 0.25 || (medianLatencyMin != null && medianLatencyMin > 24 * 60)) { verdict = "gargalo"; notes.push("Muita proposta expira ou demora — a Caixa está travando a operação."); }
  else if (rejectionRate < 0.03 && rubberStampRate > 0.3) { verdict = "frouxa"; notes.push("Quase nada é rejeitado e muita coisa passa rápido — a supervisão pode estar frouxa."); }
  else notes.push("Rejeição e latência em faixa saudável — a supervisão está no ponto.");

  return { samples: n, approvedRate, rejectionRate, expirationRate, rubberStampRate, medianLatencyMin, verdict, notes };
}
