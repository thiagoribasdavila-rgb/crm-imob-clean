"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";

/**
 * AS QUE SAÍRAM DIZENDO "NÃO ATENDEU" — E QUE NINGUÉM CHAMOU.
 *
 * ── O MOTIVO VOLTA PARA QUEM O DIGITOU ──────────────────────────────────────
 *
 * O corretor é OBRIGADO a escolher um motivo para descartar (a rota do pipeline
 * recusa `perdido` sem motivo desde 20/07/2026). Medido em 02/08/2026, o motivo
 * está gravado em 273 saídas — e não aparecia em nenhuma tela que o corretor
 * abre: o relatório de descartes exige papel de liderança. Ele paga o custo de
 * classificar e nunca recebe o resultado de volta.
 *
 * ── A DECISÃO ───────────────────────────────────────────────────────────────
 *
 * 252 saídas dizem "Sem resposta após tentativas". Em 250 delas o CRM não tem
 * NENHUM sinal de contato — nem evento de ligação/WhatsApp, nem
 * `first_contacted_at`. Lead que não atendeu cinco ligações é lead ruim; lead
 * que ninguém chamou é fila. Esta lista separa as duas e devolve a segunda para
 * o dia do corretor.
 *
 * ── O RECORTE DIZ OS DOIS LADOS, SEMPRE ─────────────────────────────────────
 *
 * A frase do cabeçalho imprime quantas entraram E quantas ficaram de fora, com
 * o porquê. Lista que encolhe sem dizer de quanto já esvaziou uma tela deste
 * produto sem erro nenhum — e ninguém percebeu porque não havia erro para ver.
 */

type ItemDaFila = {
  leadId: string;
  nome: string;
  telefone: string | null;
  fonte: string | null;
  score: number | null;
  saidaEm: string | null;
  deEtapa: string;
  notas: string | null;
};

type Payload = {
  escopo: "carteira" | "organizacao";
  fechadas: number;
  comSaidaNoLedger: number;
  semSaidaNoLedger: number;
  semMotivoGravado: number;
  motivos: Array<{ chave: string; rotulo: string; leads: number; semSinalDeContato: number }>;
  recuperaveis: {
    chave: string;
    rotulo: string;
    total: number;
    semSinalDeContato: number;
    comSinalDeContato: number;
    mostrando: number;
    itens: ItemDaFila[];
  };
  ledgerDesde: string | null;
  tentativasMensuraveis: boolean;
  medidoEm: string;
};

type Estado = "carregando" | "pronto" | "nao-medido";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

/**
 * ── UM NÚMERO NEUTRO DENTRO DO PAINEL SILENCIOSO ────────────────────────────
 *
 * `app/globals.css` é unlayered e declara
 * `:root[data-theme="light"] .cc6-num:not(.atlas-leads-table-panel *) { color:
 * #b45309 }` — âmbar em TODO `.cc6-num` do tema claro. Sobre `.cc6-panel` isso
 * mede 4,98:1 e passa; sobre `.cc6-panel-quiet`, que é mais escuro no claro,
 * cai para 4,35:1. Medido em 02/08/2026: 60 elementos, todos o mesmo — o score
 * dentro da pastilha de cada lead da fila.
 *
 * E o problema não é só o piso: âmbar é a tinta de ALERTA aqui. O score de uma
 * lead que saiu do funil não é alerta nenhum; pintá-lo assim faz sessenta
 * linhas gritarem juntas e nenhuma significar nada.
 *
 * Regra sem camada vence utilitário de `@layer`; `style` é o que sobra.
 */
const NUMERO_NEUTRO = { color: "var(--atlas-texto-forte)" } as const;

function diasDesde(valor: string | null, agora: number): number | null {
  if (!valor || !agora) return null;
  const tempo = new Date(valor).getTime();
  if (!Number.isFinite(tempo)) return null;
  return Math.max(0, Math.floor((agora - tempo) / 86_400_000));
}

export function AcompanhamentoCorretorFilaDeRecuperacao() {
  const [dados, setDados] = useState<Payload | null>(null);
  const [estado, setEstado] = useState<Estado>("carregando");
  /* O relógio entra por estado, e não por `Date.now()` no corpo: o servidor
     renderiza numa hora e o navegador em outra, e a diferença vira erro de
     hidratação em toda linha que mostra "há N dias". */
  const [agora, setAgora] = useState(0);

  useEffect(() => {
    setAgora(Date.now());
    let vivo = true;
    void (async () => {
      try {
        const { data: sessao } = await supabase.auth.getSession();
        const resposta = await fetch("/api/v1/acompanhamento-corretor/fila-de-recuperacao", {
          headers: { Authorization: `Bearer ${sessao.session?.access_token || ""}` },
        });
        if (!vivo) return;
        if (!resposta.ok) {
          setEstado("nao-medido");
          return;
        }
        const corpo = await resposta.json();
        if (!vivo) return;
        setDados((corpo?.data ?? corpo) as Payload);
        setEstado("pronto");
      } catch {
        if (vivo) setEstado("nao-medido");
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (estado === "carregando") {
    return (
      <section className="cc6-panel p-4 sm:p-5" aria-busy="true">
        <p className="cc6-eyebrow">Saídas do funil</p>
        <AtlasSkeleton className="mt-3 h-10" />
      </section>
    );
  }

  if (estado === "nao-medido" || !dados) {
    return (
      <section className="cc6-panel p-4 sm:p-5">
        <p className="cc6-eyebrow cc6-warn">Saídas do funil · não medido</p>
        <p className="mt-2 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          Não foi possível ler o registro de saídas agora. Isto NÃO significa que não há leads para rechamar —
          significa que a leitura falhou. Atualize a página em instantes.
        </p>
      </section>
    );
  }

  const fila = dados.recuperaveis;
  /* Sem saída registrada no ledger a tela não afirma nada sobre a operação:
     nenhuma barra, nenhum zero. O ledger é novo (começa em 27/07/2026) e a
     ausência dele é um fato do registro, não do atendimento. */
  if (dados.comSaidaNoLedger === 0) {
    return (
      <section className="cc6-panel p-4 sm:p-5">
        <p className="cc6-eyebrow">Saídas do funil</p>
        <p className="mt-2 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          {dados.fechadas > 0 ? (
            <>
              <span className="cc6-num">{dados.fechadas}</span> lead(s) fechada(s) no seu escopo, nenhuma com saída
              registrada.{" "}
              {dados.ledgerDesde
                ? `O registro de movimentação começa em ${new Date(dados.ledgerDesde).toLocaleDateString("pt-BR")} — o que saiu antes disso não foi gravado.`
                : "Ainda não há registro de movimentação nesta operação."}
            </>
          ) : (
            "Nenhuma lead fechada no seu escopo."
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="cc6-panel p-4 sm:p-5" data-acompanhamento="fila-de-recuperacao">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="cc6-eyebrow">Saídas do funil · motivo declarado</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
            {fila.semSinalDeContato > 0
              ? "Disseram “não atendeu” — e ninguém chamou"
              : "Toda saída por falta de resposta teve contato registrado"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="cc6-chip" title="Leads fechadas dentro do seu escopo de leitura.">
            <strong className="cc6-num font-semibold">{dados.fechadas}</strong> fechadas
          </span>
          <span
            className="cc6-chip"
            title="Saídas cujo motivo o sistema não gravou. Balde com nome: em branco, ele se leria como “sem motivo”."
          >
            <strong className={`cc6-num font-semibold ${dados.semMotivoGravado ? "cc6-warn" : ""}`}>
              {dados.semMotivoGravado}
            </strong>{" "}
            sem motivo gravado
          </span>
          {dados.semSaidaNoLedger > 0 ? (
            <span
              className="cc6-chip"
              title={
                dados.ledgerDesde
                  ? `Fecharam antes de ${new Date(dados.ledgerDesde).toLocaleDateString("pt-BR")}, quando o registro de movimentação começou. Não é motivo ausente: é período sem registro.`
                  : "Fecharam antes de existir registro de movimentação."
              }
            >
              <strong className="cc6-num font-semibold">{dados.semSaidaNoLedger}</strong> antes do registro
            </span>
          ) : null}
        </div>
      </header>

      {/* Os DOIS lados do recorte, em número, antes de qualquer lista. */}
      <p className="mt-3 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
        <strong className="cc6-num cc6-crit font-semibold">{fila.semSinalDeContato}</strong> de{" "}
        <span className="cc6-num">{fila.total}</span> saídas com o motivo “{fila.rotulo}” não têm nenhum sinal de
        contato no CRM — nem ligação, nem WhatsApp, nem primeiro contato registrado.{" "}
        {fila.comSinalDeContato > 0 ? (
          <>
            As outras <span className="cc6-num">{fila.comSinalDeContato}</span> têm, e ficam de fora desta lista de
            propósito.
          </>
        ) : (
          "Nenhuma ficou de fora: não há saída desse tipo com contato registrado."
        )}
        {!dados.tentativasMensuraveis ? (
          <> A leitura das tentativas falhou nesta consulta; trate a separação acima como não medida.</>
        ) : null}
      </p>

      {fila.semSinalDeContato > 0 ? (
        <details className="mt-3">
          <summary
            className={`flex cursor-pointer list-none items-center gap-2 rounded-xl py-2 text-corpo text-[var(--atlas-texto-forte)] [&::-webkit-details-marker]:hidden ${focusRing}`}
          >
            <span className="cc6-chip cc6-destaque">
              ver as <strong className="cc6-num font-semibold">{fila.mostrando}</strong> mais recentes
            </span>
            <span className="text-rotulo text-[var(--atlas-texto-fraco)]">
              cada uma abre a ficha; a etapa se muda no funil, com motivo
            </span>
          </summary>
          {/* A composição por motivo é AUDITORIA — ela explica de onde saem os
              números do cabeçalho, e não decide o dia de ninguém. Por isso vive
              aqui dentro: medido em 1440×900, a mesma fileira de pastilhas
              aberta custava 69px e empurrava a tabela da carteira de 946px para
              1.015px, ou seja, para fora da primeira tela. */}
          {dados.motivos.length > 1 ? (
            <ul
              className="mt-2 flex list-none flex-wrap items-center gap-2 p-0"
              aria-label="Motivos declarados nas saídas"
            >
              {dados.motivos.map((motivo) => (
                <li
                  key={motivo.chave}
                  className="cc6-chip"
                  title={`${motivo.semSinalDeContato} sem nenhum sinal de contato registrado.`}
                >
                  {motivo.rotulo} <strong className="cc6-num font-semibold">{motivo.leads}</strong>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-2 grid list-none gap-2 p-0">
            {fila.itens.map((item) => {
              const dias = diasDesde(item.saidaEm, agora);
              return (
                <li key={item.leadId}>
                  <Link
                    href={`/leads/${item.leadId}`}
                    className={`cc6-panel-quiet cc6-interativo-acento flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3 ${focusRing}`}
                  >
                    <span className="min-w-0">
                      <strong className="block truncate text-corpo font-semibold text-[var(--atlas-texto-forte)]">
                        {item.nome}
                      </strong>
                      <span className="mt-0.5 block truncate text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
                        saiu de {item.deEtapa}
                        {item.fonte ? ` · ${item.fonte}` : ""}
                        {item.notas ? ` · “${item.notas}”` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      {item.score !== null ? (
                        <span className="cc6-chip" title="Score de qualificação no momento da leitura.">
                          score{" "}
                          <strong className="cc6-num font-semibold" style={NUMERO_NEUTRO}>
                            {item.score}
                          </strong>
                        </span>
                      ) : null}
                      <span
                        className="cc6-chip"
                        title={
                          item.saidaEm
                            ? `Saiu do funil em ${new Date(item.saidaEm).toLocaleString("pt-BR")}.`
                            : "Data da saída não registrada."
                        }
                      >
                        {dias === null ? "data não registrada" : `saiu há ${dias}d`}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {fila.semSinalDeContato > fila.mostrando ? (
            <p className="mt-2 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
              Mostrando as <span className="cc6-num">{fila.mostrando}</span> saídas mais recentes de{" "}
              <span className="cc6-num">{fila.semSinalDeContato}</span>. As demais continuam na base — o recorte é da
              lista, não do fato.
            </p>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}

export default AcompanhamentoCorretorFilaDeRecuperacao;
