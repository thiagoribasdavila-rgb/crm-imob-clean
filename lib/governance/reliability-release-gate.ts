export type ReliabilityEvidence = {
  databaseOk: boolean;
  evidenceComplete: boolean;
  evidenceErrors: string[];
  databaseLatencyMs: number;
  memoryRssMb: number;
  failedOutbox: number;
  pendingOutbox: number;
  oldestPendingMinutes: number | null;
  unresolvedDeadLetters: number;
  aiP95LatencyMs: number | null;
  aiLatencySampleSize: number;
  aiLatencyPopulation: number;
  backupRestorePassed: boolean;
  https: boolean;
  cronConfigured: boolean;
  logsConfigured: boolean;
};

export function evaluateReliabilityGate(e: ReliabilityEvidence) {
  const controls = [
    { key: "evidence_completeness", severity: "critical", passed: e.evidenceComplete, evidence: e.evidenceComplete ? "complete" : e.evidenceErrors.join(",") },
    { key: "database", severity: "critical", passed: e.databaseOk && e.databaseLatencyMs <= 500, evidence: `${e.databaseLatencyMs}ms` },
    { key: "memory", severity: "high", passed: e.memoryRssMb <= 1024, evidence: `${e.memoryRssMb}MB` },
    { key: "failed_outbox", severity: "critical", passed: e.failedOutbox === 0, evidence: String(e.failedOutbox) },
    { key: "queue_age", severity: "high", passed: e.oldestPendingMinutes === null || e.oldestPendingMinutes <= 15, evidence: e.oldestPendingMinutes === null ? "empty" : `${e.oldestPendingMinutes}min` },
    { key: "dead_letters", severity: "critical", passed: e.unresolvedDeadLetters === 0, evidence: String(e.unresolvedDeadLetters) },
    { key: "ai_latency", severity: "medium", passed: e.aiP95LatencyMs === null || e.aiP95LatencyMs <= 15000, evidence: e.aiP95LatencyMs === null ? "no_sample" : `${e.aiP95LatencyMs}ms (${e.aiLatencySampleSize}/${e.aiLatencyPopulation})` },
    { key: "restore", severity: "critical", passed: e.backupRestorePassed, evidence: String(e.backupRestorePassed) },
    { key: "https", severity: "critical", passed: e.https, evidence: String(e.https) },
    { key: "cron", severity: "critical", passed: e.cronConfigured, evidence: String(e.cronConfigured) },
    { key: "logs", severity: "high", passed: e.logsConfigured, evidence: String(e.logsConfigured) },
  ];
  const blocking = controls.filter((control) => !control.passed && ["critical", "high"].includes(control.severity));
  return {
    status: blocking.length ? "blocked" : "ready_for_homologation",
    score: Math.round((controls.filter((control) => control.passed).length / controls.length) * 100),
    controls,
    blocking: blocking.map((control) => control.key),
    automaticPublish: false,
    humanReleaseApprovalRequired: true,
  };
}
