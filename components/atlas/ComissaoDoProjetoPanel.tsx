"use client";

/**
 * COMISSÃO E PRÊMIO DO PROJETO — a tela do que já existia em três camadas.
 *
 * `commission_rules` guarda o rateio em quatro partes e o prêmio à parte desde
 * 2026-07-27; `lib/crm/commission-rules.ts` lê e apura; a rota de escrita foi
 * construída hoje. Faltava a tela — e sem ela a tabela seguia com ZERO linhas,
 * que é onde estava quando o dono pediu "um campo que fale a comissão e o
 * prêmio, são valores diferentes".
 *
 * ── O PRÊMIO NÃO DISPUTA OS 100% ────────────────────────────────────────────
 *
 * Ele vem da incorporadora, por unidade vendida, em outra data e outro extrato.
 * Se entrasse na soma dos percentuais, toda regra de rateio fechado COM prêmio
 * seria recusada e o diretor teria de mentir num dos dois campos para gravar.
 * Por isso são dois blocos visuais separados, não quatro campos numa linha.
 *
 * ── O QUE SOBRA APARECE ─────────────────────────────────────────────────────
 *
 * Percentual que não soma 100 pode ser intencional — retenção, imposto. Não é
 * erro, mas tem de estar na tela: senão vira dinheiro que ninguém sabe de quem é.
 */

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";

type Vigente = {
  pct_corretor: number | string;
  pct_gerente: number | string;
  pct_diretor: number | string;
  pct_imobiliaria: number | string;
  premio_valor: number | string;
  premio_observacao: string | null;
  vigente_desde: string;
};

type Dados = {
  vigente: Vigente | null;
  definida: boolean;
  aviso: string | null;
  historico: Vigente[];
};

const PARTES = [
  ["pctCorretor", "Corretor"],
  ["pctGerente", "Gerente"],
  ["pctDiretor", "Diretor"],
  ["pctImobiliaria", "Imobiliária"],
] as const;

const numero = (v: string) => {
  const limpo = v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : Number.NaN;
};
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ComissaoDoProjetoPanel({ developmentId }: { developmentId: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [premio, setPremio] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  const cabecalho = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : null;
  }, []);

  const carregar = useCallback(async () => {
    const cab = await cabecalho();
    if (!cab) return;
    try {
      const res = await fetch(`/api/v1/developments/${encodeURIComponent(developmentId)}/commission`, {
        headers: cab,
        cache: "no-store",
      });
      const corpo = await res.json().catch(() => null);
      // 403 aqui é resposta legítima: comissão é dinheiro de terceiro, e a rota
      // só atende direção. Corretor não vê o painel em vez de ver um erro.
      if (res.status === 403) return;
      if (!res.ok) setErro(corpo?.error?.message ?? "Não foi possível ler a regra de comissão.");
      else {
        const d = corpo?.data ?? null;
        setDados(d);
        if (d?.vigente) {
          setForm({
            pctCorretor: String(d.vigente.pct_corretor),
            pctGerente: String(d.vigente.pct_gerente),
            pctDiretor: String(d.vigente.pct_diretor),
            pctImobiliaria: String(d.vigente.pct_imobiliaria),
          });
          setPremio(String(d.vigente.premio_valor));
          setObservacao(d.vigente.premio_observacao ?? "");
        }
      }
    } catch {
      setErro("Falha de rede ao ler a regra de comissão.");
    }
  }, [cabecalho, developmentId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const soma = PARTES.reduce((acc, [chave]) => {
    const n = numero(form[chave] ?? "");
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  const sobra = Math.round((100 - soma) * 1000) / 1000;
  const podeSalvar =
    PARTES.every(([c]) => Number.isFinite(numero(form[c] ?? ""))) &&
    Number.isFinite(numero(premio || "0")) &&
    soma <= 100;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setOk(false);
    const cab = await cabecalho();
    if (!cab) {
      setErro("Sessão expirada. Entre novamente.");
      setSalvando(false);
      return;
    }
    try {
      const res = await fetch(`/api/v1/developments/${encodeURIComponent(developmentId)}/commission`, {
        method: "PUT",
        headers: cab,
        body: JSON.stringify({
          pctCorretor: numero(form.pctCorretor ?? ""),
          pctGerente: numero(form.pctGerente ?? ""),
          pctDiretor: numero(form.pctDiretor ?? ""),
          pctImobiliaria: numero(form.pctImobiliaria ?? ""),
          premioValor: numero(premio || "0"),
          premioObservacao: observacao,
        }),
      });
      const corpo = await res.json().catch(() => null);
      if (!res.ok) setErro(corpo?.error?.message ?? "Não foi possível gravar a regra.");
      else {
        setOk(true);
        await carregar();
      }
    } catch {
      setErro("Falha de rede ao gravar a regra.");
    }
    setSalvando(false);
  }

  if (!dados) return null;

  return (
    <AtlasCard>
      <AtlasCardHeader
        eyebrow="Quem ganha quanto"
        title="Comissão e prêmio deste projeto"
        description={
          dados.definida
            ? `Vigente desde ${dados.vigente?.vigente_desde}. Gravar uma nova encerra a anterior e guarda o histórico.`
            : // `null` é "ninguém definiu ainda" — diferente de zero, que seria
              // "definiram que ninguém ganha nada".
              "Nenhuma regra definida ainda. Sem ela, o rateio de uma venda deste projeto não tem base de cálculo."
        }
      />
      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Rateio da comissão — disputa os 100%
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-4">
            {PARTES.map(([chave, rotulo]) => (
              <label key={chave} className="space-y-1">
                <span className="text-xs text-slate-400">{rotulo}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    value={form[chave] ?? ""}
                    onChange={(e) => setForm((a) => ({ ...a, [chave]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label={`Percentual do ${rotulo.toLowerCase()}`}
                    className="w-full rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-sm text-white"
                  />
                  <span className="text-sm text-slate-500">%</span>
                </div>
              </label>
            ))}
          </div>
          <p className={`mt-2 text-xs ${soma > 100 ? "text-rose-300" : sobra > 0 ? "text-amber-300" : "text-emerald-300"}`}>
            {soma > 100
              ? `Somam ${soma}% — acima da comissão bruta. Tire ${Math.round((soma - 100) * 1000) / 1000}% de alguém.`
              : sobra > 0
                ? `Somam ${soma}%: ${sobra}% da comissão não está atribuído a ninguém. Pode ser retenção ou imposto — só não pode ficar invisível.`
                : "Somam 100% da comissão bruta."}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Prêmio da incorporadora — por fora, não sai da comissão
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-[200px_1fr]">
            <label className="space-y-1">
              <span className="text-xs text-slate-400">Valor por unidade</span>
              <input
                value={premio}
                onChange={(e) => setPremio(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label="Valor do prêmio por unidade"
                className="w-full rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-400">Observação (quando e como a incorporadora paga)</span>
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="ex.: pago no mês seguinte ao registro, extrato à parte"
                aria-label="Observação sobre o prêmio"
                className="w-full rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />
            </label>
          </div>
          {Number.isFinite(numero(premio || "0")) && numero(premio || "0") > 0 ? (
            <p className="mt-1.5 text-xs text-emerald-300">
              {brl(numero(premio))} por unidade, somados à parte de quem vendeu e contabilizados fora do rateio.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={!podeSalvar || salvando}
            className="atlas-button-primary disabled:opacity-40"
          >
            {salvando ? "Gravando…" : dados.definida ? "Gravar nova vigência" : "Definir regra"}
          </button>
          {ok ? <span className="text-xs text-emerald-300">gravado — a anterior foi encerrada</span> : null}
          {erro ? <span className="text-xs text-rose-300">{erro}</span> : null}
        </div>

        {dados.historico.length > 0 ? (
          <p className="text-xs text-slate-500">
            {dados.historico.length} vigência{dados.historico.length > 1 ? "s" : ""} anterior
            {dados.historico.length > 1 ? "es" : ""} no histórico — é o que permite conferir uma comissão paga em março
            com a regra de março, e não com a de hoje.
          </p>
        ) : null}
      </div>
    </AtlasCard>
  );
}
