"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { formatarDuracaoEmMinutos } from "@/lib/crm/cadencia-do-atendimento";

/**
 * CADÊNCIA E VOLUME DE TRABALHO — com o tamanho da amostra colado no número.
 *
 * ── O QUE O DONO PEDIU, E O QUE A BASE SUSTENTA ─────────────────────────────
 *
 * O pedido foi "toda a cadência e os contatos para analisar volume de trabalho
 * e efetividade na conversão". Medido no banco vivo em 02/08/2026:
 *
 *   478 movimentos · 444 leads · 2 pessoas (477 e 1)
 *   429 das 444 leads têm UM ÚNICO movimento — 96,6%
 *    34 intervalos entre toques na base inteira, em 15 leads
 *    13 desses 34 duram menos de 5 minutos (edição em lote, não cadência)
 *    50 contatos registrados em `lead_events` (36 ligações, 14 WhatsApp)
 *
 * Esse último número já foi lido como ZERO por esta tela: a rota contava em
 * `activities`, que nunca recebe contato. A frase "nenhuma ligação deixa
 * rastro" chegou a ser desenhada com 50 contatos no banco. O contador agora lê
 * `lead_events`, a mesma tabela de onde sai `EVENTOS_DE_TENTATIVA`.
 *
 * Volume existe e é publicado. Cadência existe em 15 leads e é publicada COM o
 * denominador. Taxa de conversão por pessoa NÃO é publicada, e a tela diz por
 * quê — as duas fontes de venda do sistema apontam leads diferentes.
 *
 * ── POR QUE ISTO NÃO É UM PLACAR ────────────────────────────────────────────
 *
 * `/brokers` promete no próprio texto que não há ranking punitivo de pessoas.
 * Uma tabela de cadência por corretor teria uma linha com 33 intervalos e outra
 * com zero: a comparação existiria na tela sem existir no dado. A concentração
 * é publicada como ressalva, acima da lista, e não como coluna de placar.
 *
 * ── A REGRA DE PINTURA ──────────────────────────────────────────────────────
 *
 * `app/globals.css` é unlayered e pinta `.cc6-num` de âmbar no tema claro,
 * vencendo `@layer utilities`. Contagem neutra usa `style` — o único lugar que
 * a regra unlayered não alcança — para não virar alerta. É o mesmo remédio já
 * aplicado no bloco de movimentação por pessoa.
 */

type Mediana = { valor: number | null; amostra: number; suficiente: boolean };

type Medicao = { medido: boolean; valor: number | null; amostra: number; porque: string | null };

type PessoaNaCadencia = {
  id: string;
  nome: string;
  papel: string;
  movimentos: number;
  leadsTocadas: number;
  diasAtivos: number;
  movimentosPorDiaAtivo: number | null;
  ultimoEm: string | null;
};

type Payload = {
  escopo: "carteira" | "organizacao";
  dias: number;
  desde: string;
  ledgerDesde: string | null;
  cadencia: {
    intervaloMediano: Mediana;
    intervalosDeTrabalho: number;
    intervalosDeLote: number;
    leadsComIntervalo: number;
    leadsComToqueUnico: number;
    fracaoComToqueUnico: number | null;
    pisoDeLoteMin: number;
  };
  toquesParaAvancar: Medicao;
  concentracao: {
    totalDeMovimentos: number;
    pessoas: number;
    pessoasComVolume: number;
    maiorFatia: number | null;
    comparavel: boolean;
    porque: string;
  };
  conversao: {
    concordam: number;
    divergem: number;
    porStatus: number;
    porLedger: number;
    afirmavel: boolean;
    porque: string;
  } | null;
  vendaMensuravel: boolean;
  pessoas: PessoaNaCadencia[];
  /** `null` = a leitura de contato falhou. `false` = medi, e não há nenhum. */
  contatoRegistrado: boolean | null;
  contatosRegistrados: number | null;
  medidoEm: string;
};

type Estado = "carregando" | "pronto" | "nao-medido";

const NUMERO_NEUTRO = { color: "var(--atlas-texto-forte)" } as const;

const ROTULO_DO_PAPEL: Record<string, string> = {
  director: "Diretor",
  superintendent: "Superintendente",
  manager: "Gerente",
  broker: "Corretor",
  admin: "Diretor",
};

/**
 * O losango marca "sem lastro para afirmar".
 *
 * É o único canal desta seção que não é cor: `cc6-warn` sozinho não chega a
 * quem não distingue o âmbar, e a distinção entre "medi" e "não consigo medir"
 * é o assunto inteiro do bloco. `aria-hidden` porque a frase ao lado já diz.
 */
function SemLastro({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
      <span aria-hidden="true">◈ </span>
      {children}
    </p>
  );
}

export function AcompanhamentoCorretorCadencia() {
  const [dados, setDados] = useState<Payload | null>(null);
  const [estado, setEstado] = useState<Estado>("carregando");

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const { data: sessao } = await supabase.auth.getSession();
        const resposta = await fetch("/api/v1/acompanhamento-corretor/cadencia?dias=30", {
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
        <p className="cc6-eyebrow">Cadência e volume de trabalho</p>
        <AtlasSkeleton className="mt-3 h-24" />
      </section>
    );
  }

  if (estado === "nao-medido" || !dados) {
    return (
      <section className="cc6-panel p-4 sm:p-5">
        <p className="cc6-eyebrow cc6-warn">Cadência e volume · não medido</p>
        <p className="mt-2 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          Não foi possível ler o registro de movimentação agora. Nenhum número é exibido: zero aqui se leria como
          “ninguém trabalhou”, que é uma afirmação diferente de “não consegui olhar”.
        </p>
      </section>
    );
  }

  const { cadencia, concentracao, conversao, toquesParaAvancar } = dados;
  const intervalo = formatarDuracaoEmMinutos(cadencia.intervaloMediano.valor);
  const leadsTocadas = cadencia.leadsComIntervalo + cadencia.leadsComToqueUnico;
  const percentualToqueUnico =
    cadencia.fracaoComToqueUnico === null ? null : Math.round(cadencia.fracaoComToqueUnico * 100);

  return (
    <section className="cc6-panel p-4 sm:p-5" data-acompanhamento="cadencia">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <p className="cc6-eyebrow">Cadência e volume · {dados.dias} dias</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
            Quanto se trabalhou, e com que intervalo
          </h2>
        </div>
        <span className="cc6-chip" title="Mudanças de etapa registradas na janela, já descontadas as desfeitas.">
          <strong className="cc6-num font-semibold">{concentracao.totalDeMovimentos}</strong> movimentações
        </span>
      </header>

      {/* ── O BURACO, ANTES DE QUALQUER NÚMERO ──────────────────────────────
          Sem esta frase, movimentação de funil seria lida como contato — e o
          gestor concluiria que a equipe fala com 478 clientes por semana. */}
      {dados.contatoRegistrado === null ? (
        <SemLastro>
          Não foi possível conferir se existe contato registrado. Os números abaixo continuam sendo apenas movimentação
          de funil.
        </SemLastro>
      ) : dados.contatoRegistrado === false ? (
        <SemLastro>
          Nenhuma ligação, WhatsApp ou e-mail deixa rastro no CRM até hoje. Tudo abaixo é{" "}
          <strong className="font-semibold text-[var(--atlas-texto-forte)]">movimentação de funil</strong> — a etapa
          sendo mudada —, que é o trabalho que o sistema consegue ver, não o trabalho que aconteceu.
        </SemLastro>
      ) : (
        <p className="mt-2 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          <span className="cc6-num">{dados.contatosRegistrados}</span> contatos já registrados no CRM (ligação,
          WhatsApp ou e-mail). Os números de cadência abaixo ainda saem da movimentação de funil — quando o histórico
          de contato tiver volume, ele passa a ser a fonte mais fiel do trabalho.
        </p>
      )}

      {/* ── CADÊNCIA ────────────────────────────────────────────────────── */}
      <div className="cc6-hairline mt-3 pt-3">
        <p className="cc6-eyebrow">Intervalo entre toques na mesma lead</p>
        {cadencia.intervaloMediano.suficiente && intervalo ? (
          <>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
              <span className="cc6-metric-value text-2xl leading-none" style={NUMERO_NEUTRO}>
                {intervalo}
              </span>
              <span className="text-rotulo text-[var(--atlas-texto-fraco)]">
                mediana de <span className="cc6-num">{cadencia.intervaloMediano.amostra}</span> intervalos em{" "}
                <span className="cc6-num">{cadencia.leadsComIntervalo}</span> leads
              </span>
            </p>
            <p className="mt-2 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
              A amostra viaja junto do número de propósito: uma mediana apoiada em poucas leads descreve essas leads,
              não a operação.
            </p>
          </>
        ) : (
          <SemLastro>
            Ainda não há intervalo que sustente uma mediana —{" "}
            <span className="cc6-num">{cadencia.intervaloMediano.amostra}</span>{" "}
            {cadencia.intervaloMediano.amostra === 1 ? "intervalo registrado" : "intervalos registrados"} na janela.
            Cadência precisa de um segundo toque na mesma lead, e é justamente ele que quase não existe.
          </SemLastro>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {percentualToqueUnico !== null && leadsTocadas > 0 ? (
            <span
              className={`cc6-chip ${percentualToqueUnico >= 80 ? "cc6-warn cc6-atencao" : ""}`}
              title="Leads que receberam um único movimento no funil. Nelas o intervalo entre toques não é zero: ele não existe."
            >
              <strong className="cc6-num font-semibold">{cadencia.leadsComToqueUnico}</strong> de{" "}
              <span className="cc6-num">{leadsTocadas}</span> leads com um só toque ({percentualToqueUnico}%)
            </span>
          ) : null}
          {cadencia.intervalosDeLote > 0 ? (
            <span
              className="cc6-chip"
              title={`Intervalos abaixo de ${cadencia.pisoDeLoteMin} minutos entre dois movimentos da mesma lead. Ninguém liga duas vezes para a mesma pessoa nesse tempo — é o funil sendo arrumado numa sentada, e por isso não entra na mediana.`}
            >
              <strong className="cc6-num font-semibold">{cadencia.intervalosDeLote}</strong> descartados como edição em
              lote
            </span>
          ) : null}
        </div>
      </div>

      {/* ── TOQUES ATÉ AVANÇAR ──────────────────────────────────────────── */}
      <div className="cc6-hairline mt-3 pt-3">
        <p className="cc6-eyebrow">Toques até a lead avançar de etapa</p>
        {toquesParaAvancar.medido && toquesParaAvancar.valor !== null ? (
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <span className="cc6-metric-value text-2xl leading-none" style={NUMERO_NEUTRO}>
              {toquesParaAvancar.valor}
            </span>
            <span className="text-rotulo text-[var(--atlas-texto-fraco)]">
              mediana de <span className="cc6-num">{toquesParaAvancar.amostra}</span> leads que avançaram
            </span>
          </p>
        ) : (
          <SemLastro>{toquesParaAvancar.porque}</SemLastro>
        )}
      </div>

      {/* ── CONVERSÃO: A RECUSA EXPLÍCITA ───────────────────────────────── */}
      <div className="cc6-hairline mt-3 pt-3">
        <p className="cc6-eyebrow">Efetividade na conversão</p>
        {conversao === null ? (
          /* `conversao: null` tem DUAS causas na rota — escopo de carteira e
             falha ao ler uma das fontes de venda. Atribuir sempre a primeira
             faria a tela explicar ao diretor, com segurança, um motivo que não
             é o dele. Motivo errado dito com confiança é pior que motivo
             ausente: ninguém vai procurar o erro que a tela já explicou. */
          <SemLastro>
            {dados.escopo === "carteira"
              ? "A conversão não é confrontada na visão de carteira: as duas fontes de venda são lidas por critérios diferentes (dono da lead e autor do movimento) e o confronto sairia distorcido."
              : "Não foi possível ler as duas fontes de venda agora. Nenhum número de conversão é desenhado — zero aqui se leria como “ninguém vendeu”."}
          </SemLastro>
        ) : conversao.afirmavel ? (
          <p className="mt-1.5 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
            <span className="cc6-num">{conversao.concordam}</span> vendas confirmadas pelas duas fontes.
          </p>
        ) : (
          <>
            <SemLastro>{conversao.porque}</SemLastro>
            {conversao.divergem > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="cc6-chip" title="Leads com etapa 'Ganhos' na ficha.">
                  <strong className="cc6-num font-semibold">{conversao.porStatus}</strong> pela etapa da lead
                </span>
                <span className="cc6-chip" title="Leads com um movimento registrado para 'Ganhos' no histórico do funil.">
                  <strong className="cc6-num font-semibold">{conversao.porLedger}</strong> pelo histórico do funil
                </span>
                <span
                  className="cc6-chip cc6-warn cc6-atencao"
                  title="Leads reconhecidas como venda pelas duas fontes ao mesmo tempo. Enquanto as fontes discordam, qualquer taxa depende de qual delas se pergunta."
                >
                  <strong className="cc6-num font-semibold">{conversao.concordam}</strong> nas duas
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* ── VOLUME POR PESSOA ───────────────────────────────────────────── */}
      <div className="cc6-hairline mt-3 pt-3">
        <p className="cc6-eyebrow">Volume por pessoa</p>
        {!concentracao.comparavel ? (
          <SemLastro>{concentracao.porque}</SemLastro>
        ) : (
          <p className="mt-2 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
            Ordenado por volume de movimentação — é o que houve, não uma nota de desempenho.
          </p>
        )}

        {dados.pessoas.length ? (
          <div className="cc6-hairline mt-2">
            {dados.pessoas.map((pessoa) => (
              <article
                key={pessoa.id}
                className="flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--atlas-texto-fraco)_16%,transparent)] py-3 first:border-t-0 md:flex-row md:items-center md:justify-between md:gap-6"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--atlas-texto-forte)]">{pessoa.nome}</p>
                  <p className="mt-1 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
                    {ROTULO_DO_PAPEL[pessoa.papel] || pessoa.papel}
                    {pessoa.ultimoEm
                      ? ` · último movimento em ${new Date(pessoa.ultimoEm).toLocaleDateString("pt-BR")}`
                      : " · nenhum movimento na janela"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-x-8 gap-y-2 md:text-right">
                  {(
                    [
                      ["movimentações", pessoa.movimentos],
                      ["leads tocadas", pessoa.leadsTocadas],
                      ["dias ativos", pessoa.diasAtivos],
                      ["por dia ativo", pessoa.movimentosPorDiaAtivo ?? "—"],
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
            ))}
          </div>
        ) : (
          <SemLastro>
            Ninguém no seu escopo registrou movimentação nos últimos <span className="cc6-num">{dados.dias}</span> dias.
          </SemLastro>
        )}
      </div>

      <p className="cc6-hairline mt-3 pt-3 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
        “Por dia ativo” divide pelos dias em que a pessoa moveu alguma coisa, não pelos{" "}
        <span className="cc6-num">{dados.dias}</span> dias da janela: dividir pela janela transformaria férias em baixo
        desempenho. Quando ligação e WhatsApp passarem a ser registrados, esta mesma leitura passa a medir contato sem
        mudar de forma.
      </p>
    </section>
  );
}

export default AcompanhamentoCorretorCadencia;
