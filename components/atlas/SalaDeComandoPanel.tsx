"use client";

/**
 * SALA DE COMANDO — os seis indicadores e o funil.
 *
 * ── AS TRÊS DECISÕES DE DESENHO, E O PORQUÊ DE CADA UMA ─────────────────────
 *
 * 1. SVG, nunca canvas. Canvas não tem texto, não é lido por leitor de tela e
 *    nenhum dos contratos deste projeto consegue inspecioná-lo. O Sparkline que
 *    existe aqui crava `#38bdf8` e fundo escuro — quebra no tema claro, que é
 *    justamente o tema de quem está no sol entre visitas.
 *
 * 2. Cor só como ESTADO, nunca como enfeite. Esta base já pagou duas limpezas de
 *    over-design (balanço 3D em 34 telas, botões flutuantes). Aqui não há glow,
 *    gradiente decorativo nem movimento: a densidade vem de número por
 *    centímetro e de limiar desenhado, que é o que o diretor lê em cinco minutos.
 *
 * 3. Etapa vazia é DESENHADA, com o motivo. Medido na organização real:
 *    visita, proposta e negociação têm ZERO, e 336 das 482 leads nunca saíram de
 *    "novo". Esconder as três faria o funil parecer saudável; imprimir três
 *    barras mudas faria parecer quebrado. A barra fica, com a frase que explica —
 *    "o funil não está travado aqui, ele não chegou até aqui".
 */

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";

type Etapa = {
  chave: string;
  rotulo: string;
  quantidade: number;
  percentualDoTopo: number | null;
  porqueVazia: string | null;
};

type Dados = {
  indicadores: {
    leadsTotais: number;
    emAberto: number;
    emAtendimento: number;
    emNegociacao: number;
    vgvFechado: number;
    vgvEmNegociacaoIndisponivel: string | null;
    vendasSemValorInformado: number;
    corretoresComCarteira: number;
    comPrimeiroContato: number;
  };
  conversao: {
    ganhos: number;
    perdidos: number;
    base: number;
    taxa: number | null;
    afirmavel: boolean;
    porqueNaoAfirmavel: string | null;
  };
  funil: Etapa[];
};

const inteiro = (n: number) => n.toLocaleString("pt-BR");
const brl = (n: number) =>
  n >= 1_000_000
    ? `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Indicador({
  rotulo,
  valor,
  detalhe,
  alerta,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string | null;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${alerta ? "border-amber-400/25 bg-amber-400/[.05]" : "border-white/10 bg-white/[.03]"}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{valor}</p>
      {/* O detalhe carrega o DENOMINADOR ou o motivo. Número sem denominador foi
          como "442 leads" virou um dado sem significado nesta base. */}
      {detalhe ? (
        <p className={`mt-1 text-[11px] leading-4 ${alerta ? "text-amber-300" : "text-slate-500"}`}>{detalhe}</p>
      ) : null}
    </div>
  );
}

function Funil({ etapas }: { etapas: Etapa[] }) {
  const maior = Math.max(1, ...etapas.map((e) => e.quantidade));
  return (
    <ul className="space-y-2.5">
      {etapas.map((etapa) => {
        const largura = Math.max(etapa.quantidade > 0 ? 4 : 0, (etapa.quantidade / maior) * 100);
        return (
          <li key={etapa.chave}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium text-slate-200">{etapa.rotulo}</span>
              <span className="tabular-nums text-slate-400">
                {inteiro(etapa.quantidade)}
                {etapa.percentualDoTopo !== null && etapa.quantidade > 0 ? (
                  <span className="ml-1.5 text-slate-500">{etapa.percentualDoTopo}% do topo</span>
                ) : null}
              </span>
            </div>
            {/* Barra em div, não em SVG: uma barra é um retângulo, e retângulo com
                largura percentual e texto ao lado e legível por leitor de tela. */}
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[.05]">
              <div
                className={`h-full rounded-full ${etapa.quantidade > 0 ? "bg-sky-400/70" : ""}`}
                style={{ width: `${largura}%` }}
                role="presentation"
              />
            </div>
            {etapa.porqueVazia ? (
              <p className="mt-1 text-[11px] leading-4 text-slate-500">{etapa.porqueVazia}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function SalaDeComandoPanel() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    try {
      const res = await fetch("/api/v1/analytics/sala-de-comando", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const corpo = await res.json().catch(() => null);
      // 403 é resposta legítima: a sala é de direção. Corretor não vê o painel
      // em vez de ver um erro.
      if (res.status === 403) return;
      if (!res.ok) setErro(corpo?.error?.message ?? "Não foi possível medir a operação agora.");
      else setDados(corpo?.data ?? null);
    } catch {
      setErro("Falha de rede ao medir a operação.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro) {
    return (
      <AtlasCard>
        <AtlasCardHeader eyebrow="Sala de comando" title="Não foi possível medir" description={erro} />
      </AtlasCard>
    );
  }
  if (!dados) return null;

  const { indicadores: i, conversao: c } = dados;

  return (
    <div className="space-y-5">
      <section aria-label="Indicadores da operação" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Indicador rotulo="Leads na base" valor={inteiro(i.leadsTotais)} detalhe={`${inteiro(i.emAberto)} em aberto no funil`} />
        <Indicador
          rotulo="Com primeiro contato"
          valor={inteiro(i.comPrimeiroContato)}
          detalhe={`de ${inteiro(i.leadsTotais)} — o resto nunca foi tocado`}
          alerta={i.comPrimeiroContato < i.leadsTotais * 0.1}
        />
        <Indicador rotulo="Em atendimento" valor={inteiro(i.emAtendimento)} detalhe="status contato" />
        <Indicador
          rotulo="Em negociação"
          valor={inteiro(i.emNegociacao)}
          detalhe={i.vgvEmNegociacaoIndisponivel}
          alerta={i.emNegociacao === 0}
        />
        <Indicador
          rotulo="VGV fechado"
          valor={brl(i.vgvFechado)}
          detalhe={i.vendasSemValorInformado > 0 ? `${i.vendasSemValorInformado} venda sem valor informado` : null}
          alerta={i.vendasSemValorInformado > 0}
        />
        {/* A conversão é o único indicador que se RECUSA a mostrar número quando a
            amostra não sustenta. Uma venda em 482 não distingue 0,2% de 2%. */}
        <Indicador
          rotulo="Conversão"
          valor={c.afirmavel && c.taxa !== null ? `${c.taxa}%` : `${c.ganhos} venda${c.ganhos === 1 ? "" : "s"}`}
          detalhe={c.afirmavel ? `${inteiro(c.ganhos)} de ${inteiro(c.base)}` : c.porqueNaoAfirmavel}
          alerta={!c.afirmavel}
        />
      </section>

      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Funil de vendas"
          title="Onde as leads estão agora"
          description={`${inteiro(i.emAberto)} em aberto · ${inteiro(c.ganhos)} ganha${c.ganhos === 1 ? "" : "s"} · ${inteiro(c.perdidos)} perdida${c.perdidos === 1 ? "" : "s"}`}
        />
        <div className="p-5 sm:p-6">
          <Funil etapas={dados.funil} />
        </div>
      </AtlasCard>
    </div>
  );
}
