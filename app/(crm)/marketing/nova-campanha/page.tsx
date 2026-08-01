"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/atlas/page-header";
import { AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { supabase } from "@/lib/supabase";

/*
 * NOVA CAMPANHA — o caminho crítico da Fase 1, ligando as rotas que já existem.
 *
 * Duas decisões que moldam a tela:
 *
 * 1. NADA AQUI PUBLICA. O passo final marca a campanha como pronta e mostra o
 *    que ainda falta. Publicação é outro fluxo, com aprovação — e hoje depende
 *    de credencial que não está válida.
 *
 * 2. O PREFLIGHT É CONSULTADO A CADA PASSO, não só no fim. Descobrir na etapa 8
 *    que falta material da etapa 2 desperdiça o trabalho inteiro.
 */

type Empreendimento = { id: string; name: string; developer_name: string | null; neighborhood: string | null; total_units: number | null };
type Item = { chave: string; rotulo: string; ok: boolean; detalhe: string };
type Prontidao = {
  situacao: string; situacaoRotulo: string; ressalva: string | null;
  grupos: { produto: Item[]; integracao: Item[]; crm: Item[] };
  bloqueadores: Item[]; avisos: Item[];
  resumo: { total: number; ok: number; bloqueadores: number; avisos: number };
};
type Conceito = { nome: string; angulo: string; publicoAlvo: string };
type Geracao = {
  campanha: { id: string; name: string; status: string };
  briefing: { resumo: string; personaPrincipal: string; oferta: string; argumentoCentral: string; hipotese: string; criterioSucesso: string };
  copies: { conceitos: Conceito[]; titulos: string[]; textosPrincipais: string[]; descricoes: string[]; ctas: string[]; roteirosVideo: Array<{ titulo: string; cenas: string[] }> };
  criativosSalvos: number;
  consumo: { provedor: string; modelo: string; tokensTotais: number; custoEstimadoUsd: number | null; chamadas: number };
  pendenciasDoProduto: string[];
};

const OBJETIVOS = [
  { valor: "gerar_leads", rotulo: "Gerar leads", ajuda: "formulário da Meta, lead cai direto no CRM" },
  { valor: "contato_whatsapp", rotulo: "Contato por WhatsApp", ajuda: "abre conversa no número da equipe" },
  { valor: "gerar_visitas", rotulo: "Gerar visitas", ajuda: "agendamento no decorado" },
  { valor: "divulgar_lancamento", rotulo: "Divulgar lançamento", ajuda: "audiência e alcance antes da venda" },
  { valor: "vender_estoque", rotulo: "Vender estoque", ajuda: "unidades específicas remanescentes" },
  { valor: "atrair_investidores", rotulo: "Atrair investidores", ajuda: "foco em rentabilidade e liquidez" },
  { valor: "remarketing", rotulo: "Remarketing", ajuda: "quem já demonstrou interesse" },
] as const;

const ETAPAS = ["Empreendimento", "Objetivo", "Estratégia e peças", "Orçamento", "Prontidão"] as const;

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

export default function NovaCampanhaPage() {
  const [etapa, setEtapa] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [escolhido, setEscolhido] = useState<string>("");
  const [objetivo, setObjetivo] = useState<string>("gerar_leads");
  const [prontidao, setProntidao] = useState<Prontidao | null>(null);
  const [gerando, setGerando] = useState(false);
  const [geracao, setGeracao] = useState<Geracao | null>(null);
  const [diario, setDiario] = useState(80);
  const [dias, setDias] = useState(14);

  const selecionado = useMemo(
    () => empreendimentos.find((e) => e.id === escolhido) ?? null,
    [empreendimentos, escolhido],
  );

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/v1/developments", { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
        const p = await r.json();
        if (!r.ok) throw new Error(p?.error?.message ?? "Não foi possível carregar os empreendimentos.");
        setEmpreendimentos(p.data?.developments ?? p.developments ?? []);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao carregar.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  // Preflight a cada mudança de empreendimento: pendência aparece cedo, não no fim.
  const conferirProntidao = useCallback(async (developmentId: string) => {
    if (!developmentId) return setProntidao(null);
    try {
      const r = await fetch(`/api/v1/marketing/campaign-readiness?developmentId=${developmentId}`, {
        headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store",
      });
      const p = await r.json();
      if (r.ok) setProntidao(p.data);
    } catch { /* prontidão é informativa; falha nela não trava o wizard */ }
  }, []);

  useEffect(() => { void conferirProntidao(escolhido); }, [escolhido, conferirProntidao]);

  async function gerar() {
    setGerando(true); setErro("");
    try {
      const r = await fetch("/api/v1/marketing/creative-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ developmentId: escolhido, objetivo }),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p?.error?.message ?? "A geração falhou.");
      setGeracao(p.data);
      setEtapa(3);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na geração.");
    } finally {
      setGerando(false);
    }
  }

  const podeAvancar = etapa === 0 ? Boolean(escolhido) : etapa === 1 ? Boolean(objetivo) : etapa === 2 ? Boolean(geracao) : true;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <PageHeader
        eyebrow="Growth AI"
        title="Nova campanha"
        description="Do empreendimento à campanha pronta para aprovação. Nenhum passo aqui publica anúncio nem move verba."
      />

      {/* Trilha das etapas */}
      <ol className="mt-6 flex flex-wrap gap-2" aria-label="Etapas">
        {ETAPAS.map((nome, i) => (
          <li key={nome}>
            <button
              type="button"
              onClick={() => i <= etapa && setEtapa(i)}
              disabled={i > etapa}
              className={`cc6-chip ${i === etapa ? "border-[color:var(--atlas-accent)]! text-[var(--atlas-texto-forte)]!" : ""} disabled:opacity-40`}
            >
              {i + 1}. {nome}
            </button>
          </li>
        ))}
      </ol>

      {erro ? <div className="mt-4"><AtlasRecoverableError title="Não foi possível continuar" description={erro} onRetry={() => setErro("")} /></div> : null}

      {/* ETAPA 1 — empreendimento */}
      {etapa === 0 ? (
        <section className="cc6-panel mt-6 p-5">
          <p className="cc6-eyebrow">Etapa 1</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Qual empreendimento?</h2>
          {carregando ? <AtlasSkeleton className="mt-4 h-32 w-full" /> : empreendimentos.length === 0 ? (
            <div className="mt-4"><AtlasEmpty reason="first-use" title="Nenhum empreendimento cadastrado" description="Cadastre o produto antes de criar a campanha." /></div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {empreendimentos.map((e) => (
                <button
                  key={e.id} type="button" onClick={() => setEscolhido(e.id)}
                  className={`rounded-xl border p-4 text-left transition-colors ${escolhido === e.id ? "border-[color:var(--atlas-accent)] bg-white/[.04]" : "border-[rgba(148,163,184,0.16)] hover:border-[rgba(148,163,184,0.35)]"}`}
                >
                  <p className="text-sm font-semibold text-[var(--atlas-texto-forte)]">{e.name}</p>
                  <p className="mt-1 text-xs text-[var(--atlas-texto-fraco)]">
                    {[e.developer_name, e.neighborhood, e.total_units ? `${e.total_units} unidades` : null].filter(Boolean).join(" · ")}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* ETAPA 2 — objetivo */}
      {etapa === 1 ? (
        <section className="cc6-panel mt-6 p-5">
          <p className="cc6-eyebrow">Etapa 2</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">O que a campanha precisa entregar?</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {OBJETIVOS.map((o) => (
              <button
                key={o.valor} type="button" onClick={() => setObjetivo(o.valor)}
                className={`rounded-xl border p-3 text-left transition-colors ${objetivo === o.valor ? "border-[color:var(--atlas-accent)] bg-white/[.04]" : "border-[rgba(148,163,184,0.16)] hover:border-[rgba(148,163,184,0.35)]"}`}
              >
                <p className="text-sm text-[var(--atlas-texto-forte)]">{o.rotulo}</p>
                <p className="mt-0.5 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{o.ajuda}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ETAPA 3 — geração */}
      {etapa === 2 ? (
        <section className="cc6-panel mt-6 p-5">
          <p className="cc6-eyebrow">Etapa 3</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Gerar estratégia e peças</h2>
          <p className="mt-2 text-xs leading-5 text-[var(--atlas-texto-fraco)]">
            A IA lê o que está cadastrado e escreve briefing, conceitos, títulos, textos e roteiros.
            Consome tokens — o custo aparece no fim.{" "}
            {prontidao?.avisos.length ? (
              <span className="text-[#e8b04a]">
                Atenção: {prontidao.avisos.map((a) => a.rotulo.toLowerCase()).join(", ")} não confirmado. As peças serão escritas SEM esses dados, nunca com dado inventado.
              </span>
            ) : null}
          </p>
          <button type="button" onClick={() => void gerar()} disabled={gerando} className="cc6-ghost-btn mt-4 disabled:opacity-50">
            {gerando ? "Gerando…" : "Gerar com IA"}
          </button>
        </section>
      ) : null}

      {/* ETAPA 4 — resultado + orçamento */}
      {etapa === 3 && geracao ? (
        <>
          <section className="cc6-panel mt-6 p-5">
            <p className="cc6-eyebrow">Briefing</p>
            <p className="mt-2 text-sm leading-6 text-[#c8d3e4]">{geracao.briefing.resumo}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {[["Persona", geracao.briefing.personaPrincipal], ["Oferta", geracao.briefing.oferta],
                ["Hipótese", geracao.briefing.hipotese], ["Critério de sucesso", geracao.briefing.criterioSucesso]].map(([r, v]) => (
                <div key={r}>
                  <dt className="cc6-metric-label">{r}</dt>
                  <dd className="mt-1 text-xs leading-5 text-[#c8d3e4]">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="cc6-panel mt-4 p-5">
            <p className="cc6-eyebrow">Peças geradas · {geracao.criativosSalvos} salvas como rascunho</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {geracao.copies.conceitos.map((c) => (
                <div key={c.nome} className="rounded-xl border border-[rgba(148,163,184,0.16)] p-3">
                  <p className="text-sm font-semibold text-[var(--atlas-texto-forte)]">{c.nome}</p>
                  <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{c.publicoAlvo}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-[var(--atlas-texto-fraco)]">Títulos: {geracao.copies.titulos.map((t) => `“${t}”`).join(" · ")}</p>
            <p className="mt-2 text-xs text-[var(--atlas-texto-fraco)]">CTAs: {geracao.copies.ctas.join(" · ")}</p>
            <p className="cc6-hairline mt-4 pt-3 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
              {geracao.copies.roteirosVideo.length} roteiro(s) de vídeo escritos — <strong className="text-[#c8d3e4]">roteiro não é vídeo</strong>: nenhuma peça audiovisual foi produzida.
            </p>
            <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
              Consumo: {geracao.consumo.tokensTotais} tokens em {geracao.consumo.chamadas} chamadas · {geracao.consumo.provedor}/{geracao.consumo.modelo} ·{" "}
              {geracao.consumo.custoEstimadoUsd == null
                ? <span className="text-[#e8b04a]">custo não calculado — falta tarifa em ATLAS_AI_PRICE_TABLE</span>
                : `US$ ${geracao.consumo.custoEstimadoUsd.toFixed(5)}`}
            </p>
          </section>

          <section className="cc6-panel mt-4 p-5">
            <p className="cc6-eyebrow">Etapa 4 · Orçamento</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <label className="block text-xs text-[var(--atlas-texto-fraco)]">
                Diário (R$)
                <input type="number" min={20} value={diario} onChange={(e) => setDiario(Number(e.target.value))}
                  className="mt-2 w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3 py-2.5 text-sm text-[var(--atlas-texto-forte)] outline-none" />
              </label>
              <label className="block text-xs text-[var(--atlas-texto-fraco)]">
                Duração (dias)
                <input type="number" min={1} max={90} value={dias} onChange={(e) => setDias(Number(e.target.value))}
                  className="mt-2 w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3 py-2.5 text-sm text-[var(--atlas-texto-forte)] outline-none" />
              </label>
              <div>
                <p className="cc6-metric-label">Total do período</p>
                <p className="cc6-metric-value mt-1">R$ {(diario * dias).toLocaleString("pt-BR")}</p>
              </div>
            </div>
            <p className="mt-3 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
              Nenhuma projeção de leads é exibida aqui. Sem histórico de CPL deste produto, qualquer número seria chute com aparência de previsão.
            </p>
          </section>
        </>
      ) : null}

      {/* ETAPA 5 — prontidão */}
      {etapa === 4 && prontidao ? (
        <section className="cc6-panel mt-6 p-5">
          <p className="cc6-eyebrow">Etapa 5 · Prontidão</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">{prontidao.situacaoRotulo}</h2>
          {prontidao.ressalva ? (
            <p className="mt-2 rounded-xl border border-[rgba(232,176,74,0.3)] bg-[rgba(232,176,74,0.06)] p-3 text-xs leading-5 text-[#e8b04a]">
              {prontidao.ressalva}
            </p>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {(["produto", "integracao", "crm"] as const).map((g) => (
              <div key={g}>
                <p className="cc6-metric-label capitalize">{g === "crm" ? "CRM" : g}</p>
                <ul className="mt-2 space-y-1.5">
                  {prontidao.grupos[g].map((i) => (
                    <li key={i.chave} className="text-rotulo leading-4">
                      <span className={i.ok ? "text-[#4ade80]" : "text-[#e8b04a]"}>{i.ok ? "✓" : "○"}</span>{" "}
                      <span className="text-[#c8d3e4]">{i.rotulo}</span>
                      <span className="text-[var(--atlas-texto-fraco)]"> — {i.detalhe}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="cc6-hairline mt-4 pt-3 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
            A campanha fica salva como rascunho com as peças anexadas. Publicar exige aprovação e credencial válida — nada aqui move verba.
          </p>
        </section>
      ) : null}

      {/* Navegação */}
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={() => setEtapa((e) => Math.max(0, e - 1))} disabled={etapa === 0} className="cc6-ghost-btn disabled:opacity-40">
          Voltar
        </button>
        {etapa < ETAPAS.length - 1 ? (
          <button type="button" onClick={() => setEtapa((e) => e + 1)} disabled={!podeAvancar} className="cc6-ghost-btn disabled:opacity-40">
            Avançar
          </button>
        ) : (
          <span className="text-xs text-[var(--atlas-texto-fraco)]">
            {selecionado ? `${selecionado.name} · rascunho salvo` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
