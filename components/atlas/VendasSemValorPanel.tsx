"use client";

/**
 * O VALOR DA VENDA — a tela que faltava para uma rota que já existia.
 *
 * `GET/POST /api/v1/crm/vendas-sem-valor` foi construída, testada e ficou ÓRFÃ:
 * nenhuma tela a consumia. É o mesmo caso do painel de compatibilidade, e o custo
 * aqui tem data marcada — a primeira venda fecha amanhã e a única lead `ganho` da
 * base está com `sale_value_brl` nulo. Sem tela, o número mora na cabeça de quem
 * vendeu até alguém lembrar de perguntar.
 *
 * ── POR QUE ISTO NÃO É "MAIS UM CAMPO" ──────────────────────────────────────
 *
 * Sem o valor: o VGV não fecha, a comissão não tem base de cálculo (a regra de
 * rateio existe e opera sobre a comissão bruta, que sai do valor), e o evento de
 * conversão que vai para a Meta viaja sem `value` — que, nas palavras da própria
 * rota, "ensina a coisa errada" ao algoritmo que decide para quem mostrar o
 * anúncio. Uma venda sem valor informada degrada a próxima campanha.
 *
 * ── O DENOMINADOR VIAJA JUNTO, DE PROPÓSITO ─────────────────────────────────
 *
 * A rota devolve `vendasFechadas` para a tela poder dizer "2 de 3 informadas" em
 * vez de só mostrar o que falta. Número sem denominador é como "442 leads" virou
 * um dado sem significado nesta base.
 */

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";

type Pendente = {
  id: string;
  nome: string | null;
  dias: number | null;
  critico: boolean;
  consequencia: string;
};

type Dados = {
  pendentes: Pendente[];
  total: number;
  criticas: number;
  escopo: "organizacao" | "carteira";
  vendasFechadas: number;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Aceita "1.234.567,89", "1234567.89" e "R$ 987.654,32". */
function paraNumero(bruto: string): number | null {
  const limpo = bruto.replace(/[^\d,.-]/g, "");
  if (!limpo) return null;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function VendasSemValorPanel() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const cabecalho = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : null;
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const cab = await cabecalho();
    if (!cab) {
      setErro("Sessão expirada. Entre novamente.");
      setCarregando(false);
      return;
    }
    try {
      const res = await fetch("/api/v1/crm/vendas-sem-valor", { headers: cab, cache: "no-store" });
      const corpo = await res.json().catch(() => null);
      // Leitura que falhou NÃO pode virar "nenhuma venda pendente": a tela diria
      // que está tudo em ordem sobre uma pergunta que ninguém conseguiu fazer.
      if (!res.ok) setErro(corpo?.error?.message ?? "Não foi possível apurar as vendas pendentes.");
      else setDados(corpo?.data ?? null);
    } catch {
      setErro("Falha de rede ao apurar as vendas pendentes.");
    }
    setCarregando(false);
  }, [cabecalho]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function informar(leadId: string) {
    const valor = paraNumero(rascunho[leadId] ?? "");
    if (valor === null) return;
    setSalvando(leadId);
    const cab = await cabecalho();
    if (!cab) {
      setErro("Sessão expirada. Entre novamente.");
      setSalvando(null);
      return;
    }
    try {
      const res = await fetch("/api/v1/crm/vendas-sem-valor", {
        method: "POST",
        headers: cab,
        body: JSON.stringify({ leadId, valor }),
      });
      if (!res.ok) {
        const corpo = await res.json().catch(() => null);
        setErro(corpo?.error?.message ?? "Não foi possível gravar o valor.");
      } else {
        setRascunho((atual) => ({ ...atual, [leadId]: "" }));
        await carregar();
      }
    } catch {
      setErro("Falha de rede ao gravar o valor.");
    }
    setSalvando(null);
  }

  if (carregando && !dados) return null;

  if (erro && !dados) {
    return (
      <AtlasCard>
        <AtlasCardHeader eyebrow="Valor da venda" title="Não foi possível apurar" description={erro} />
      </AtlasCard>
    );
  }

  // Zero pendências é notícia boa e silenciosa: ocupar a tela do diretor com um
  // painel vazio treina a pessoa a ignorar o lugar onde a cobrança aparece.
  if (!dados || dados.total === 0) return null;

  const informadas = dados.vendasFechadas - dados.total;

  return (
    <AtlasCard>
      <AtlasCardHeader
        eyebrow={dados.escopo === "organizacao" ? "Vendas da empresa" : "Suas vendas"}
        title={`${dados.total} venda${dados.total > 1 ? "s" : ""} fechada${dados.total > 1 ? "s" : ""} sem valor informado`}
        description={
          `${informadas} de ${dados.vendasFechadas} já informadas. ` +
          "Sem o valor, o VGV não fecha, a comissão não tem base de cálculo e o evento " +
          "de conversão vai para a Meta sem `value` — o que degrada a próxima campanha."
        }
      />
      <ul className="space-y-3 p-5 sm:p-6">
        {dados.pendentes.map((p) => (
          <li
            key={p.id}
            className={`rounded-2xl border p-3.5 ${p.critico ? "border-rose-400/25 bg-rose-400/[.06]" : "border-white/10 bg-white/[.03]"}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-white">{p.nome || "Lead sem nome"}</span>
              {p.dias !== null ? (
                <span className={`text-xs ${p.critico ? "text-rose-300" : "text-slate-400"}`}>
                  aguardando há {p.dias} dia{p.dias === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">{p.consequencia}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <input
                value={rascunho[p.id] ?? ""}
                onChange={(e) => setRascunho((atual) => ({ ...atual, [p.id]: e.target.value }))}
                placeholder="valor da venda, ex.: 987654,32"
                aria-label={`Valor da venda de ${p.nome || "lead sem nome"}`}
                inputMode="decimal"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => void informar(p.id)}
                disabled={paraNumero(rascunho[p.id] ?? "") === null || salvando === p.id}
                className="atlas-button-primary px-3 py-2 text-xs disabled:opacity-40"
              >
                {salvando === p.id ? "Gravando…" : "Informar valor"}
              </button>
            </div>
            {/* Eco do número interpretado: "987.654,32" e "987654.32" são o mesmo
                valor, e quem digita precisa VER qual dos dois o sistema entendeu
                antes de confirmar. */}
            {paraNumero(rascunho[p.id] ?? "") !== null ? (
              <p className="mt-1.5 text-xs text-emerald-300">
                será gravado {brl(paraNumero(rascunho[p.id] ?? "")!)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {erro ? <p className="px-5 pb-5 text-xs text-rose-300 sm:px-6">{erro}</p> : null}
    </AtlasCard>
  );
}
