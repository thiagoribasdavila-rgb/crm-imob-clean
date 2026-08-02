"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/atlas/page-header";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { ConversaEstadoDoCanal } from "@/components/crm/conversa-estado-do-canal";
import { ConversaLista, type ConversaDaLista } from "@/components/crm/conversa-lista";
import type { DiagnosticoDoCanal, FatosDoCanal } from "@/app/api/v1/crm/conversations/diagnostico-do-canal";

/**
 * CONVERSAS — a tela que mostra o que existe e diz o que falta.
 *
 * ── O que ela lia antes ─────────────────────────────────────────────────────
 *
 * `lead_events`. Tabela MORTA — a fonte canônica de movimentação é
 * `pipeline_stage_moves`. Cada linha virava uma "interação", e o canal era
 * adivinhado por `includes()` no texto do `event_type`: uma mudança de etapa do
 * funil aparecia na caixa de entrada como se alguém tivesse conversado.
 *
 * As tabelas certas, `conversations` e `messages`, existem desde sempre, têm o
 * webhook da Cloud API e a ponte do corretor escrevendo nelas — e ZERO linhas.
 * A tela nunca as tinha lido.
 *
 * ── A regra desta tela ──────────────────────────────────────────────────────
 *
 * Vazio nunca é desenhado sozinho. Quando não há conversa, o maior objeto da
 * tela passa a ser o ESTADO DO CANAL, que responde a única pergunta que separa
 * as duas causas do mesmo zero: ninguém conversou, ou não há por onde conversar?
 *
 * E falha de leitura não vira zero: a rota devolve 503 e aqui isso vira um
 * recado de erro com o botão de tentar de novo — nunca uma lista vazia.
 */

type Resposta = {
  escopo: "organizacao" | "carteira";
  teto: number;
  truncado: boolean;
  fatos: FatosDoCanal;
  diagnostico: DiagnosticoDoCanal;
  conversas: ConversaDaLista[];
};

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; dados: Resposta };

export default function ConversationsPage() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  const carregar = useCallback(async () => {
    setEstado({ fase: "carregando" });
    try {
      const resposta = await fetch("/api/v1/crm/conversations", { cache: "no-store" });
      const corpo = await resposta.json();
      if (!resposta.ok || !corpo?.ok) {
        // A mensagem do servidor é preservada porque ela distingue "não
        // consegui ler" de "não há nada" — e as duas mandam a pessoa fazer
        // coisas opostas.
        setEstado({
          fase: "erro",
          mensagem: corpo?.error?.message || "Não foi possível ler as conversas agora.",
        });
        return;
      }
      setEstado({ fase: "pronto", dados: corpo.data as Resposta });
    } catch {
      setEstado({ fase: "erro", mensagem: "Não foi possível falar com o servidor para ler as conversas." });
    }
  }, []);

  useEffect(() => {
    void carregar();
    // A versão anterior desta tela recarregava ao voltar o foco para a aba. A
    // reescrita perdeu isso sem dizer, e numa caixa de entrada o custo é direto:
    // o corretor volta para a aba, vê a mesma lista de minutos atrás e conclui
    // que ninguém respondeu. Reposto aqui — agora relendo a rota certa.
    const reler = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    document.addEventListener("visibilitychange", reler);
    return () => document.removeEventListener("visibilitychange", reler);
  }, [carregar]);

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        eyebrow="Conversas"
        title="Conversas do meu escopo"
        description="O que foi falado com o cliente — lido das tabelas em que o webhook do WhatsApp e a ponte do corretor gravam."
      />

      {estado.fase === "carregando" ? (
        <div className="grid gap-3" aria-busy="true">
          <AtlasSkeleton className="h-40" />
          <AtlasSkeleton className="h-24" />
        </div>
      ) : null}

      {estado.fase === "erro" ? (
        <section className="cc6-panel p-4 sm:p-5" role="alert">
          <h2 className="text-sm font-semibold tracking-tight text-[var(--atlas-text-primary)]">Não foi possível ler as conversas</h2>
          <p className="mt-1.5 max-w-[68ch] text-[13px] leading-6 text-[var(--atlas-text-secondary)]">{estado.mensagem}</p>
          <p className="mt-1.5 text-xs leading-5 text-[var(--atlas-text-tertiary)]">
            Isto <strong>não</strong> quer dizer que não há conversas — quer dizer que não deu para olhar agora.
          </p>
          <button
            type="button"
            onClick={() => void carregar()}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-[var(--atlas-border)] px-4 text-[13px] font-semibold text-[var(--atlas-text-primary)] transition-colors hover:border-[var(--atlas-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
          >
            Tentar ler de novo
          </button>
        </section>
      ) : null}

      {estado.fase === "pronto" ? (
        <>
          {/* Hierarquia por consequência: quando não há conversa, o estado do
              canal é o maior objeto da tela — ele é a resposta, não o rodapé. */}
          <ConversaEstadoDoCanal
            diagnostico={estado.dados.diagnostico}
            fatos={estado.dados.fatos}
            escopo={estado.dados.escopo}
          />

          <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "60ms" }} aria-labelledby="lista-de-conversas">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="lista-de-conversas" className="text-sm font-semibold tracking-tight text-[var(--atlas-text-primary)]">
                Conversas registradas
              </h2>
              <span className="cc6-chip" title="Conversas do seu escopo (tabela conversations) e o total de mensagens (tabela messages) que pertencem a elas.">
                {estado.dados.fatos.conversas} conversa(s) · {estado.dados.fatos.mensagens} mensagem(ns)
              </span>
            </header>

            <div className="mt-3">
              {estado.dados.conversas.length === 0 ? (
                <p className="max-w-[68ch] text-[13px] leading-6 text-[var(--atlas-text-secondary)]">
                  {estado.dados.diagnostico.leituraDoZero === "canal_desligado"
                    ? "Nada para listar, e o motivo está no painel acima: nenhuma mensagem teria como chegar até aqui. Esta lista vazia não mede a operação."
                    : "Nenhuma conversa no seu escopo ainda. O canal recebe — então este vazio é sobre quem ainda não foi procurado, e não sobre a instalação."}
                </p>
              ) : (
                <ConversaLista
                  conversas={estado.dados.conversas}
                  truncado={estado.dados.truncado}
                  teto={estado.dados.teto}
                />
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
