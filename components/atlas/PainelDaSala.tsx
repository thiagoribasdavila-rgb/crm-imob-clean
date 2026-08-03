"use client";

/**
 * O PAINEL DA SALA DE COMANDO — a estrutura que o dono pediu, com dado real.
 *
 * ── A regra que atravessa cada bloco ───────────────────────────────────────
 *
 * O mockup traz números de exemplo (15.872 leads, 892 na série). A base tem
 * 490 leads. Onde o real é menor, o real fica — e onde ele é ZERO, o zero
 * aparece dito, não escondido.
 *
 * MEDIDO em 03/08/2026: `negociação` é 0 — não há uma única lead em proposta ou
 * contrato. Um funil que pule esse degrau, ou que o desenhe com largura mínima
 * para "ficar bonito", esconde o fato mais importante que ele tem a contar: o
 * meio do funil está vazio. O degrau é desenhado vazio e nomeado.
 *
 * ── Uma grade, um raio, quatro degraus de tipo ─────────────────────────────
 *
 * A tela antiga tinha 41 painéis em 6 larguras, 6 colunas de alinhamento e 2
 * raios. Aqui tudo nasce da mesma grade. Os tamanhos saem da escala declarada
 * em globals.css (10 · 11 · 13 · 20 · 34) — nenhum valor arbitrário.
 *
 * ── Os gráficos são desenhados, não plotados por biblioteca ────────────────
 *
 * SVG puro: o funil e a série são formas simples, e uma dependência nova para
 * isso custaria bundle e uma superfície de tema que o produto teria de domar.
 * Cada gráfico usa as variáveis de cor do tema — nada cravado.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Kpis = {
  leadsNaBase: number; leadsAtivos: number; emAtendimento: number;
  negociacao: number; vendas: number; vgvFechado: number;
};
type Etapa = { etapa: string; valor: number };
type Ponto = { dia: string; criadas: number; contatadas: number };
type Corretor = { id: string; nome: string; leads: number; ativos: number; vendas: number; vgv: number };
type Conversao = { taxa: number | null; ganhos: number; base: number };
type Desfecho = { emAberto: number; ganhas: number; perdidas: number };
type Painel = { amostraTruncada: boolean; kpis: Kpis; funil: Etapa[]; conversao: Conversao; desfecho: Desfecho; serie: Ponto[]; equipe: Corretor[] };

const N = new Intl.NumberFormat("pt-BR");
const MOEDA = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
  : v >= 1_000 ? `R$ ${Math.round(v / 1_000)}k`
  : `R$ ${N.format(v)}`;

/** Os seis indicadores do topo, com o ícone que a ação sugere. */
const KPIS: Array<{ chave: keyof Kpis; rotulo: string; glifo: string; moeda?: boolean }> = [
  { chave: "leadsNaBase", rotulo: "Leads na base", glifo: "👥" },
  { chave: "leadsAtivos", rotulo: "Leads ativos", glifo: "📈" },
  { chave: "emAtendimento", rotulo: "Em atendimento", glifo: "💬" },
  { chave: "negociacao", rotulo: "Negociação", glifo: "🤝" },
  { chave: "vendas", rotulo: "Vendas", glifo: "🏆" },
  { chave: "vgvFechado", rotulo: "VGV fechado", glifo: "💰", moeda: true },
];

/**
 * O funil, em SVG. Cada degrau é um trapézio cuja largura é PROPORCIONAL ao
 * valor — inclusive quando o valor é zero, e aí o degrau vira uma linha.
 * Desenhar largura mínima para "não ficar feio" seria mentir sobre o vazio.
 */
function Funil({ etapas }: { etapas: Etapa[] }) {
  const topo = Math.max(1, ...etapas.map((e) => e.valor));
  const alturaDoDegrau = 26;
  const vao = 4;
  const largura = 240;
  const altura = etapas.length * (alturaDoDegrau + vao);
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="h-auto w-full max-w-[240px]" role="img"
      aria-label={etapas.map((e) => `${e.etapa}: ${N.format(e.valor)}`).join(", ")}>
      {etapas.map((e, i) => {
        const proximo = etapas[i + 1]?.valor ?? e.valor;
        const wTopo = (e.valor / topo) * largura;
        const wBase = (proximo / topo) * largura;
        const y = i * (alturaDoDegrau + vao);
        const x1 = (largura - wTopo) / 2;
        const x2 = (largura - wBase) / 2;
        return (
          <polygon
            key={e.etapa}
            points={`${x1},${y} ${x1 + wTopo},${y} ${x2 + wBase},${y + alturaDoDegrau} ${x2},${y + alturaDoDegrau}`}
            fill="var(--atlas-accent)"
            opacity={1 - i * 0.15}
          />
        );
      })}
    </svg>
  );
}

/** A série de 30 dias. Sem pontos, diz que não há série — não desenha reta falsa. */
function Serie({ pontos }: { pontos: Ponto[] }) {
  if (pontos.length < 2) {
    return (
      <p className="text-corpo leading-6 text-[var(--atlas-texto-fraco)]">
        Sem série suficiente para desenhar — são precisos ao menos dois dias com entrada.
      </p>
    );
  }
  const w = 560, h = 160, pad = 8;
  const teto = Math.max(1, ...pontos.map((p) => Math.max(p.criadas, p.contatadas)));
  const x = (i: number) => pad + (i / (pontos.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - (v / teto) * (h - pad * 2);
  const linha = (campo: "criadas" | "contatadas") =>
    pontos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[campo]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img"
      aria-label={`Entradas por dia nos últimos ${pontos.length} dias, com o total de ${N.format(pontos.reduce((s, p) => s + p.criadas, 0))} leads`}>
      <path d={linha("criadas")} fill="none" stroke="var(--atlas-accent)" strokeWidth="2" />
      <path d={linha("contatadas")} fill="none" stroke="var(--atlas-texto-fraco)" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  );
}

export function PainelDaSala() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [indisponivel, setIndisponivel] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const sessao = await supabase.auth.getSession();
      const r = await fetch("/api/v1/atlas/sala/cartoes", {
        headers: { Authorization: `Bearer ${sessao.data.session?.access_token || ""}` },
        cache: "no-store",
      });
      const corpo = await r.json().catch(() => null);
      const dados = corpo?.data ?? corpo;
      if (!r.ok) { setIndisponivel(corpo?.error?.message || "Não foi possível ler o painel agora."); }
      else if (!dados?.painel) { setIndisponivel(dados?.painelIndisponivel ?? "painel não medido"); }
      else { setPainel(dados.painel as Painel); setIndisponivel(null); }
    } catch {
      // Erro de REDE também precisa virar frase: sem isto a promessa rejeita e a
      // tela fica em "carregando" para sempre.
      setIndisponivel("Sem resposta do servidor agora.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  if (carregando) return <p className="text-corpo text-[var(--atlas-texto-fraco)]">Lendo o painel…</p>;
  if (indisponivel || !painel) {
    return (
      <section className="cc6-panel p-5">
        <p className="cc6-eyebrow">Painel</p>
        <p className="mt-2 text-corpo leading-6 text-[var(--atlas-texto-medio)]">{indisponivel}</p>
      </section>
    );
  }

  const totalDaSerie = painel.serie.reduce((s, p) => s + p.criadas, 0);

  return (
    <div className="space-y-4">
      {painel.amostraTruncada ? (
        <p className="cc6-panel-quiet p-3 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          A base passou do teto de leitura: os números abaixo são de uma amostra, não do total.
        </p>
      ) : null}

      {/* ── OS SEIS INDICADORES ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {KPIS.map(({ chave, rotulo, glifo, moeda }) => (
          <article key={chave} className="cc6-panel-quiet p-4">
            <p className="cc6-eyebrow text-micro!">
              <span aria-hidden="true">{glifo} </span>{rotulo}
            </p>
            <p className="cc6-num mt-2 text-numero leading-none text-[var(--atlas-texto-forte)]">
              {moeda ? MOEDA(painel.kpis[chave]) : N.format(painel.kpis[chave])}
            </p>
          </article>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* ── FUNIL ────────────────────────────────────────────────────── */}
        <section className="cc6-panel p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="cc6-eyebrow">Funil de vendas</p>
            {/* Para onde as leads FORAM. O funil sozinho só diz onde elas estão —
                esta linha veio do painel antigo, que foi removido por duplicar o
                mesmo gráfico; tirar a redundância não podia custar a informação. */}
            {painel.desfecho ? (
              <span className="cc6-num text-micro text-[var(--atlas-texto-fraco)]">
                {N.format(painel.desfecho.emAberto)} em aberto · {N.format(painel.desfecho.ganhas)} ganha{painel.desfecho.ganhas === 1 ? "" : "s"} · {N.format(painel.desfecho.perdidas)} perdidas
              </span>
            ) : null}
          </div>
          <div className="mt-4 flex items-start gap-4">
            <Funil etapas={painel.funil} />
            <ul className="flex-1 space-y-2">
              {painel.funil.map((e) => (
                <li key={e.etapa} className="flex items-baseline justify-between gap-3">
                  <span className="text-corpo text-[var(--atlas-texto-medio)]">{e.etapa}</span>
                  <span className="cc6-num text-corpo text-[var(--atlas-texto-forte)]">{N.format(e.valor)}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* A conversão vem com o DENOMINADOR ao lado. Com 2 ganhos em 490, a
              segunda venda dobraria a taxa — "0,41%" sozinho é precisão fingida. */}
          {painel.conversao?.taxa !== null && painel.conversao ? (
            <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-[var(--atlas-border)] pt-3">
              <span className="text-corpo text-[var(--atlas-texto-medio)]">Conversão total</span>
              <span className="cc6-num text-corpo text-[var(--atlas-texto-forte)]">
                {painel.conversao.taxa!.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%
                <span className="ml-2 text-micro text-[var(--atlas-texto-fraco)]">
                  {N.format(painel.conversao.ganhos)} de {N.format(painel.conversao.base)}
                </span>
              </span>
            </div>
          ) : null}

          {painel.funil.some((e) => e.valor === 0) ? (
            /* O degrau vazio é NOMEADO. É o fato mais importante que este funil
               tem a contar hoje, e escondê-lo faria o desenho mentir. */
            <p className="mt-3 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
              {painel.funil.filter((e) => e.valor === 0).map((e) => e.etapa).join(" e ")} está em zero — o meio do funil não tem ninguém.
            </p>
          ) : null}
        </section>

        {/* ── SÉRIE ────────────────────────────────────────────────────── */}
        <section className="cc6-panel p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="cc6-eyebrow">Entradas por dia</p>
            <span className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]">
              {N.format(totalDaSerie)} em {painel.serie.length} dia(s)
            </span>
          </div>
          <div className="mt-4"><Serie pontos={painel.serie} /></div>
          <p className="mt-2 text-micro text-[var(--atlas-texto-fraco)]">
            Linha cheia: leads que entraram. Tracejada: as que receberam contato.
          </p>
        </section>

        {/* ── EQUIPE ───────────────────────────────────────────────────── */}
        <section className="cc6-panel p-5">
          <p className="cc6-eyebrow">Desempenho da equipe</p>
          <ul className="mt-4 space-y-3">
            {painel.equipe.length === 0 ? (
              <li className="text-corpo leading-6 text-[var(--atlas-texto-medio)]">Nenhuma lead com dono.</li>
            ) : painel.equipe.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3">
                <span className="text-corpo text-[var(--atlas-texto-medio)]">{c.nome}</span>
                <span className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]">
                  {N.format(c.leads)} leads · {N.format(c.ativos)} ativas · {c.vendas ? MOEDA(c.vgv) : "sem venda"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
