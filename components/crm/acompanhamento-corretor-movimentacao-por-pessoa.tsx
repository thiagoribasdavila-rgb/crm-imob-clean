"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";

/**
 * O QUE CADA CARTEIRA MOVEU NO FUNIL.
 *
 * ── O QUE A TELA DE EQUIPE NÃO DIZIA ────────────────────────────────────────
 *
 * `/brokers` mostra ESTADO: carteira, quentes, atraso, sem próxima ação. Estado
 * não responde se o funil está sendo alimentado enquanto o trabalho acontece.
 *
 * Medido no ledger em 02/08/2026, numa única carteira com 477 movimentos:
 * 413 saídas do funil, das quais 404 partiram direto de "Novos" — e 250 delas
 * carregam a nota "cadência realizada, sem retorno". As duas coisas não se
 * encaixam: uma cadência produz passagem por "Contato". Ou a etapa não é
 * atualizada durante o trabalho, ou a cadência não aconteceu.
 *
 * ── A DECISÃO ───────────────────────────────────────────────────────────────
 *
 * A liderança decide entre duas conversas diferentes: "atualize a etapa quando
 * falar com a pessoa" ou "por que essas leads não foram trabalhadas?". Sem esta
 * leitura as duas ficam invisíveis, porque a carteira parecia limpa — as leads
 * saíram do funil.
 *
 * ── NÃO É RANKING, E A ORDEM PROVA ──────────────────────────────────────────
 *
 * A ordem é por VOLUME de movimentação, não por um peso de desempenho, e
 * ninguém é escondido: quem não moveu nada aparece com zero movimentos desde
 * que tenha carteira aberta. A página inteira já declara que não faz ranking
 * punitivo de pessoas; um bloco que ordenasse por "pior" quebraria a promessa.
 */

type PessoaNaMovimentacao = {
  id: string;
  nome: string;
  papel: string;
  movimentos: number;
  avancos: number;
  saidas: number;
  saidasSemPassarPorContato: number;
  saidasSemMotivo: number;
  leadsTocadas: number;
  ultimoEm: string | null;
  carteiraAberta: number;
  carteiraSemMovimento: number;
};

type Payload = {
  escopo: "carteira" | "organizacao";
  dias: number;
  desde: string;
  ledgerDesde: string | null;
  totalMovimentos: number;
  pessoas: PessoaNaMovimentacao[];
  carteiraMensuravel: boolean;
  medidoEm: string;
};

type Estado = "carregando" | "pronto" | "nao-medido";

/**
 * ── OS QUATRO NÚMEROS DA PESSOA SÃO CONTAGEM, NÃO ALERTA ────────────────────
 *
 * `app/globals.css` é unlayered e declara
 * `:root[data-theme="light"] .cc6-num:not(.atlas-leads-table-panel *) { color:
 * #b45309 }`. Regra sem camada vence `@layer utilities`, então o
 * `text-[var(--atlas-texto-forte)]` escrito abaixo EXISTE no HTML e não pinta.
 *
 * Medido no navegador em 02/08/2026, tema claro: os quatro valores
 * (movimentações, avanços, saídas, leads tocadas) computavam `rgb(180,83,9)` —
 * o âmbar de ALERTA deste produto. Passa no piso de contraste (4,98:1) e mesmo
 * assim mente: pintados de alerta, ficam indistinguíveis da única pastilha que
 * de fato alerta ("404 de 413 saídas sem passar por contato"). Quando tudo
 * grita, nada significa.
 *
 * `style` é o único lugar que a regra unlayered não alcança — é o mesmo remédio
 * já aplicado ao carimbo da linha do tempo e ao score da fila de recuperação.
 */
const NUMERO_NEUTRO = { color: "var(--atlas-texto-forte)" } as const;

const ROTULO_DO_PAPEL: Record<string, string> = {
  director: "Diretor",
  superintendent: "Superintendente",
  manager: "Gerente",
  broker: "Corretor",
  admin: "Diretor",
};

export function AcompanhamentoCorretorMovimentacaoPorPessoa() {
  const [dados, setDados] = useState<Payload | null>(null);
  const [estado, setEstado] = useState<Estado>("carregando");

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const { data: sessao } = await supabase.auth.getSession();
        const resposta = await fetch("/api/v1/acompanhamento-corretor/movimentacao-por-pessoa?dias=30", {
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
        <p className="cc6-eyebrow">Movimentação do funil</p>
        <AtlasSkeleton className="mt-3 h-20" />
      </section>
    );
  }

  if (estado === "nao-medido" || !dados) {
    return (
      <section className="cc6-panel p-4 sm:p-5">
        <p className="cc6-eyebrow cc6-warn">Movimentação do funil · não medido</p>
        <p className="mt-2 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          Não foi possível ler o registro de movimentação agora. Nenhum número é exibido: zero aqui se leria como
          “ninguém mexeu no funil”, que é uma afirmação diferente de “não consegui olhar”.
        </p>
      </section>
    );
  }

  if (!dados.pessoas.length) {
    return (
      <section className="cc6-panel p-4 sm:p-5">
        <p className="cc6-eyebrow">Movimentação do funil</p>
        <p className="mt-2 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          Ninguém no seu escopo tem carteira aberta ou movimentação registrada nos últimos{" "}
          <span className="cc6-num">{dados.dias}</span> dias.
        </p>
      </section>
    );
  }

  const inicioDoLedgerDentroDaJanela =
    dados.ledgerDesde && new Date(dados.ledgerDesde).getTime() > new Date(dados.desde).getTime();

  return (
    <section className="cc6-panel p-4 sm:p-5" data-acompanhamento="movimentacao-por-pessoa">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <p className="cc6-eyebrow">Movimentação do funil · {dados.dias} dias</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
            O que cada carteira moveu
          </h2>
        </div>
        <span className="cc6-chip" title="Mudanças de etapa registradas na janela, já descontadas as desfeitas.">
          <strong className="cc6-num font-semibold">{dados.totalMovimentos}</strong> movimentações
        </span>
      </header>

      <p className="mt-2 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
        Ordenada por volume de movimentação — não é ranking de desempenho, e ninguém foi escondido.
        {inicioDoLedgerDentroDaJanela ? (
          <>
            {" "}
            O registro de movimentação começa em{" "}
            <span className="cc6-num">{new Date(dados.ledgerDesde!).toLocaleDateString("pt-BR")}</span>: a janela é
            maior que o registro, e o que veio antes não foi gravado por ninguém.
          </>
        ) : null}
      </p>

      <div className="cc6-hairline mt-3">
        {dados.pessoas.map((pessoa) => {
          const saidasDiretas = pessoa.saidasSemPassarPorContato;
          const contradiz = pessoa.saidas > 0 && saidasDiretas > 0;
          return (
            <article
              key={pessoa.id}
              className="flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--atlas-texto-fraco)_16%,transparent)] py-4 first:border-t-0 md:flex-row md:items-center md:justify-between md:gap-6"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--atlas-texto-forte)]">{pessoa.nome}</p>
                <p className="mt-1 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
                  {ROTULO_DO_PAPEL[pessoa.papel] || pessoa.papel}
                  {pessoa.ultimoEm
                    ? ` · último movimento em ${new Date(pessoa.ultimoEm).toLocaleDateString("pt-BR")}`
                    : " · nenhum movimento na janela"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {contradiz ? (
                    <span
                      className="cc6-chip cc6-warn cc6-atencao"
                      /* A frase diz exatamente o que a conta faz: a etapa de ORIGEM
                         da saída é "Novos". Dizer "nunca passou por Contato" seria
                         mais forte do que o recorte — medido em 02/08/2026, 2 das
                         404 chegaram a "Contato" e voltaram para "Novos" antes de
                         sair. Promessa maior que a conta é como um número certo
                         vira uma acusação errada. */
                      title="Saíram do funil com a etapa de origem em Novos — a última etapa antes da saída foi a de entrada. Ou a etapa não é atualizada durante o trabalho, ou o contato não aconteceu."
                    >
                      <strong className="cc6-num font-semibold">{saidasDiretas}</strong> de{" "}
                      <span className="cc6-num">{pessoa.saidas}</span> saídas partindo de Novos
                    </span>
                  ) : null}
                  {pessoa.saidasSemMotivo > 0 ? (
                    <span
                      className="cc6-chip"
                      title="Saídas em que o motivo não ficou gravado no registro. Não é o corretor que deixou de escolher: é o que o sistema guardou."
                    >
                      <strong className="cc6-num font-semibold">{pessoa.saidasSemMotivo}</strong> sem motivo gravado
                    </span>
                  ) : null}
                  {dados.carteiraMensuravel && pessoa.carteiraSemMovimento > 0 ? (
                    <span
                      className="cc6-chip"
                      title="Leads abertas na carteira sobre as quais o funil nunca registrou movimento nenhum — nem entrada de etapa, nem saída."
                    >
                      <strong className="cc6-num font-semibold">{pessoa.carteiraSemMovimento}</strong> abertas sem
                      movimento
                    </span>
                  ) : null}
                  {!dados.carteiraMensuravel ? (
                    <span className="cc6-chip cc6-warn cc6-atencao" title="A leitura da carteira falhou nesta consulta.">
                      carteira não medida
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-x-8 gap-y-2 md:text-right">
                {(
                  [
                    ["movimentações", pessoa.movimentos],
                    ["avanços", pessoa.avancos],
                    ["saídas", pessoa.saidas],
                    ["leads tocadas", pessoa.leadsTocadas],
                  ] as const
                ).map(([rotulo, valor]) => (
                  <div key={rotulo}>
                    <p className="cc6-num text-sm font-semibold" style={NUMERO_NEUTRO}>
                      {valor}
                    </p>
                    <p className="cc6-metric-label">{rotulo}</p>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <p className="cc6-hairline mt-3 pt-3 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
        Lido de <span className="cc6-num">pipeline_stage_moves</span>, a única escrita na mesma transação que muda a
        etapa. Trabalho feito fora do CRM não aparece aqui — e é exatamente essa a conversa que os números acima
        pedem.
      </p>
    </section>
  );
}

export default AcompanhamentoCorretorMovimentacaoPorPessoa;
