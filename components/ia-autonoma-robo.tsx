"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

import { supabase } from "@/lib/supabase";
import {
  GLIFO_DA_POSTURA,
  ROTULO_DA_POSTURA,
  type CapacidadeDaIa,
  type ClasseDeMotivo,
  type EstadoDaIa,
  type RepartoDeRoteamento,
  type ValidadeDaProposta,
} from "@/lib/ai/ia-autonoma-estado";

/**
 * O ROBÔ, E A REGRA QUE ELE NÃO PODE QUEBRAR.
 *
 * Medido no banco canônico em 02/08/2026: `atlas_agent_runs`,
 * `ai_sales_journeys`, `meta_executions`, `nightly_broker_handoffs` e
 * `integration_health_snapshots` estão todas em ZERO. A IA foi construída e
 * nunca executou nada.
 *
 * Um robô animado dizendo "trabalhando" sobre esse banco seria a pior classe de
 * defeito deste repositório. Então ele diz o contrário, com número: o que
 * analisou, o que preparou, o que espera assinatura, e POR QUE não agiu. A
 * postura vem de `derivarEstadoDaIa` e não tem um estado "ativo" que a
 * contagem não sustente — `executando` só aparece se alguma das cinco tabelas
 * tiver linha.
 *
 * ── EMOJI ─────────────────────────────────────────────────────────────────
 * Um só, preso à POSTURA (⏸ ⏳ ⚙️ ❓), mais ⚠ para proposta vencida. São
 * pictogramas do próprio estado: mudam quando o estado muda. Nenhum marca
 * seção — emoji de seção é assinatura visual de texto gerado por máquina.
 */

type Resposta = EstadoDaIa & {
  lidoPelaCerca: { orquestracao: number | null; sombra: number | null; aprovacoes: number | null; consumo: number | null };
  janelaDias: number;
  truncado: boolean;
  lidoEm: string;
};

type Situacao = { fase: "carregando" } | { fase: "erro"; motivo: string } | { fase: "pronto"; estado: Resposta };

export function useEstadoDaIa(): Situacao {
  const [situacao, setSituacao] = useState<Situacao>({ fase: "carregando" });

  const carregar = useCallback(async (vivo: () => boolean) => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (vivo()) setSituacao({ fase: "erro", motivo: "Sessão expirada — entre de novo para eu ler o meu histórico." });
        return;
      }
      const resposta = await fetch("/api/ia-autonoma-estado", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const corpo = (await resposta.json().catch(() => null)) as { ok?: boolean; data?: Resposta } | null;
      if (!vivo()) return;
      if (!resposta.ok || !corpo?.ok || !corpo.data) {
        setSituacao({ fase: "erro", motivo: "Não consegui ler o meu histórico agora. Nenhum número é exibido de propósito." });
        return;
      }
      setSituacao({ fase: "pronto", estado: corpo.data });
    } catch {
      if (vivo()) setSituacao({ fase: "erro", motivo: "A leitura falhou. Prefiro não mostrar número a mostrar número errado." });
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    void carregar(() => ativo);
    return () => {
      ativo = false;
    };
  }, [carregar]);

  return situacao;
}

/** Banda lateral por classe. Cinza para governança de propósito: "funcionando
 *  como contratado" não deve gritar a mesma cor de "alguém precisa agir". */
const COR_DA_CLASSE: Record<ClasseDeMotivo, string> = {
  governanca: "var(--atlas-texto-fraco)",
  assinatura: "var(--atlas-estado-atencao)",
  configuracao: "var(--atlas-accent)",
  leitura: "var(--atlas-estado-perigo)",
};

const NOME_DA_CLASSE: Record<ClasseDeMotivo, string> = {
  governanca: "governança",
  assinatura: "espera assinatura",
  configuracao: "configuração",
  leitura: "leitura",
};

/** `null` é não-lido e nunca vira 0 na tela. Este é o ponto todo da entrega. */
const numero = (valor: number | null) => (valor === null ? "não lido" : String(valor));

export function IaAutonomaRobo({ compacto = false }: { compacto?: boolean }) {
  const situacao = useEstadoDaIa();

  if (situacao.fase === "carregando") {
    return (
      <article className="cc6-panel p-5" aria-busy="true">
        <p className="cc6-eyebrow">Estado da IA</p>
        <p className="mt-2 text-corpo text-[var(--atlas-texto-fraco)]">lendo o próprio histórico…</p>
      </article>
    );
  }

  if (situacao.fase === "erro") {
    return (
      <article
        className="cc6-panel cc6-sev-band p-5 pl-6"
        style={{ "--cc6-sev": "var(--atlas-estado-perigo)" } as CSSProperties}
        role="status"
      >
        <p className="cc6-eyebrow">Estado da IA</p>
        <p className="mt-2 text-corpo leading-6 text-[var(--atlas-estado-perigo)]">{situacao.motivo}</p>
      </article>
    );
  }

  const estado = situacao.estado;
  const glifo = GLIFO_DA_POSTURA[estado.postura];

  return (
    <article className="cc6-panel cc6-reveal overflow-hidden" aria-label="Estado da inteligência artificial">
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        <figure className="ia-autonoma-figura shrink-0 self-start">
          <Image
            src="/brand/atlas-robot-assistant.png"
            alt=""
            aria-hidden="true"
            width={176}
            height={264}
            sizes="88px"
            className="h-[132px] w-auto object-contain"
            // Presença, não herói da tela: quem decide aqui é o número ao lado.
            loading="lazy"
          />
        </figure>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
            <p className="cc6-eyebrow">Atlas · estado da IA</p>
            <span className="cc6-chip" title={`Postura ${ROTULO_DA_POSTURA[estado.postura]}`}>
              <span aria-hidden="true">{glifo}</span> {ROTULO_DA_POSTURA[estado.postura]}
            </span>
          </div>

          <p className="mt-2 max-w-[62ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">{estado.frase}</p>

          <div className="mt-5 flex flex-wrap items-end gap-x-9 gap-y-5">
            {/* HIERARQUIA POR CONSEQUÊNCIA: só este número pede uma decisão
                hoje, então só ele é herói (34px). Execução e análise informam
                (20px). A conta aberta das cinco tabelas e a janela de leitura
                auditam, e ficam no degrau de rótulo (11px). */}
            <div>
              <p
                className={`cc6-metric-value leading-none ${estado.aguardandoHumano > 0 ? "cc6-warn" : ""}`}
                style={{ fontSize: "var(--text-heroi)" }}
              >
                {estado.aguardandoHumano}
              </p>
              <p className="mt-2 text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">
                esperando você
              </p>
            </div>
            <div>
              <p className="cc6-metric-value leading-none" style={{ fontSize: "var(--text-numero)" }}>
                {numero(estado.execucoes)}
              </p>
              <p className="mt-2 text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">
                ações executadas
              </p>
            </div>
            <div>
              <p className="cc6-metric-value leading-none" style={{ fontSize: "var(--text-numero)" }}>
                {estado.roteamento ? estado.roteamento.total : "não lido"}
              </p>
              <p className="mt-2 text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">
                análises em {estado.janelaDias} dias
              </p>
            </div>
          </div>
        </div>
      </div>

      {estado.motivos.length ? (
        <>
          <p className="cc6-hairline px-5 pb-1 pt-4 text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">
            {estado.postura === "executando" ? "o que me governa" : "por que não agi"}
          </p>
          <ul className="px-5 pb-4">
            {estado.motivos.map((motivo) => (
              <li
                key={motivo.id}
                className="cc6-sev-band py-2.5 pl-4"
                style={{ "--cc6-sev": COR_DA_CLASSE[motivo.classe] } as CSSProperties}
              >
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <p className="text-corpo font-semibold text-[var(--atlas-texto-forte)]">{motivo.titulo}</p>
                  <span className="text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">
                    {NOME_DA_CLASSE[motivo.classe]}
                  </span>
                </div>
                <p className="mt-1 max-w-[72ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">{motivo.detalhe}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* "0 ações executadas" é a afirmação mais forte desta tela, então ela vem
          com a conta aberta: as cinco tabelas, uma a uma. Auditoria fica no
          degrau de rótulo — informa quem foi conferir, não disputa o palco. */}
      {!compacto ? (
        <dl className="cc6-hairline flex flex-wrap gap-x-6 gap-y-1.5 px-5 py-3">
          {(
            [
              ["corridas de agente", estado.execucao.corridasDeAgente],
              ["jornadas de venda", estado.execucao.jornadasDeVenda],
              ["execuções na Meta", estado.execucao.execucoesNaMeta],
              ["passagens ao corretor", estado.execucao.passagensParaCorretor],
              ["retratos de integração", estado.execucao.retratosDeIntegracao],
            ] as const
          ).map(([nome, valor]) => (
            <div key={nome} className="flex items-baseline gap-1.5">
              <dt className="text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">{nome}</dt>
              <dd className={`cc6-num text-rotulo ${valor === null ? "cc6-warn" : "text-[var(--atlas-texto-medio)]"}`}>
                {numero(valor)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {!compacto && estado.roteamento && estado.roteamento.total > 0 ? (
        <RoteamentoEmFaixa reparto={estado.roteamento} />
      ) : null}

      {!compacto && estado.propostas && estado.propostas.length ? (
        <ReguaDeValidade propostas={estado.propostas} />
      ) : null}

      <p className="cc6-hairline flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
        <span>
          Execuções contadas na organização inteira; o detalhe vem pela sua cerca de leitura. Falha de leitura aparece
          como “não lido”, nunca como zero.
        </span>
        {estado.truncado ? <span className="cc6-warn">Leitura truncada: os totais são piso, não total.</span> : null}
        <Link href="/approvals" className="cc6-chip cc6-interativo">
          abrir aprovações
        </Link>
      </p>
    </article>
  );
}

/**
 * O SELO — a mesma verdade em uma linha, para dentro do copiloto.
 *
 * O copiloto abre com "Especialista imobiliário" e uma ação recomendada. Sem
 * este selo, quem lê assume que há um especialista rodando atrás da sugestão.
 * Medido em 02/08/2026 não há: a sugestão é determinística e a IA nunca
 * executou nada. O selo é curto de propósito — ele contextualiza o painel, não
 * disputa espaço com ele; quem quiser o detalhe abre o estado completo.
 */
export function IaAutonomaSelo() {
  const situacao = useEstadoDaIa();

  if (situacao.fase !== "pronto") {
    return (
      <p className="mt-4 text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]" aria-busy={situacao.fase === "carregando"}>
        {situacao.fase === "carregando" ? "lendo o estado da IA…" : "estado da IA não lido"}
      </p>
    );
  }

  const estado = situacao.estado;

  return (
    /* ── O SELO CARREGA A PRÓPRIA SUPERFÍCIE, E O MOTIVO É MEDIDO ───────────
       O painel do copiloto pinta o fundo com uma cor CRAVADA no arquivo (o
       utilitário arbitrário em AtlasCopilotDock) e por isso ele não vira com o
       tema. Medido no navegador em 02/08/2026, com `data-theme=light` ligado,
       dentro do dock:

           "Especialista imobiliário" (título, pré-existente) .... 1,11
           frase do selo ........................................ 2,01
           "ver por quê" ........................................ 2,64

       É a classe "o fundo vira, o texto não" pelo avesso: os tokens de texto
       viram e o fundo não. Consertar o dock inteiro está fora desta entrega —
       todo o conteúdo dele assume tema escuro —, mas o selo não pode herdar o
       defeito. Ele declara o PAR: fundo OPACO em `--atlas-surface`, que vira
       junto com os tokens de texto que ficam por cima. Medido depois: 9,4 no
       escuro e 10,9 no claro. */
    <div
      className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--atlas-border)] px-3 py-2.5"
      style={{ background: "var(--atlas-surface)" }}
    >
      <Image
        src="/brand/atlas-robot-assistant.png"
        alt=""
        aria-hidden="true"
        width={88}
        height={132}
        sizes="30px"
        className="h-[44px] w-auto shrink-0 object-contain"
        loading="lazy"
      />
      <div className="min-w-0">
        <p className="text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">
          <span aria-hidden="true">{GLIFO_DA_POSTURA[estado.postura]}</span> {ROTULO_DA_POSTURA[estado.postura]}
        </p>
        <p className="mt-1 text-corpo leading-5 text-[var(--atlas-texto-medio)]">{estado.frase}</p>
        {/* `underline` do Tailwind vive em `@layer utilities` e perdia para uma
            regra sem camada do globals.css: medido no navegador em 02/08/2026,
            o computado saía `text-decoration-line: none` e a cor era a mesma do
            texto ao redor — um link que ninguém enxerga como link. A saída não é
            `!`: é usar o vocabulário de controle que a linguagem já tem. */}
        <Link href="/settings/ai" className="cc6-chip cc6-interativo mt-2 inline-flex">
          ver por quê
        </Link>
      </div>
    </div>
  );
}

/* ── GRÁFICO 1 · A FAIXA DE ROTEAMENTO ────────────────────────────────────
   O número ao lado é "43 análises". A faixa não repete isso: ela reparte as 43
   em três causas e mostra que só UMA delas tem conserto.

   Medido em 02/08/2026: 15 chamadas no modelo pretendido, 10 bloqueadas por
   dado pessoal (a governança funcionando) e 18 degradadas por custo. Lido só
   como "65% de fallback", o mesmo dado acusa o sistema de estar quebrado — e
   levaria alguém a "consertar" a regra de dado pessoal. A repartição é o que
   impede essa leitura, e é por isso que ela não é redundante.

   Sem texto DENTRO das faixas de propósito: cor de fundo e cor de texto são um
   par, e um par a mais para responder em dois temas por três segmentos é risco
   sem ganho. O rótulo fica fora, sobre o fundo do painel. */
function RoteamentoEmFaixa({ reparto }: { reparto: RepartoDeRoteamento }) {
  const segmentos = [
    { id: "pretendido", n: reparto.noModeloPretendido, cor: "var(--atlas-accent)", nome: "no modelo pretendido", nota: "chamou o provedor escolhido" },
    { id: "governanca", n: reparto.bloqueadoPorGovernanca, cor: "var(--atlas-texto-fraco)", nome: "retido por dado pessoal", nota: "regra funcionando — sem conserto" },
    { id: "custo", n: reparto.degradadoPorCusto, cor: "var(--atlas-estado-atencao)", nome: "degradado por custo", nota: "tem conserto: configuração de provedor" },
    { id: "sem-motivo", n: reparto.degradadoSemMotivoDeclarado, cor: "var(--atlas-estado-perigo)", nome: "caiu sem motivo declarado", nota: "não classifico o que não sei" },
  ].filter((segmento) => segmento.n > 0);

  return (
    <section className="cc6-hairline px-5 py-4" aria-label="Repartição das decisões de roteamento">
      <p className="text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">
        por que a IA não usou o modelo que queria
      </p>
      <div
        className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={segmentos.map((segmento) => `${segmento.n} ${segmento.nome}`).join("; ")}
      >
        {segmentos.map((segmento) => (
          <span
            key={segmento.id}
            // Largura proporcional é dado, não estilo: precisa ser calculada.
            style={{ width: `${(segmento.n / reparto.total) * 100}%`, background: segmento.cor }}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {segmentos.map((segmento) => (
          <li key={segmento.id} className="flex items-baseline gap-2.5">
            <span
              aria-hidden="true"
              className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: segmento.cor }}
            />
            <span className="cc6-num text-corpo text-[var(--atlas-texto-forte)]">{segmento.n}</span>
            <span className="min-w-0 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
              {segmento.nome}
              <span className="block text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{segmento.nota}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── GRÁFICO 2 · A RÉGUA DE VALIDADE ──────────────────────────────────────
   O número ao lado é "4 propostas pendentes". Verdadeiro e inútil: ele não diz
   que 3 delas passaram do prazo em 28/07 e não podem mais ser ativadas.

   A régua põe cada proposta numa linha do tempo com HOJE marcado. Quem está à
   esquerda morreu; quem está à direita ainda dá para assinar, e dá para ver em
   quantos dias. É a única leitura que faz alguém abrir /approvals agora — e não
   existe número único que a substitua, porque a informação é a POSIÇÃO. */
function ReguaDeValidade({ propostas }: { propostas: ValidadeDaProposta[] }) {
  const prazos = propostas.map((item) => item.diasAteVencer).filter((dias): dias is number => dias !== null);
  const piso = Math.min(-1, ...prazos);
  const teto = Math.max(1, ...prazos);
  // Faixa útil de 4% a 96%: a 0% e 100% o marcador fica metade fora do painel e
  // a proposta do extremo — justamente a mais urgente — some na borda.
  const posicao = (dias: number) => 4 + ((dias - piso) / (teto - piso)) * 92;

  return (
    <section className="cc6-hairline px-5 py-4" aria-label="Validade das propostas pendentes">
      <p className="text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">
        prazo de cada proposta em /approvals
      </p>

      {/* `--atlas-border-strong` é rgba(255,255,255,.12): no escuro o eixo sumia.
          `color-mix` sobre um token de TEXTO vira nos dois temas — e alfa por
          color-mix, nunca por dígito hex concatenado, que produz CSS inválido. */}
      <div
        className="relative mt-6 mb-2 h-px w-full"
        style={{ background: "color-mix(in srgb, var(--atlas-texto-fraco) 55%, transparent)" }}
      >
        <span
          aria-hidden="true"
          className="absolute top-[-9px] h-[19px] w-px bg-[var(--atlas-texto-medio)]"
          style={{ left: `${posicao(0)}%` }}
        />
        <span
          className="absolute top-[-26px] -translate-x-1/2 text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-medio)]"
          style={{ left: `${posicao(0)}%` }}
        >
          hoje
        </span>
        {propostas.map((proposta) =>
          proposta.diasAteVencer === null ? null : (
            <span
              key={proposta.id}
              title={`${proposta.tipo} · ${proposta.estado === "vencida" ? `venceu há ${Math.abs(proposta.diasAteVencer)} dia(s)` : `vence em ${proposta.diasAteVencer} dia(s)`}`}
              className="absolute top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rounded-full"
              style={{
                left: `${posicao(proposta.diasAteVencer)}%`,
                background: proposta.estado === "vencida" ? "var(--atlas-estado-perigo)" : "var(--atlas-estado-atencao)",
              }}
            />
          ),
        )}
      </div>

      <ul className="mt-4 space-y-1.5">
        {propostas.map((proposta) => (
          <li key={proposta.id} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            {/* Sem degrau declarado o glifo caía no 16px herdado da raiz — medido
                no navegador em 02/08/2026, era o único texto fora da escala. */}
            {proposta.estado === "vencida" ? <span aria-hidden="true" className="text-corpo">⚠</span> : null}
            <span className="cc6-num text-corpo text-[var(--atlas-texto-forte)]">{proposta.tipo}</span>
            <span
              className={`text-corpo leading-5 ${proposta.estado === "vencida" ? "cc6-crit" : "text-[var(--atlas-texto-medio)]"}`}
            >
              {proposta.diasAteVencer === null
                ? "sem prazo declarado"
                : proposta.estado === "vencida"
                  ? `venceu há ${Math.abs(proposta.diasAteVencer)} dia(s) — não dá mais para ativar`
                  : proposta.estado === "expira_hoje"
                    ? "vence hoje"
                    : `vence em ${proposta.diasAteVencer} dia(s)`}
            </span>
            <span className="text-rotulo text-[var(--atlas-texto-fraco)]">parada há {proposta.diasParada} dia(s)</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── O PAINEL DE AUTONOMIA ────────────────────────────────────────────────
   Não inventa a lista: renderiza `config/orcamento-e-autonomia-da-ia.json`, que
   já é executável — `avaliarAcaoDeAgente()` recusa ação acima do nível
   declarado, e agente ausente do catálogo nasce no nível 0.

   As três colunas são a resposta às três perguntas do dono: o que ela faz
   sozinha, o que precisa de assinatura, e o que está travado. A quarta linha —
   agente fora do catálogo — é a que explica por que 20 recomendações ficaram
   retidas sem ninguém ter configurado nada errado. */
const TITULO_DA_FAIXA = {
  sozinha: "faz sozinha, dentro do nível",
  assinatura: "só com assinatura registrada",
  observa: "observa e não age",
} as const;

const NOTA_DA_FAIXA = {
  sozinha: "Níveis 1 a 3: sugere, prepara rascunho ou grava dado interno reversível. Nada sai para o cliente.",
  assinatura: "Nível 4: age para fora e gasta dinheiro. Exige quem aprovou, quando e por quê — os três, sempre.",
  observa: "Nível 0: lê e registra. Agente que ninguém declarou cai aqui por padrão, travado.",
} as const;

export function IaAutonomaPainelDeAutonomia() {
  const situacao = useEstadoDaIa();

  if (situacao.fase !== "pronto") {
    return (
      <article className="cc6-panel p-5" aria-busy={situacao.fase === "carregando"}>
        <p className="cc6-eyebrow">Painel de autonomia</p>
        <p className="mt-2 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          {situacao.fase === "carregando" ? "lendo o catálogo de agentes…" : situacao.motivo}
        </p>
      </article>
    );
  }

  const { capacidades, problemasDoCatalogo } = situacao.estado;

  // Catálogo ilegível devolve lista vazia, e lista vazia desenharia "todo agente
  // é nível 0" — falso e tranquilizador. Aqui a tela recusa desenhar.
  if (problemasDoCatalogo.length) {
    return (
      <article
        className="cc6-panel cc6-sev-band p-5 pl-6"
        style={{ "--cc6-sev": "var(--atlas-estado-perigo)" } as CSSProperties}
        role="status"
      >
        <p className="cc6-eyebrow">Painel de autonomia</p>
        <p className="mt-2 max-w-[74ch] text-corpo leading-6 text-[var(--atlas-estado-perigo)]">
          Não consegui ler a declaração de níveis dos agentes. Não desenho a lista: uma lista vazia aqui leria como
          “nenhum agente tem autonomia”, que é conclusão, não leitura.
        </p>
        <ul className="mt-2 space-y-1">
          {problemasDoCatalogo.map((problema) => (
            <li key={problema} className="text-rotulo leading-5 text-[var(--atlas-texto-medio)]">
              {problema}
            </li>
          ))}
        </ul>
      </article>
    );
  }

  const faixas = (["assinatura", "sozinha", "observa"] as const).map((faixa) => ({
    faixa,
    itens: capacidades.filter((item) => item.faixa === faixa),
  }));

  return (
    <article className="cc6-panel cc6-reveal overflow-hidden" aria-label="Painel de autonomia da IA">
      <div className="p-5">
        <p className="cc6-eyebrow">Painel de autonomia</p>
        <h2 className="mt-1 text-[var(--atlas-texto-forte)]" style={{ fontSize: "var(--text-numero)", fontWeight: 600 }}>
          O que a IA pode fazer sem perguntar
        </h2>
        <p className="mt-2 max-w-[74ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          O catálogo abaixo é executável, não descritivo: uma ação acima do nível declarado é recusada em tempo de
          execução, e nenhum nível — nem com aprovação — libera apagar dado, mudar permissão ou disparar em massa.
        </p>
      </div>

      {faixas.map(({ faixa, itens }) =>
        itens.length === 0 ? null : (
          <section key={faixa} className="cc6-hairline px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">
                {TITULO_DA_FAIXA[faixa]}
              </p>
              <span className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]">{itens.length} agente(s)</span>
            </div>
            <p className="mt-1.5 max-w-[74ch] text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
              {NOTA_DA_FAIXA[faixa]}
            </p>
            <ul className="mt-3 grid gap-2.5 lg:grid-cols-2">
              {itens.map((item) => (
                <CapacidadeItem key={`${item.agente}-${item.foraDoCatalogo}`} item={item} />
              ))}
            </ul>
          </section>
        ),
      )}
    </article>
  );
}

function CapacidadeItem({ item }: { item: CapacidadeDaIa }) {
  return (
    <li
      className="cc6-panel-quiet cc6-sev-band p-3.5 pl-4"
      style={
        {
          "--cc6-sev": item.foraDoCatalogo
            ? "var(--atlas-estado-perigo)"
            : item.faixa === "assinatura"
              ? "var(--atlas-estado-atencao)"
              : "var(--atlas-accent)",
        } as CSSProperties
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {/* `text-[var(--atlas-texto-forte)]` vive em `@layer utilities` e PERDIA
            para a regra sem camada `:root[data-theme="light"] .cc6-num` do
            globals.css (linha 10352), que pinta todo `.cc6-num` de amber-700.
            (O hex literal saiu deste comentário em 02/08/2026: o portão
            `check-cor-cravada.mjs` casa `#rrggbb` no arquivo inteiro, comentário
            inclusive, e este arquivo era anunciado como tendo zero.)
            Medido no navegador em 02/08/2026, tema claro: o nome do agente saía
            amber-700 sobre `cc6-panel-quiet` (fundo composto 237,238,240) em
            4,35:1 — abaixo do piso AA de 4,5, nos 14 itens do painel. No escuro
            a mesma classe já entregava o token (contraste 5,13), ou seja: a
            declaração valia num tema e era ignorada no outro, em silêncio.
            A cor vai no `style` porque é o único lugar que a cascata não alcança;
            o fundo é o do `cc6-panel-quiet` e não muda. Depois: 12,26 no claro. */}
        <p className="cc6-num text-corpo font-semibold" style={{ color: "var(--atlas-texto-forte)" }}>
          {item.agente}
        </p>
        <span className="text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">nível {item.nivel}</span>
        {item.foraDoCatalogo ? <span className="cc6-crit text-rotulo uppercase tracking-[.22em]">fora do catálogo</span> : null}
      </div>
      <p className="mt-1.5 text-corpo leading-5 text-[var(--atlas-texto-medio)]">{item.porque}</p>
      <p className="mt-1.5 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
        {item.chamadas === null
          ? "consumo não lido"
          : item.chamadas === 0
            ? "nenhuma chamada medida na janela"
            : `${item.chamadas} chamada(s) medida(s)`}
      </p>
    </li>
  );
}

export default IaAutonomaRobo;
