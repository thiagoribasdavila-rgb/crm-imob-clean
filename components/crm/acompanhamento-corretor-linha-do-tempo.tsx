"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasEmpty } from "@/components/ui/AtlasUI";
import { CommercialContextTimelineEntry } from "@/components/crm/commercial-context-timeline-entry";
import { parseCommercialContextCorrectionTimeline } from "@/lib/atlas/commercial-context-timeline";

/**
 * A LINHA DO TEMPO QUE MOSTRA AS DUAS METADES.
 *
 * ── O QUE ESTAVA FALTANDO ───────────────────────────────────────────────────
 *
 * "Histórico do relacionamento" lia `lead_events` e só ela. Medido no banco
 * vivo em 2026-08-02: 444 leads têm movimentação registrada em
 * `pipeline_stage_moves`, 38 têm alguma linha em `lead_events`, e 419 têm
 * movimentação e NENHUM evento.
 *
 * Para essas 419 a ficha dizia "Nenhuma interação · Registre o primeiro contato
 * para iniciar a memória comercial" — sobre clientes cuja saída do funil está
 * gravada, com etapa de origem, autor, data e o motivo que o próprio corretor
 * foi obrigado a escolher (273 saídas com motivo gravado).
 *
 * ── A DECISÃO QUE ISTO MUDA ─────────────────────────────────────────────────
 *
 * Antes de rechamar, o corretor lê "Novos → Perdido · Sem resposta após
 * tentativas · cadência realizada, sem retorno · ddcorretorsp · 01/08". Isso
 * decide entre ligar de novo, mudar de canal ou não gastar o dia. Sem a
 * movimentação, ele ligava sem saber que a lead já tinha sido encerrada — e sem
 * saber por quê.
 *
 * ── AUSÊNCIA NÃO É ZERO ─────────────────────────────────────────────────────
 *
 * Falha de leitura vira "movimentação não medida", nunca lista vazia. E lead
 * anterior a 27/07/2026 sem movimento não é lead intocada: o ledger só começa
 * ali, e a tela diz isso com a data na frente.
 */

type InteracaoDaFicha = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  authorName?: string;
  metadata?: Record<string, unknown> | null;
  occurred_at: string;
};

type MovimentoDoLedger = {
  id: string;
  quando: string | null;
  de: string;
  para: string;
  paraChave: string | null;
  autor: string;
  motivoChave: string | null;
  motivoRotulo: string | null;
  notas: string | null;
  combinado: string | null;
  reversaoDe: string | null;
  desfeito: boolean;
};

type Ledger = {
  movimentos: MovimentoDoLedger[];
  total: number;
  ledgerDesde: string | null;
  medidoEm: string;
};

type Estado = "carregando" | "pronto" | "nao-medido";

/* As etapas que tiram a lead do funil. O tom da faixa vem daqui: saída é a
   linha que muda o dia de quem lê, avanço é notícia boa e o resto informa. */
const ETAPAS_DE_SAIDA = new Set(["perdido", "comprou_outro"]);

/**
 * ── POR QUE ESTA COR VAI NO `style`, E NÃO EM CLASSE ────────────────────────
 *
 * `app/globals.css` é INTEIRAMENTE unlayered, e lá vive
 * `:root[data-theme="light"] .cc6-num:not(.atlas-leads-table-panel *) { color:
 * #b45309 }`. Regra sem camada vence `@layer utilities` do Tailwind, então
 * `text-[var(--atlas-texto-medio)]` existe no HTML e não pinta: o carimbo de
 * autor e data saía ÂMBAR no tema claro.
 *
 * Dois problemas de uma vez, medidos em 02/08/2026 sobre `.cc6-panel-quiet`:
 * 4,35:1 aos 10px (abaixo do piso de 4,5) e, pior, âmbar é a tinta de ALERTA
 * deste produto — um carimbo de auditoria pintado de alerta diz que algo está
 * errado com toda linha do histórico.
 *
 * `style` é o único lugar que a regra unlayered não alcança. Medido no
 * navegador depois da troca: 8,97:1 no claro e 9,14:1 no escuro.
 */
const CARIMBO_DE_AUDITORIA = { color: "var(--atlas-texto-medio)" } as const;

function instante(valor: string | null): number {
  if (!valor) return 0;
  const tempo = new Date(valor).getTime();
  return Number.isFinite(tempo) ? tempo : 0;
}

function dataLegivel(valor: string | null): string {
  if (!valor) return "data não registrada";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "data não registrada";
  return data.toLocaleString("pt-BR");
}

export function AcompanhamentoCorretorLinhaDoTempo({
  leadId,
  interacoes,
}: {
  leadId: string;
  interacoes: InteracaoDaFicha[];
}) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [estado, setEstado] = useState<Estado>("carregando");

  useEffect(() => {
    let vivo = true;
    setEstado("carregando");
    void (async () => {
      try {
        const { data: sessao } = await supabase.auth.getSession();
        const resposta = await fetch(
          `/api/v1/acompanhamento-corretor/linha-do-tempo?leadId=${encodeURIComponent(leadId)}`,
          { headers: { Authorization: `Bearer ${sessao.session?.access_token || ""}` } },
        );
        if (!vivo) return;
        if (!resposta.ok) {
          setEstado("nao-medido");
          return;
        }
        const corpo = await resposta.json();
        if (!vivo) return;
        setLedger((corpo?.data ?? corpo) as Ledger);
        setEstado("pronto");
      } catch {
        if (vivo) setEstado("nao-medido");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [leadId]);

  const linha = useMemo(() => {
    const deInteracoes = interacoes.map((item) => ({
      chave: `interacao:${item.id}`,
      quando: item.occurred_at,
      ordem: instante(item.occurred_at),
      interacao: item,
      movimento: null as MovimentoDoLedger | null,
    }));
    const deMovimentos = (ledger?.movimentos ?? []).map((item) => ({
      chave: `movimento:${item.id}`,
      quando: item.quando,
      ordem: instante(item.quando),
      interacao: null as InteracaoDaFicha | null,
      movimento: item,
    }));
    // Ordem única e decrescente para as duas fontes: duas listas lado a lado
    // obrigariam quem lê a intercalar de cabeça, que é justamente o trabalho
    // que uma linha do tempo existe para tirar da pessoa.
    return [...deInteracoes, ...deMovimentos].sort((a, b) => b.ordem - a.ordem);
  }, [interacoes, ledger]);

  const totalMovimentos = ledger?.movimentos.length ?? 0;
  const naoMedido = estado === "nao-medido";

  return (
    <section className="cc6-panel" data-acompanhamento="linha-do-tempo-unificada">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-0 sm:px-6">
        <div>
          <p className="cc6-eyebrow">Timeline</p>
          <h2 className="mt-2 text-base font-semibold text-[var(--atlas-texto-forte)]">
            Histórico do relacionamento
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="cc6-chip" title="Ligações, notas, WhatsApp e correções registradas na ficha.">
            <strong className="cc6-num font-semibold">{interacoes.length}</strong> interações
          </span>
          {naoMedido ? (
            <span
              className="cc6-chip cc6-warn cc6-atencao"
              title="A leitura do registro de movimentação falhou. Nenhum número de movimentação é exibido — ausência de leitura não é ausência de movimento."
            >
              movimentação não medida
            </span>
          ) : (
            <span
              className="cc6-chip"
              title="Mudanças de etapa registradas na fonte canônica (pipeline_stage_moves), com autor e motivo."
            >
              <strong className="cc6-num font-semibold">
                {estado === "carregando" ? "—" : totalMovimentos}
              </strong>{" "}
              movimentações
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 max-h-[420px] overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
        {linha.length === 0 ? (
          <AtlasEmpty
            title={naoMedido ? "Movimentação não medida" : "Nenhum registro ainda"}
            description={
              naoMedido
                ? "A ficha não conseguiu ler o registro de movimentação desta lead. As interações continuam sendo exibidas; o que falta aqui é leitura, não necessariamente história."
                : ledger?.ledgerDesde
                  ? `Nem interação nem mudança de etapa. O registro de movimentação desta operação começa em ${new Date(ledger.ledgerDesde).toLocaleDateString("pt-BR")} — o que aconteceu antes disso não foi gravado por ninguém.`
                  : "Registre o primeiro contato para iniciar a memória comercial."
            }
          />
        ) : (
          <div className="space-y-2">
            {linha.map((item) =>
              item.movimento ? (
                <MovimentoNaLinha key={item.chave} movimento={item.movimento} />
              ) : (
                <InteracaoNaLinha key={item.chave} interacao={item.interacao!} />
              ),
            )}
          </div>
        )}
      </div>

      {!naoMedido && ledger?.ledgerDesde && linha.length > 0 ? (
        <p className="cc6-hairline mx-5 pb-5 pt-3 text-rotulo leading-5 text-[var(--atlas-texto-fraco)] sm:mx-6 sm:pb-6">
          Movimentação lida de <span className="cc6-num">pipeline_stage_moves</span>, a fonte gravada na mesma
          transação que muda a etapa. O registro começa em{" "}
          <span className="cc6-num">{new Date(ledger.ledgerDesde).toLocaleDateString("pt-BR")}</span>.
        </p>
      ) : null}
    </section>
  );
}

function InteracaoNaLinha({ interacao }: { interacao: InteracaoDaFicha }) {
  const correcao =
    interacao.type === "commercial_context_corrected"
      ? parseCommercialContextCorrectionTimeline(interacao.metadata)
      : null;

  return (
    <article className="cc6-panel-quiet cc6-interativo p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-corpo font-medium leading-6 text-[var(--atlas-texto-forte)]">{interacao.title}</p>
        <span className="cc6-chip shrink-0">{interacao.type}</span>
      </div>
      {!correcao && interacao.description ? (
        <p className="mt-1.5 text-corpo leading-6 text-[var(--atlas-texto-medio)]">{interacao.description}</p>
      ) : null}
      {correcao ? <CommercialContextTimelineEntry correction={correcao} /> : null}
      <p className="cc6-num mt-3 text-micro uppercase tracking-wider" style={CARIMBO_DE_AUDITORIA}>
        {interacao.authorName || "Equipe Atlas"} · {dataLegivel(interacao.occurred_at)}
      </p>
    </article>
  );
}

function MovimentoNaLinha({ movimento }: { movimento: MovimentoDoLedger }) {
  const saida = movimento.paraChave ? ETAPAS_DE_SAIDA.has(movimento.paraChave) : false;
  /* `cc6-sev-band` desenha a faixa lateral com a cor de `--cc6-sev`. Token, não
     hex: a faixa precisa virar com o tema, e cor cravada aqui foi o defeito que
     deixou 6 superfícies deste produto com faixa do tema escuro sobre painel
     branco. */
  const faixa = movimento.desfeito
    ? "var(--atlas-texto-fraco)"
    : saida
      ? "var(--atlas-estado-perigo)"
      : "var(--atlas-accent)";

  return (
    <article
      className="cc6-panel-quiet cc6-sev-band cc6-interativo p-4 pl-5"
      style={{ "--cc6-sev": faixa } as CSSProperties}
      data-movimento={saida ? "saida" : "avanco"}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className="text-corpo font-medium leading-6 text-[var(--atlas-texto-forte)]">
          {movimento.de} <span aria-hidden="true">→</span> {movimento.para}
          <span className="sr-only"> — mudou de etapa</span>
        </p>
        <span className="cc6-chip shrink-0">mudança de etapa</span>
      </div>

      {movimento.motivoRotulo ? (
        <p className="mt-1.5 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          <span className={saida ? "cc6-crit font-medium" : "font-medium"}>{movimento.motivoRotulo}</span>
          {movimento.notas ? <> · {movimento.notas}</> : null}
        </p>
      ) : saida ? (
        /* Saída sem motivo é FATO do registro, e dizê-lo é diferente de deixar em
           branco: 141 saídas do funil não têm motivo gravado (medido em
           02/08/2026), e branco ali se lê como "não teve motivo". */
        <p className="mt-1.5 text-corpo leading-6 text-[var(--atlas-texto-fraco)]">
          Motivo não gravado nesta saída.
        </p>
      ) : null}

      {movimento.combinado ? (
        <p className="mt-1.5 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          Combinado: {movimento.combinado}
        </p>
      ) : null}

      <p className="cc6-num mt-3 text-micro uppercase tracking-wider" style={CARIMBO_DE_AUDITORIA}>
        {movimento.autor} · {dataLegivel(movimento.quando)}
        {movimento.desfeito ? " · desfeito depois" : ""}
        {movimento.reversaoDe ? " · desfez uma movimentação anterior" : ""}
      </p>
    </article>
  );
}

export default AcompanhamentoCorretorLinhaDoTempo;
