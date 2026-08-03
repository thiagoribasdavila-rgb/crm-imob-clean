"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { supabase } from "@/lib/supabase";

/**
 * O QUE ESTÁ CONSTRUÍDO E APAGADO.
 *
 * Medido em 03/08/2026: 82 tabelas com zero linhas, 67 com código que as lê.
 * Nenhuma delas quebrada — todas esperando uma configuração que ninguém sabia
 * que faltava, porque o produto não tinha onde dizer.
 *
 * Esta tela existe para transformar isso numa fila de ações com consequência
 * declarada, em vez de sete painéis vazios espalhados que cada um lê como
 * "não uso esse recurso".
 *
 * A ordem vem do servidor (apagadas primeiro, maior consequência na frente) e
 * NÃO é reordenada aqui: duas ordens para a mesma lista é como nasce a divergência
 * que este repositório mais paga.
 */

type Linha = {
  chave: string; titulo: string;
  estado: "acesa" | "apagada" | "bloqueada";
  frase: string; comoAcender: string | null; onde: string | null;
  peso: number; configuradas: number;
};

type Resposta = {
  painel: Linha[];
  resumo: { apagadas: number; bloqueadas: number; acesas: number; total: number };
  naoMedidas: number;
};

const TINTA = {
  apagada: { faixa: "var(--atlas-estado-atencao)", rotulo: "APAGADA", classe: "cc6-warn" },
  bloqueada: { faixa: "var(--atlas-texto-fraco)", rotulo: "BLOQUEADA", classe: "" },
  acesa: { faixa: "var(--atlas-estado-sucesso)", rotulo: "NO AR", classe: "cc6-ok" },
} as const;

export function CapacidadeNoEscuroPanel() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarAcesas, setMostrarAcesas] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const resposta = await fetch("/api/v1/atlas/capacidade-no-escuro", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const corpo = await resposta.json();
      if (!resposta.ok || !corpo?.ok) {
        setErro(corpo?.error?.message || "Não foi possível medir o que está no ar.");
        return;
      }
      setDados(corpo.data as Resposta);
      setErro(null);
    } catch {
      setErro("Não foi possível falar com o servidor. A lista NÃO está vazia — ela não pôde ser lida.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const painel = dados?.painel ?? [];
  const visiveis = mostrarAcesas ? painel : painel.filter((l) => l.estado !== "acesa");

  return (
    <div className="cc6-panel overflow-hidden">
      <header className="px-5 pt-4 pb-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h2 className="text-base font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
            Construído e apagado
          </h2>
          <p className="cc6-eyebrow text-micro!">Capacidade que existe e espera configuração</p>
        </div>
        <p className="mt-1 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
          Nada aqui está quebrado. Cada linha é um recurso pronto que não produz nada porque falta
          um cadastro — e um painel vazio lê-se como <em>&ldquo;não uso&rdquo;</em>, não como <em>&ldquo;não liguei&rdquo;</em>.
        </p>
      </header>

      {erro ? (
        <div className="px-5 pb-3">
          <AtlasRecoverableError description={erro} onRetry={() => void carregar()} busy={carregando} />
        </div>
      ) : null}

      {dados ? (
        <div className="cc6-hairline flex flex-wrap items-baseline gap-x-5 gap-y-2 px-5 py-3">
          <p>
            <span className="cc6-metric-value cc6-warn text-numero leading-none">{dados.resumo.apagadas}</span>{" "}
            <span className="text-rotulo text-[var(--atlas-texto-fraco)]">esperando você</span>
          </p>
          <p>
            <span className="cc6-metric-value text-numero leading-none">{dados.resumo.bloqueadas}</span>{" "}
            <span className="text-rotulo text-[var(--atlas-texto-fraco)]">travadas por outro passo</span>
          </p>
          <p>
            <span className="cc6-metric-value cc6-ok text-numero leading-none">{dados.resumo.acesas}</span>{" "}
            <span className="text-rotulo text-[var(--atlas-texto-fraco)]">no ar</span>
          </p>
          {/* Contagem que não pôde ser feita precisa aparecer: sem isto, uma
              falha de leitura viraria "está tudo no ar" em silêncio. */}
          {dados.naoMedidas > 0 ? (
            <p className="cc6-warn text-rotulo">
              {dados.naoMedidas} não puderam ser medidas — o estado delas é desconhecido, não saudável.
            </p>
          ) : null}
        </div>
      ) : null}

      {carregando && !dados ? (
        <div className="space-y-2 p-5" aria-busy="true">
          {[1, 2, 3].map((i) => <AtlasSkeleton key={i} className="h-14" />)}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="cc6-hairline px-5 py-4">
          <AtlasEmpty
            reason="completed"
            eyebrow="Tudo ligado"
            title="Nenhuma capacidade apagada"
            description="Todos os recursos configuráveis desta operação estão produzindo."
          />
        </div>
      ) : (
        <ol>
          {visiveis.map((linha) => {
            const tinta = TINTA[linha.estado];
            return (
              <li
                key={linha.chave}
                className={`cc6-hairline px-5 py-3.5 ${linha.estado === "apagada" ? "cc6-sev-band" : ""}`}
                style={linha.estado === "apagada" ? ({ "--cc6-sev": tinta.faixa } as React.CSSProperties) : undefined}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold text-[var(--atlas-texto-forte)]">{linha.titulo}</h3>
                  <span className={`cc6-chip text-micro! ${tinta.classe}`}>{tinta.rotulo}</span>
                </div>
                {/* SEM `truncate`: esta frase é a CONSEQUÊNCIA, e consequência
                    cortada não convence ninguém a agir. */}
                <p className="mt-1 text-corpo leading-5 text-[var(--atlas-texto-fraco)]">{linha.frase}</p>
                {linha.comoAcender && linha.onde ? (
                  <Link href={linha.onde} className="atlas-button-secondary mt-2.5 inline-block">
                    {linha.comoAcender} →
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {painel.some((l) => l.estado === "acesa") ? (
        <div className="cc6-hairline px-5 py-2.5">
          <button type="button" onClick={() => setMostrarAcesas((v) => !v)} className="cc6-chip cc6-interativo cursor-pointer">
            {mostrarAcesas ? "ocultar as que já estão no ar" : `mostrar as ${painel.filter((l) => l.estado === "acesa").length} que já estão no ar`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
