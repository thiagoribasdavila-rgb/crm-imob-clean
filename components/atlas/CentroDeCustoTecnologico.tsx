"use client";

/**
 * CENTRO DE CUSTO DE TECNOLOGIA (§8) — a tela que mostra o buraco junto com o número.
 *
 * ── A DECISÃO VISUAL QUE IMPORTA ─────────────────────────────────────────────
 *
 * "Não medido" NÃO é cinza discreto num canto. Ele tem a mesma altura, a mesma
 * fonte e a mesma linha da tabela que um valor em dinheiro — porque a informação
 * "isto custa e não sabemos quanto" é tão operacional quanto "isto custou R$ X".
 *
 * O primeiro rascunho desta tela mostrava o total grande no topo e as linhas não
 * medidas embaixo. Estava mentindo pela hierarquia: quem bate o olho lê o total
 * e vai embora. Agora a FRASE DE COBERTURA fica colada no total, no mesmo bloco,
 * e o total nunca aparece sozinho.
 *
 * ── O QUE ESTA TELA NUNCA FAZ ────────────────────────────────────────────────
 *
 * Nunca formata custo com `.toFixed()` sem antes conferir o estado. O tipo ajuda:
 * `valorPublicavel()` devolve `null` para o não medido, e `null.toFixed()`
 * quebraria em desenvolvimento — de propósito. A formatação passa por
 * `textoDoCusto()`, que devolve "não medido — <motivo>" e nunca um número.
 *
 * ── ONDE MONTAR ──────────────────────────────────────────────────────────────
 *
 * Em tela de liderança. A sugestão é `app/(crm)/reports/page.tsx` (Relatórios):
 *
 *   import { CentroDeCustoTecnologico } from "@/components/atlas/CentroDeCustoTecnologico";
 *   // ... dentro do corpo da página:
 *   <CentroDeCustoTecnologico />
 *
 * Esta entrega NÃO edita tela alguma. `app/(crm)/command-center/page.tsx` e
 * `app/(crm)/leads/page.tsx` estão em uso por outra frente neste momento.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";

type CustoDaLinha =
  | { estado: "medido"; valorUsd: number; fonte: string; comoFoiMedido: string; tarifa?: string }
  | { estado: "nao_medido"; motivo: string }
  | { estado: "sem_servico"; fonte: string; evidencia: string };

type ConsumoDaLinha =
  | { estado: "medido"; valor: number; unidade: string; fonte: string; comoFoiMedido: string }
  | { estado: "nao_medido"; motivo: string };

type Painel = {
  geradoEm: string;
  janela: { inicio: string; fim: string; diasCorridos: number; diasNoMes: number };
  plano: { provedor: string; plano: string; comoFoiMedido: string };
  linhas: { chave: string; rotulo: string; servico: string; custo: CustoDaLinha; consumo: ConsumoDaLinha }[];
  somatorio: {
    totalMedidoUsd: number;
    chavesMedidas: string[];
    chavesNaoMedidas: { chave: string; rotulo: string; motivo: string }[];
    chavesSemServico: string[];
    fracaoCoberta: number | null;
    cobertura: string;
  };
  totalBrl: CustoDaLinha;
  projecaoUsd:
    | { estado: "projetado"; valorUsd: number; metodo: string; alerta: string }
    | { estado: "nao_projetavel"; motivo: string };
  unitarios: { chave: string; rotulo: string; denominador: string; custo: CustoDaLinha }[];
  orcamento: {
    tetoBrl: { minimo: number; maximo: number };
    alerta:
      | { estado: "avaliado"; percentualDoTeto: number; nivelAtingido: number | null; dentroDoTeto: boolean; ressalva: string; mensagem: string }
      | { estado: "indeterminado"; motivo: string };
    veredito: { veredito: "dentro" | "fora" | "indeterminado"; porque: string };
  };
  definicoes: Record<string, string>;
  foraDoEscopo: { item: string; porque: string; ondeVive: string }[];
  ressalvas: string[];
};

type Estado = { tipo: "carregando" } | { tipo: "indisponivel"; motivo: string } | { tipo: "pronta"; painel: Painel };

/** Espelha `textoDoCusto` do módulo. Ausência SEMPRE sai como texto, nunca 0. */
function textoDoCusto(custo: CustoDaLinha, moeda: "USD" | "BRL" = "USD"): string {
  if (custo.estado === "nao_medido") return "não medido";
  if (custo.estado === "sem_servico") return "sem serviço";
  return moeda === "BRL" ? `R$ ${custo.valorUsd.toFixed(2)}` : `US$ ${custo.valorUsd.toFixed(6)}`;
}

function motivoDoCusto(custo: CustoDaLinha): string {
  if (custo.estado === "nao_medido") return custo.motivo;
  if (custo.estado === "sem_servico") return custo.evidencia;
  return custo.comoFoiMedido + (custo.tarifa ? ` · tarifa: ${custo.tarifa}` : "");
}

function textoDoConsumo(consumo: ConsumoDaLinha): string {
  if (consumo.estado === "nao_medido") return "consumo não medido";
  if (consumo.unidade === "bytes") {
    const mb = consumo.valor / (1024 * 1024);
    return `${mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`}`;
  }
  return `${consumo.valor.toLocaleString("pt-BR")} ${consumo.unidade}`;
}

/** A cor diz o estado. Não medido é ÂMBAR — visível, não decorativo. */
const CORES: Record<CustoDaLinha["estado"], string> = {
  medido: "text-[#e2e8f5]",
  nao_medido: "text-[#e8b04a]",
  sem_servico: "text-[#8b97ad]",
};

async function cabecalhos(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export function CentroDeCustoTecnologico() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });

  const carregar = useCallback(async () => {
    try {
      const cab = await cabecalhos();
      if (!cab) {
        setEstado({ tipo: "indisponivel", motivo: "Sessão necessária." });
        return;
      }
      const res = await fetch("/api/v1/finops/cost-center", { headers: cab, cache: "no-store" });
      const corpo = (await res.json().catch(() => null)) as { ok?: boolean; data?: Painel; error?: { message?: string } } | null;
      if (!res.ok || !corpo?.ok || !corpo.data) {
        setEstado({ tipo: "indisponivel", motivo: corpo?.error?.message ?? "Centro de custo indisponível." });
        return;
      }
      setEstado({ tipo: "pronta", painel: corpo.data });
    } catch {
      setEstado({ tipo: "indisponivel", motivo: "Falha ao carregar o centro de custo." });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (estado.tipo === "carregando") {
    return (
      <AtlasCard>
        <AtlasCardHeader eyebrow="§8 FinOps" title="Centro de custo de tecnologia" />
        <p className="px-4 pb-4 text-sm text-[#8b97ad]">Medindo…</p>
      </AtlasCard>
    );
  }

  if (estado.tipo === "indisponivel") {
    return (
      <AtlasCard>
        <AtlasCardHeader eyebrow="§8 FinOps" title="Centro de custo de tecnologia" />
        <p className="px-4 pb-4 text-sm text-[#e8b04a]">{estado.motivo}</p>
      </AtlasCard>
    );
  }

  const p = estado.painel;
  const alerta = p.orcamento.alerta;
  const pctCobertura = p.somatorio.fracaoCoberta === null ? null : Math.round(p.somatorio.fracaoCoberta * 100);
  const porServico = [...new Set(p.linhas.map((l) => l.servico))];

  return (
    <AtlasCard>
      <AtlasCardHeader
        eyebrow="§8 FinOps"
        title="Centro de custo de tecnologia"
        description={`Janela: mês corrente, dia ${p.janela.diasCorridos} de ${p.janela.diasNoMes}. Plano ${p.plano.provedor}: ${p.plano.plano}.`}
      />

      <div className="space-y-5 px-4 pb-5">
        {/* O TOTAL NUNCA APARECE SEM A COBERTURA. Mesmo bloco, de propósito. */}
        <div className="rounded-lg border border-[rgba(148,163,184,0.14)] bg-[rgba(15,24,48,0.5)] p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs uppercase tracking-wide text-[#8b97ad]">Total medido no mês</span>
            <span className="text-2xl font-semibold text-[#e2e8f5]">US$ {p.somatorio.totalMedidoUsd.toFixed(6)}</span>
            <span className={`text-sm ${CORES[p.totalBrl.estado]}`}>
              {p.totalBrl.estado === "medido" ? `≡ R$ ${p.totalBrl.valorUsd.toFixed(2)}` : "em reais: não medido"}
            </span>
          </div>
          <p className="mt-2 text-sm text-[#e8b04a]">{p.somatorio.cobertura}</p>
          {p.totalBrl.estado !== "medido" && (
            <p className="mt-1 text-xs text-[#8b97ad]">{motivoDoCusto(p.totalBrl)}</p>
          )}
        </div>

        {/* ORÇAMENTO — a régua 50/75/90/100 só existe sobre o que é medido. */}
        <div className="rounded-lg border border-[rgba(148,163,184,0.14)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#8b97ad]">
            Orçamento disponível — teto da Fase 1: R$ {p.orcamento.tetoBrl.minimo} a R$ {p.orcamento.tetoBrl.maximo}/mês
          </p>
          {alerta.estado === "indeterminado" ? (
            <p className="mt-2 text-sm text-[#e8b04a]">Sem percentual do teto: {alerta.motivo}</p>
          ) : (
            <>
              <p className={`mt-2 text-sm ${alerta.dentroDoTeto ? "text-[#e2e8f5]" : "text-[#f0704f]"}`}>{alerta.mensagem}</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[rgba(148,163,184,0.16)]">
                <div
                  className={`h-full ${alerta.percentualDoTeto >= 100 ? "bg-[#f0704f]" : alerta.percentualDoTeto >= 75 ? "bg-[#e8b04a]" : "bg-[#4a9d7f]"}`}
                  style={{ width: `${Math.min(100, Math.max(0, alerta.percentualDoTeto))}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-[#8b97ad]">
                alertas em 50% · 75% · 90% · 100%
                {alerta.nivelAtingido === null ? " — nenhum atingido" : ` — atingido: ${alerta.nivelAtingido}%`}
              </p>
              {/* A RESSALVA É OBRIGATÓRIA. Percentual sobre parcela medida sem ela é afirmação falsa. */}
              <p className="mt-2 text-xs text-[#e8b04a]">{alerta.ressalva}</p>
            </>
          )}
          <p className="mt-3 text-sm">
            <span className="text-[#8b97ad]">Veredito contra o teto: </span>
            <span
              className={
                p.orcamento.veredito.veredito === "dentro"
                  ? "text-[#4a9d7f]"
                  : p.orcamento.veredito.veredito === "fora"
                    ? "text-[#f0704f]"
                    : "text-[#e8b04a]"
              }
            >
              {p.orcamento.veredito.veredito === "indeterminado" ? "NÃO DÁ PARA SABER" : p.orcamento.veredito.veredito.toUpperCase()}
            </span>
          </p>
          <p className="mt-1 text-xs text-[#8b97ad]">{p.orcamento.veredito.porque}</p>
        </div>

        {/* LINHA POR LINHA. Não medido tem o mesmo peso visual de um valor. */}
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-[#8b97ad]">
            Por serviço ({porServico.length}): {porServico.join(" · ")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-[#8b97ad]">
                  <th className="py-2 pr-3 font-normal">Linha</th>
                  <th className="py-2 pr-3 font-normal">Consumo</th>
                  <th className="py-2 pr-3 font-normal">Custo no mês</th>
                </tr>
              </thead>
              <tbody>
                {p.linhas.map((linha) => (
                  <tr key={linha.chave} className="border-t border-[rgba(148,163,184,0.1)] align-top">
                    <td className="py-2 pr-3">
                      <span className="text-[#e2e8f5]">{linha.rotulo}</span>
                      <span className="block text-xs text-[#8b97ad]">{linha.servico}</span>
                    </td>
                    <td className="py-2 pr-3 text-[#c3cddf]">
                      {textoDoConsumo(linha.consumo)}
                      {linha.consumo.estado === "nao_medido" && (
                        <span className="block text-xs text-[#8b97ad]">{linha.consumo.motivo}</span>
                      )}
                    </td>
                    <td className={`py-2 pr-3 ${CORES[linha.custo.estado]}`}>
                      {textoDoCusto(linha.custo)}
                      <span className="block max-w-[28rem] text-xs text-[#8b97ad]">{motivoDoCusto(linha.custo)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CUSTOS UNITÁRIOS — com a definição do denominador ao lado do número. */}
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-[#8b97ad]">Custo unitário (sobre o total MEDIDO)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {p.unitarios.map((u) => (
              <div key={u.chave} className="rounded-lg border border-[rgba(148,163,184,0.12)] p-3">
                <p className="text-xs text-[#8b97ad]">{u.rotulo}</p>
                <p className={`text-lg ${CORES[u.custo.estado]}`}>{textoDoCusto(u.custo)}</p>
                <p className="mt-1 text-xs text-[#8b97ad]">{u.denominador}</p>
                {u.custo.estado === "nao_medido" && <p className="mt-1 text-xs text-[#e8b04a]">{u.custo.motivo}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* PROJEÇÃO — sempre rotulada como projeção, com o método escrito. */}
        <div className="rounded-lg border border-[rgba(148,163,184,0.12)] p-3">
          <p className="text-xs uppercase tracking-wide text-[#8b97ad]">Projeção do fechamento do mês</p>
          {p.projecaoUsd.estado === "projetado" ? (
            <>
              <p className="text-lg text-[#e2e8f5]">US$ {p.projecaoUsd.valorUsd.toFixed(6)}</p>
              <p className="mt-1 text-xs text-[#8b97ad]">{p.projecaoUsd.metodo}</p>
              <p className="mt-1 text-xs text-[#e8b04a]">{p.projecaoUsd.alerta}</p>
            </>
          ) : (
            <p className="text-sm text-[#e8b04a]">não projetável — {p.projecaoUsd.motivo}</p>
          )}
        </div>

        {/* O QUE NÃO É MEDIDO, junto, para ninguém precisar caçar na tabela. */}
        {p.somatorio.chavesNaoMedidas.length > 0 && (
          <div className="rounded-lg border border-[rgba(232,176,74,0.3)] bg-[rgba(232,176,74,0.06)] p-4">
            <p className="text-sm text-[#e8b04a]">
              {p.somatorio.chavesNaoMedidas.length} linha(s) de custo NÃO medida(s)
              {pctCobertura === null ? "" : ` — o painel cobre ${pctCobertura}% das linhas conhecidas`}
            </p>
            <ul className="mt-2 space-y-2">
              {p.somatorio.chavesNaoMedidas.map((n) => (
                <li key={n.chave} className="text-xs text-[#c3cddf]">
                  <span className="text-[#e2e8f5]">{n.rotulo}</span> — {n.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}

        <details className="text-xs text-[#8b97ad]">
          <summary className="cursor-pointer text-[#c3cddf]">Ressalvas do instrumento e o que fica fora deste painel</summary>
          <ul className="mt-2 space-y-1">
            {p.ressalvas.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1">
            {p.foraDoEscopo.map((f) => (
              <li key={f.item}>
                · <span className="text-[#c3cddf]">{f.item}</span> — {f.porque} ({f.ondeVive})
              </li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1">
            {Object.entries(p.definicoes).map(([chave, texto]) => (
              <li key={chave}>
                · <span className="text-[#c3cddf]">{chave}</span>: {texto}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </AtlasCard>
  );
}
