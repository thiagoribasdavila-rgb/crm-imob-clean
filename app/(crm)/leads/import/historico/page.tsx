"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/atlas/page-header";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { supabase } from "@/lib/supabase";
import {
  parseDelimited,
  suggestMapping,
  type ImportMapping,
  type LeadImportField,
  type ParsedSheet,
} from "@/lib/import/lead-import-pipeline";

/**
 * SALTO V4.2 — Importador governado da base histórica (CSV/TXT).
 *
 * Fluxo: arquivo → mapeamento sugerido (editável) → ANALISAR (dry-run, zero
 * escrita, relatório de qualidade + dedupe contra a base viva) → IMPORTAR.
 * O servidor re-valida tudo; esta tela só monta o mapeamento e mostra o laudo.
 */

const FIELD_LABEL: Record<LeadImportField, string> = {
  name: "Nome",
  phone: "Telefone",
  email: "E-mail",
  project: "Empreendimento",
  source: "Origem",
  campaign: "Campanha",
  status: "Status",
  created_at: "Data de entrada",
  legacy_broker: "Corretor (legado)",
  notes: "Observações",
  ignore: "Ignorar coluna",
};

const FIELD_ORDER: LeadImportField[] = [
  "name", "phone", "email", "project", "source", "campaign",
  "status", "created_at", "legacy_broker", "notes", "ignore",
];

const FIELD_CLASS =
  "w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3 py-2 text-sm text-[#e8eef8] outline-none transition-colors focus:border-[color:var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--atlas-accent)]";

type RowIssue = { row: number; level: "error" | "warning"; field: string; message: string };
type QualityReport = {
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRowsInFile: number;
  fieldFill: Partial<Record<LeadImportField, number>>;
  issues: RowIssue[];
  issuesTruncated: boolean;
};
type Dedupe = { existingMatches: number; byPhoneNormalized?: boolean; note?: string };
type Analysis = {
  mode: "dry_run" | "commit";
  report: QualityReport;
  dedupe: Dedupe;
  importable?: number;
  imported: number;
  batchId?: string;
};

async function token() {
  return (await supabase.auth.getSession()).data.session?.access_token || "";
}

export default function HistoricalImportPage() {
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState("");
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [sourceName, setSourceName] = useState("Base histórica");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState<"idle" | "analyzing" | "importing">("idle");
  const [error, setError] = useState("");
  const [committed, setCommitted] = useState(false);

  const readFile = useCallback((file: File | undefined) => {
    if (!file) return;
    setError("");
    setAnalysis(null);
    setCommitted(false);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setRaw(text);
      const parsed = parseDelimited(text);
      setSheet(parsed);
      setMapping(suggestMapping(parsed.headers));
    };
    reader.readAsText(file);
  }, []);

  const mappedName = useMemo(() => Object.values(mapping).includes("name"), [mapping]);

  const call = useCallback(
    async (mode: "dry_run" | "commit") => {
      if (!raw.trim() || !sheet) return;
      setBusy(mode === "dry_run" ? "analyzing" : "importing");
      setError("");
      try {
        const response = await fetch("/api/v1/leads/import", {
          method: "POST",
          headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ mode, text: raw, mapping, sourceName, sourceFile: fileName }),
        });
        const result = (await response.json().catch(() => null)) as { data?: Analysis; error?: { message?: string } } | null;
        if (!response.ok) {
          setError(
            response.status >= 500 && response.status !== 502
              ? "Importação indisponível até a ativação do banco (Fase 0)."
              : result?.error?.message || "Falha na importação.",
          );
          return;
        }
        setAnalysis(result?.data ?? null);
        if (mode === "commit") setCommitted(true);
      } catch {
        setError("Importação indisponível até a ativação do banco (Fase 0).");
      } finally {
        setBusy("idle");
      }
    },
    [raw, sheet, mapping, sourceName, fileName],
  );

  const report = analysis?.report;
  const fillMax = report ? Math.max(report.validRows, 1) : 1;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Base histórica · V4.2"
        title="Importar base de leads"
        description="Analise antes de carregar: qualidade por linha, duplicados no arquivo e cruzamento com a base viva. Nada é gravado no modo de análise."
        action={{ label: "Reativação", href: "/leads/import" }}
      />

      {/* 1 · Arquivo */}
      <TiltShell className="cc6-panel p-5" maxDeg={3}>
        <p className="cc6-eyebrow">1 · Arquivo</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="cc6-ghost-btn cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--atlas-accent)]">
            Selecionar CSV ou TXT
            <input
              className="sr-only"
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(event) => readFile(event.target.files?.[0])}
            />
          </label>
          {fileName ? (
            <span className="cc6-chip tabular-nums">
              {fileName} · {sheet?.rows.length ?? 0} linhas · delimitador &quot;{sheet?.delimiter === "\t" ? "TAB" : sheet?.delimiter}&quot;
            </span>
          ) : (
            <span className="text-sm text-[#6b7890]">Exporte planilhas Excel como CSV antes de enviar.</span>
          )}
        </div>
        <label className="mt-4 block">
          <span className="cc6-metric-label">Nome da carga (auditoria)</span>
          <input
            className={`${FIELD_CLASS} mt-1 max-w-sm`}
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
            placeholder="Base histórica"
          />
        </label>
      </TiltShell>

      {/* 2 · Mapeamento */}
      {sheet && sheet.headers.length ? (
        <TiltShell className="cc6-panel p-5" maxDeg={3}>
          <p className="cc6-eyebrow">2 · Mapeamento das colunas</p>
          <p className="mt-1 text-sm text-[#aab6ca]">
            Sugerimos pelo cabeçalho. Ajuste o que for preciso — <strong className="text-[#e8eef8]">Nome é obrigatório</strong>.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {sheet.headers.map((header, index) => (
              <label key={`${header}-${index}`} className="flex flex-col gap-1">
                <span className="truncate font-mono text-[11px] uppercase tracking-[0.14em] text-[#6b7890]">
                  {header || `Coluna ${index + 1}`}
                </span>
                <select
                  className={FIELD_CLASS}
                  value={mapping[index] ?? "ignore"}
                  onChange={(event) =>
                    setMapping((current) => ({ ...current, [index]: event.target.value as LeadImportField }))
                  }
                >
                  {FIELD_ORDER.map((field) => (
                    <option key={field} value={field}>
                      {FIELD_LABEL[field]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="cc6-ghost-btn focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
              disabled={!mappedName || busy !== "idle"}
              aria-busy={busy === "analyzing"}
              onClick={() => void call("dry_run")}
            >
              {busy === "analyzing" ? "Analisando…" : "Analisar base"}
            </button>
            {!mappedName ? <span className="cc6-warn text-sm">Mapeie a coluna de Nome para continuar.</span> : null}
          </div>
        </TiltShell>
      ) : null}

      {error ? (
        <div className="cc6-panel cc6-sev-band cc6-crit p-4" role="status">
          <p className="text-sm">{error}</p>
        </div>
      ) : null}

      {/* 3 · Relatório de qualidade */}
      {report ? (
        <TiltShell className="cc6-panel p-5" maxDeg={2}>
          <p className="cc6-eyebrow">3 · Relatório de qualidade</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="cc6-metric-value cc6-num">{report.totalRows}</p>
              <p className="cc6-metric-label">Linhas no arquivo</p>
            </div>
            <div>
              <p className="cc6-metric-value cc6-num cc6-ok">{report.validRows}</p>
              <p className="cc6-metric-label">Válidas</p>
            </div>
            <div>
              <p className={`cc6-metric-value cc6-num ${report.errorRows ? "cc6-crit" : ""}`}>{report.errorRows}</p>
              <p className="cc6-metric-label">Sem nome (descartadas)</p>
            </div>
            <div>
              <p className={`cc6-metric-value cc6-num ${report.duplicateRowsInFile ? "cc6-warn" : ""}`}>
                {report.duplicateRowsInFile}
              </p>
              <p className="cc6-metric-label">Duplicadas no arquivo</p>
            </div>
          </div>

          <div className="cc6-hairline my-4" />

          <div className="flex flex-wrap items-center gap-3">
            <span className={`cc6-chip tabular-nums ${analysis?.dedupe.existingMatches ? "cc6-warn" : "cc6-ok"}`}>
              {analysis?.dedupe.existingMatches ?? 0} já existem na base viva
            </span>
            <span className="cc6-chip tabular-nums cc6-ok">
              {analysis?.importable ?? 0} novas, prontas para importar
            </span>
          </div>
          {analysis?.dedupe.note ? <p className="mt-2 text-xs text-[#6b7890]">{analysis.dedupe.note}</p> : null}

          {/* preenchimento por campo */}
          {Object.keys(report.fieldFill).length ? (
            <div className="mt-4">
              <p className="cc6-metric-label mb-2">Preenchimento (entre as válidas)</p>
              <div className="flex flex-col gap-1.5">
                {FIELD_ORDER.filter((f) => f !== "ignore" && report.fieldFill[f]).map((field) => {
                  const count = report.fieldFill[field] ?? 0;
                  return (
                    <div key={field} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 text-xs text-[#aab6ca]">{FIELD_LABEL[field]}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(148,163,184,0.12)]">
                        <span
                          className="block h-full rounded-full bg-[color:var(--atlas-accent)]"
                          style={{ width: `${Math.round((count / fillMax) * 100)}%` }}
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[#6b7890]">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* avisos */}
          {report.issues.length ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-[#aab6ca]">
                {report.issues.length} observações{report.issuesTruncated ? " (primeiras 200)" : ""}
              </summary>
              <ul className="mt-2 max-h-56 overflow-y-auto text-xs">
                {report.issues.map((issue, index) => (
                  <li key={index} className={`py-0.5 ${issue.level === "error" ? "cc6-crit" : "text-[#aab6ca]"}`}>
                    <span className="tabular-nums text-[#6b7890]">L{issue.row}</span> · {issue.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {/* 4 · commit */}
          {!committed && (analysis?.importable ?? 0) > 0 ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="cc6-ghost-btn focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                aria-busy={busy === "importing"}
                disabled={busy !== "idle"}
                onClick={() => void call("commit")}
              >
                {busy === "importing" ? "Importando…" : `Importar ${analysis?.importable} leads`}
              </button>
              <span className="text-xs text-[#6b7890]">Entram como legado, sem distribuição automática.</span>
            </div>
          ) : null}

          {committed && analysis?.mode === "commit" ? (
            <div className="cc6-sev-band cc6-ok mt-5 rounded-xl p-4" role="status">
              <p className="text-sm">
                <strong>{analysis.imported}</strong> leads importados.
                {analysis.batchId ? (
                  <span className="ml-1 font-mono text-xs text-[#6b7890]">lote {analysis.batchId.slice(0, 8)}</span>
                ) : null}
              </p>
              <Link
                href="/leads"
                className="mt-2 inline-block text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
              >
                Ver leads →
              </Link>
            </div>
          ) : null}
        </TiltShell>
      ) : null}
    </div>
  );
}
