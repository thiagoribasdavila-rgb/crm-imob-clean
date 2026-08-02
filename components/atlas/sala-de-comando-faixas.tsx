"use client";

/**
 * SALA DE COMANDO · AS QUATRO FAIXAS DO DESENHO DE REFERÊNCIA
 * (docs/design/SALA_DE_COMANDO_REFERENCIA.md)
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO É, E O QUE ELE SE RECUSA A SER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * O dono mostrou um mockup com seis KPIs, um funil, um feed, um ranking, uma
 * série de três linhas, um top de projetos POR VGV e quatro cartões de IA. A
 * distância entre esse mockup e este produto não é de layout — é de dado.
 *
 * Cada peça aqui nasce em um de dois estados, e nunca num terceiro:
 *
 *   1. MEDIDA   — o número vem da rota, com denominador ao lado.
 *   2. SEM LASTRO — o painel EXISTE, ocupa o mesmo espaço, e diz em uma frase
 *                   o que precisa ser preenchido para ele passar a medir.
 *
 * Não existe "painel que some porque o dado não veio" (isso é indistinguível
 * de painel quebrado) nem "painel com número de exemplo" (isso é mentira que
 * vira decisão de verba — e este produto já pagou por isso: `marketing_spend`
 * ficou semanas com ZERO escritores enquanto a tela mostrava valor).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE SVG À MÃO, E NUNCA CANVAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `canvas.fillStyle = "var(--atlas-accent)"` não resolve: o canvas ignora a
 * variável e pinta preto, EM SILÊNCIO, só em runtime, só num dos temas. Esta
 * base tem dois desses vivos (`Sparkline` e `DepthRing` em command-center),
 * ambos com azul e cinza-ardósia literais no código. Eles ficam onde estão
 * (nada é apagado), mas não servem de molde. SVG resolve `var()` e vira com o
 * tema — e o valor literal não é repetido aqui nem em prosa, porque o portão
 * `cor-cravada` conta o arquivo inteiro, comentário incluído, e com razão.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A PERGUNTA DE CADA GRÁFICO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Regra do desenho: se não dá para escrever a pergunta que o gráfico responde
 * e que o número sozinho não responde, o gráfico não é desenhado.
 *
 *   Funil em degraus ...... "Em qual PASSAGEM o funil aperta?" A lista de
 *                           contagens dá o estoque de cada etapa; a forma dá a
 *                           RAZÃO entre etapas vizinhas, que é onde se decide
 *                           se o problema é topo ou atendimento.
 *   Evolução de leads ..... "O salto foi demanda ou foi importação?" A linha
 *                           cheia é o que entrou; a tracejada é a parte que
 *                           veio de lote. Onde as duas se encostam, não houve
 *                           mercado — houve upload.
 *   Barras de projeto ..... "A demanda está concentrada em um produto?" — com
 *                           o denominador dos sem-vínculo à vista.
 *   Barras de corretor .... "A carteira está distribuída ou está com uma
 *                           pessoa?" — proporção com o número absoluto ao
 *                           lado, senão vira uma barra cheia e três fiapos.
 */

import Link from "next/link";

/* ── Tipos que a rota /api/v1/analytics/sala-de-comando publica ───────────── */

export type EtapaDoFunil = {
  chave: string;
  rotulo: string;
  quantidade: number;
  jaPassaram: number;
  percentualDoTopo: number | null;
  porqueVazia: string | null;
};

export type DeltaLeadsTotais = {
  rotulo: string;
  janelaDias: number;
  ultimos30: number;
  anteriores30: number;
  variacaoPercentual: number | null;
  porqueSemVariacao: string | null;
  importadasNaJanela: number;
  maiorLote: { id: string; leads: number } | null;
  ressalva: string;
};

export type DeltasDeEstado = {
  baseDeComparacaoExiste: boolean;
  movimentosNaJanelaAnterior: number;
  /** Nunca nulo: painel sem frase é indistinguível de painel quebrado. */
  porqueIndisponivel: string;
};

export type Evolucao = {
  dias: Array<{ dia: string; novos: number; importadas: number }>;
  de: string | null;
  ate: string | null;
  diasNaBase: number;
  serieTruncada: boolean;
  linhasIndisponiveis: Array<{ chave: string; porque: string }>;
  registroDeMovimentoDesde: string | null;
};

export type TopProjetos = {
  mensuravel: boolean;
  rotulo: string;
  projetos: Array<{ id: string; nome: string; leads: number }>;
  semVinculo: number;
  base: number;
  porqueSemVgv: string;
};

export type Equipe = {
  mensuravel: boolean;
  corretores: Array<{
    id: string;
    nome: string;
    total: number;
    abertas: number;
    ganhos: number;
    taxaAfirmavel: boolean;
    taxa: number | null;
  }>;
  semDono: number;
  base: number;
  maiorCarteira: number;
  concentracaoDoMaior: number | null;
  limiarVendasParaTaxa: number;
  porqueSemTaxaPorCorretor: string | null;
};

/* ── Tipos que vêm da PÁGINA (rotas que ela já busca, sem consulta nova) ──── */

export type SinalDoBriefing = {
  id: string;
  severity: "critical" | "attention" | "opportunity" | "healthy";
  area: string;
  title: string;
  evidence: string;
  action: string;
  href: string;
  impact: number;
};

export type ItemDoFeed = {
  id: string;
  href: string;
  titulo: string;
  detalhe: string;
  /** ISO. `null` = a linha não tem carimbo de tempo — e isso é dito, não escondido. */
  quandoIso: string | null;
  novo: boolean;
};

export type InsightLocal = { id: string; tipo: string; titulo: string; conteudo: string };

export type PontoCego = { id: string; title: string; reason: string };

/* ── Formatação ───────────────────────────────────────────────────────────── */

const inteiro = (n: number) => n.toLocaleString("pt-BR");
const umaCasa = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dataCurta = (iso: string) => {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return dia && mes ? `${dia}/${mes}` : (ano ?? iso);
};

/**
 * "há X min" — e o motivo de ele não virar "agora mesmo" quando não há carimbo.
 * Sem `quandoIso` a linha diz "sem carimbo de tempo": tempo desconhecido
 * apresentado como recente é a mesma doença de zero apresentado como saudável.
 */
function haQuantoTempo(iso: string | null, referenciaMs: number): string {
  if (!iso) return "sem carimbo de tempo";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "sem carimbo de tempo";
  const min = Math.round((referenciaMs - t) / 60_000);
  if (min < 0) return "com data no futuro";
  if (min < 1) return "há menos de 1 min";
  if (min < 60) return `há ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

/* ── Primitivas ───────────────────────────────────────────────────────────── */

/*
 * NÃO HÁ PRIMITIVA DE PAINEL NOVA AQUI, DE PROPÓSITO.
 *
 * A primeira versão deste arquivo trazia um `<Painel>` próprio — borda, raio e
 * cabeçalho — e teria sido a segunda maneira de desenhar a mesma coisa. Este
 * produto já pagou por isso: havia SEIS classes *eyebrow* no globals.css com
 * cinco tratamentos distintos. `AtlasCard` já É `.cc6-panel`, com os estados de
 * interação e a sobrescrita de tema claro no lugar certo. Todas as faixas usam
 * ele.
 */

/**
 * O ESTADO "SEM LASTRO" — a peça mais importante deste arquivo.
 *
 * Ele não é um erro nem um vazio: é uma DECLARAÇÃO. O painel continua na
 * grade, no mesmo tamanho, e no lugar do número há a frase do que precisa ser
 * preenchido. Quem lê sabe que o painel existe, que ninguém o apagou, e o que
 * fazer para ele passar a medir.
 *
 * O traço `—` no lugar do número é deliberado: é o mesmo vocabulário que
 * `usageCost` usa quando não há tarifa. Zero pareceria saudável.
 */
export function SemLastro({ oQueFalta, titulo }: { oQueFalta: string; titulo?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--atlas-estado-atencao)_45%,transparent)] bg-[color-mix(in_srgb,var(--atlas-estado-atencao)_7%,transparent)] p-3">
      <p className="flex items-center gap-1.5 text-rotulo font-semibold uppercase tracking-wide text-[var(--atlas-estado-atencao)]">
        <span aria-hidden="true" className="cc6-num text-numero leading-none">
          —
        </span>
        {titulo ?? "sem lastro"}
      </p>
      <p className="mt-1.5 text-rotulo leading-5 text-[var(--atlas-texto-medio)]">{oQueFalta}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FAIXA 1 · OS CARTÕES DE KPI
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Os ícones. Traço em `currentColor`, 16px, sem preenchimento — para herdarem
 * a cor do cartão e virarem com o tema junto com ele. Nenhum deles carrega
 * informação que o rótulo já não dê: são âncora de leitura, não dado.
 */
const GLIFOS: Record<string, string> = {
  base: "M3 6h18M3 12h18M3 18h12",
  ativos: "M4 19V5m0 14h16M8 15l3-4 3 3 4-6",
  atendimento: "M4 5h16v10H8l-4 4V5Z",
  negociacao: "M3 12h4l2-5 3 10 2-6 2 3h5",
  dinheiro: "M12 3v18M8 7h6a2.5 2.5 0 0 1 0 5H10a2.5 2.5 0 0 0 0 5h6",
  conversao: "M4 4h16l-6 7v7l-4 2v-9L4 4Z",
  contato: "M5 4h4l1.5 4-2 1.5a12 12 0 0 0 6 6L16 13l4 1.5v4a1.5 1.5 0 0 1-1.7 1.5A16 16 0 0 1 3.5 5.7 1.5 1.5 0 0 1 5 4Z",
  equipe: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20a6 6 0 0 1 12 0M14 20a6 6 0 0 1 8-5",
};

function Glifo({ nome }: { nome: keyof typeof GLIFOS | string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true" focusable="false">
      <path
        d={GLIFOS[nome] ?? GLIFOS.base!}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type Delta =
  | { tipo: "medido"; percentual: number | null; rotulo: string; ressalva: string }
  | { tipo: "sem-lastro"; porque: string }
  | { tipo: "nenhum"; detalhe: string | null };

/**
 * O CARTÃO DE KPI — ícone, valor e delta, como pede a referência.
 *
 * A terceira linha é a que decide se este cartão informa ou engana. Ela tem
 * três formas, e a do meio é a que o mockup não previa:
 *
 *   medido      → seta, percentual e o RÓTULO do que variou ("leads criadas
 *                 na base", não "demanda"), com a ressalva do lote logo abaixo.
 *   sem-lastro  → o motivo escrito, no lugar da seta. Nunca uma seta em zero.
 *   nenhum      → o denominador ou a explicação que aquele número precisa.
 */
export function CartaoKpi({
  rotulo,
  glifo,
  valor,
  valorSemLastro,
  detalhe,
  delta,
  estado,
}: {
  rotulo: string;
  glifo: string;
  valor?: string;
  valorSemLastro?: string;
  /** O DENOMINADOR ou a régua do número. "442 leads" sem isto não decide nada. */
  detalhe?: string | null;
  delta: Delta;
  estado?: "atencao" | "neutro";
}) {
  const corDoEstado = estado === "atencao" ? "text-[var(--atlas-estado-atencao)]" : "text-[var(--atlas-texto-fraco)]";
  return (
    /**
     * ── POR QUE A BORDA DE ESTADO É `style`, E NÃO UMA CLASSE ───────────────
     *
     * Duas tentativas anteriores foram medidas e as duas eram classe MORTA:
     *
     *   `cc6-atencao`               só existe para `.cc6-chip` e para o painel
     *                               silencioso ANINHADO. Num `.cc6-panel` de
     *                               topo ela não casa com regra nenhuma.
     *   `border-[var(--token)]`     utilitário do Tailwind vive em
     *                               `@layer utilities`; `.cc6-panel` é
     *                               declarada sem camada, e sem camada VENCE
     *                               camada. A classe aparece no código e não
     *                               aparece na tela.
     *
     * A terceira tentativa foi escrever a regra em `app/globals.css` — e ela
     * foi perdida: outra sessão reescreveu o arquivo enquanto este trabalho
     * acontecia. Estado que depende de um arquivo compartilhado é estado que
     * some sem ninguém notar.
     *
     * `style` inline vence a cascata inteira, é local a este componente, e o
     * valor continua sendo TOKEN — que é o que a Lei E exige. O que ela proíbe
     * é cor cravada, não estilo declarado no elemento.
     */
    <article
      className="cc6-panel min-w-0 p-4"
      style={estado === "atencao" ? { borderColor: "var(--atlas-estado-atencao)" } : undefined}
    >
      <p className={`flex items-center gap-1.5 text-rotulo font-semibold uppercase tracking-wide ${corDoEstado}`}>
        <Glifo nome={glifo} />
        <span className="min-w-0 truncate">{rotulo}</span>
      </p>

      {valorSemLastro ? (
        <div className="mt-2">
          <SemLastro oQueFalta={valorSemLastro} />
        </div>
      ) : (
        <p className="cc6-metric-value mt-2 text-numero leading-none">{valor}</p>
      )}

      {detalhe ? (
        <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{detalhe}</p>
      ) : null}

      {delta.tipo === "medido" ? (
        <>
          <p className="mt-1 flex items-baseline gap-1 text-rotulo leading-4">
            {delta.percentual === null ? (
              <span className="text-[var(--atlas-texto-fraco)]">variação não calculável</span>
            ) : (
              <span
                className={
                  delta.percentual >= 0
                    ? "cc6-num font-semibold text-[var(--atlas-estado-sucesso)]"
                    : "cc6-num font-semibold text-[var(--atlas-estado-perigo)]"
                }
              >
                {delta.percentual >= 0 ? "↑" : "↓"} {umaCasa(Math.abs(delta.percentual))}%
              </span>
            )}
            <span className="min-w-0 truncate text-[var(--atlas-texto-fraco)]">{delta.rotulo}</span>
          </p>
          {/* A ressalva não é rodapé opcional: sem ela a seta mede importação e
              se apresenta como mercado. */}
          <p className="mt-1 text-micro leading-4 text-[var(--atlas-estado-atencao)]">{delta.ressalva}</p>
        </>
      ) : delta.tipo === "sem-lastro" ? (
        <p className="mt-1 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
          <span className="cc6-num text-[var(--atlas-texto-medio)]">— </span>
          {delta.porque}
        </p>
      ) : delta.detalhe ? (
        <p className={`mt-1 text-micro leading-4 ${estado === "atencao" ? "text-[var(--atlas-estado-atencao)]" : "text-[var(--atlas-texto-fraco)]"}`}>
          {delta.detalhe}
        </p>
      ) : null}
    </article>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FAIXA 2 · FUNIL EM DEGRAUS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A PERGUNTA: em qual PASSAGEM o funil aperta?
 *
 * A lista de contagens (que continua logo abaixo, e é a versão acessível
 * destes mesmos números) responde "quantas estão em cada etapa". Ela não
 * responde a razão entre etapas vizinhas — e é a razão que diz se o problema é
 * de topo (pouca lead chegando) ou de atendimento (lead chegando e parando).
 *
 * O degrau é um trapézio de cada etapa para a seguinte. Quando a etapa seguinte
 * é zero, o trapézio fecha em ponta: isso é a verdade, não um defeito de
 * desenho. A largura mínima que "salvaria" a barra faria o funil parecer ter
 * fluxo onde não há.
 */
export function FunilEmDegraus({ etapas }: { etapas: EtapaDoFunil[] }) {
  /* TODAS as etapas configuradas entram, inclusive as de quantidade zero. Uma
     etapa filtrada por estar vazia é a etapa que some do desenho justamente
     quando o desenho tem mais a dizer sobre ela. */
  const visiveis = etapas;
  if (!visiveis.length) return null;

  const maior = Math.max(1, ...visiveis.map((e) => e.quantidade));
  const L = 300;
  const meio = L / 2;
  const maxMeia = 132;
  const alturaEtapa = 30;
  const A = visiveis.length * alturaEtapa;
  const meia = (q: number) => (q / maior) * maxMeia;

  /**
   * ── A RESPOSTA DA PERGUNTA, E O ERRO QUE ELA QUASE COMETEU ────────────────
   *
   * A primeira versão media a maior queda RELATIVA. Renderizada sobre os
   * números reais de 02/08/2026, ela respondeu:
   *
   *     "a passagem que mais aperta é Qualificação → Visita: perde 100,0%"
   *
   * Falso no conteúdo, e perigoso. Qualificação → Visita perde 7 leads (7 → 0,
   * logo 100%). Novos → Contato perde 370 (396 → 26, 93,4%). Pelo relativo, uma
   * amostra de sete ganha de trezentos e setenta — e a frase manda a direção
   * arrumar a etapa de visita enquanto a hemorragia está no primeiro contato.
   *
   * A pergunta é "onde a maioria das leads para", e a resposta dela é ABSOLUTA.
   * O percentual continua na frase, ao lado, porque sozinho o absoluto favorece
   * sempre o topo por construção — os dois juntos não deixam ler errado.
   */
  let apertoRotulo: string | null = null;
  let perdaAbsoluta = -1;
  let perdaRelativa = 0;
  for (let i = 0; i < visiveis.length - 1; i += 1) {
    const de = visiveis[i]!;
    const para = visiveis[i + 1]!;
    const perda = de.quantidade - para.quantidade;
    if (perda > perdaAbsoluta) {
      perdaAbsoluta = perda;
      perdaRelativa = de.quantidade > 0 ? perda / de.quantidade : 0;
      apertoRotulo = `${de.rotulo} → ${para.rotulo}`;
    }
  }

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${L} ${A}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Funil em degraus: ${visiveis.map((e) => `${e.rotulo} ${e.quantidade}`).join(", ")}.`}
      >
        {visiveis.map((etapa, i) => {
          const y = i * alturaEtapa;
          const proxima = visiveis[i + 1];
          const meiaTopo = meia(etapa.quantidade);
          const meiaBase = proxima ? meia(proxima.quantidade) : meiaTopo * 0.82;
          const passaramMeia = meia(Math.min(etapa.jaPassaram, maior));
          return (
            <g key={etapa.chave}>
              {/* Trilha: a largura que a etapa TERIA se retivesse o topo inteiro.
                  Sem ela, uma etapa em zero não tem contra o que ser lida. */}
              <rect
                x={meio - maxMeia}
                y={y + 1}
                width={maxMeia * 2}
                height={alturaEtapa - 2}
                rx="3"
                /* Token explícito, não `currentColor`: dentro de um SVG o
                   `currentColor` depende de quem for o pai naquele dia, e
                   trilha que muda de tom conforme o container é trilha que não
                   serve de escala. */
                fill="color-mix(in srgb, var(--atlas-texto-fraco) 18%, transparent)"
              />
              {/* Quem JÁ PASSOU por aqui, em contorno tracejado. É o que separa
                  "não chegou" de "chegou e vazou" — dois diagnósticos que mandam
                  a direção fazer coisas opostas. */}
              {etapa.jaPassaram > 0 && passaramMeia > meiaTopo ? (
                <rect
                  x={meio - passaramMeia}
                  y={y + 3}
                  width={passaramMeia * 2}
                  height={alturaEtapa - 6}
                  rx="3"
                  fill="none"
                  stroke="var(--atlas-accent)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity="0.55"
                />
              ) : null}
              {etapa.quantidade > 0 ? (
                /* A rampa de opacidade para em 0,65: abaixo disso o acento
                   deixa de manter 3:1 contra o painel, e degrau de funil é
                   informação, não textura. */
                <polygon
                  points={`${meio - meiaTopo},${y + 1} ${meio + meiaTopo},${y + 1} ${meio + meiaBase},${y + alturaEtapa - 1} ${meio - meiaBase},${y + alturaEtapa - 1}`}
                  fill="var(--atlas-accent)"
                  opacity={Math.max(0.65, 0.95 - i * 0.06)}
                />
              ) : (
                /* Etapa em zero: uma linha, não uma barra. A linha diz "aqui
                   não há estoque" sem fingir volume. */
                <line
                  x1={meio - 10}
                  x2={meio + 10}
                  y1={y + alturaEtapa / 2}
                  y2={y + alturaEtapa / 2}
                  stroke="var(--atlas-texto-fraco)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}
              <title>
                {`${etapa.rotulo}: ${inteiro(etapa.quantidade)} agora${etapa.jaPassaram > 0 ? ` · ${inteiro(etapa.jaPassaram)} já passaram` : ""}`}
              </title>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-rotulo leading-5 text-[var(--atlas-texto-medio)]">
        {apertoRotulo && perdaAbsoluta > 0 ? (
          <>
            A passagem que mais aperta é{" "}
            <strong className="font-semibold text-[var(--atlas-texto-forte)]">{apertoRotulo}</strong>:{" "}
            <strong className="font-semibold text-[var(--atlas-texto-forte)]">
              {inteiro(perdaAbsoluta)} lead{perdaAbsoluta === 1 ? "" : "s"}
            </strong>{" "}
            param aí — {umaCasa(perdaRelativa * 100)}% do que estava na etapa anterior. É onde a decisão muda de
            &quot;comprar mais topo&quot; para &quot;atender o que já chegou&quot;.
          </>
        ) : (
          <>Nenhuma etapa perde volume para a seguinte nesta leitura — não há onde apontar aperto.</>
        )}
      </figcaption>
    </figure>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FAIXA 2 · ATIVIDADES EM TEMPO REAL
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * O FEED TEM LASTRO. O "ÍCONE POR CANAL" NÃO — e a diferença é dita na tela.
 *
 * O mockup pede um feed "com ícone por canal": WhatsApp, ligação, e-mail. Foi
 * medido: `activities.type` tem UM único valor em 481 de 481 linhas
 * (`pipeline_stage_changed`), e não há fonte alternativa — `messages`,
 * `conversations`, `ai_conversations`, `followups` e `pipeline_history` estão
 * todas em zero.
 *
 * Seis ícones diferentes sobre um valor só é decoração que finge variedade:
 * quem olha conclui que a operação conversa por seis canais. Então há UM glifo,
 * e a linha embaixo diz por quê.
 */
export function AtividadesEmTempoReal({
  itens,
  referenciaMs,
  amostra,
}: {
  itens: ItemDoFeed[];
  referenciaMs: number;
  amostra: { lidas: number; total: number | null } | null;
}) {
  if (!itens.length) {
    return (
      <SemLastro
        titulo="sem movimento lido"
        oQueFalta="Nenhuma atividade chegou nesta leitura. Isto não quer dizer operação parada — quer dizer que o instantâneo veio vazio. Recarregue antes de concluir."
      />
    );
  }
  return (
    <ul className="space-y-0.5">
      {itens.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[color-mix(in_srgb,var(--atlas-accent)_10%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.novo ? "bg-[var(--atlas-accent)]" : "bg-[color-mix(in_srgb,var(--atlas-texto-fraco)_65%,transparent)]"}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-corpo text-[var(--atlas-texto-forte)]">{item.titulo}</span>
              <span className="block truncate text-micro text-[var(--atlas-texto-fraco)]">{item.detalhe}</span>
            </span>
            <span className="cc6-num shrink-0 text-micro text-[var(--atlas-texto-fraco)]">
              {haQuantoTempo(item.quandoIso, referenciaMs)}
            </span>
          </Link>
        </li>
      ))}
      {/* ── O TETO SILENCIOSO ────────────────────────────────────────────────
          A rota que alimenta este feed lê no máximo 500 linhas de lead. A base
          tem 489. Faltam 11 para todo agregado derivado dali virar amostra
          apresentada como total — é a mesma classe do `.limit(5000)` que a
          rota da sala de comando já corrigiu. Enquanto não vira, o painel
          declara a leitura; quando virar, ele diz "amostra". */}
      {amostra && amostra.total !== null && amostra.lidas < amostra.total ? (
        <li className="pt-1 text-micro leading-4 text-[var(--atlas-estado-atencao)]">
          Amostra: {inteiro(amostra.lidas)} de {inteiro(amostra.total)} leads foram lidas. Este feed mostra as mais
          recentes DA AMOSTRA, não da base.
        </li>
      ) : null}
    </ul>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FAIXA 2 · PERFORMANCE DA EQUIPE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * RANKING POR VOLUME — e a coluna "conversão" recusada, no mesmo limiar.
 *
 * Medido: 4 donos distintos, e um corretor carrega 485 das 489 leads. O ranking
 * é verdadeiro e é exatamente esse desequilíbrio que ele precisa mostrar — mas
 * proporção sem denominador vira uma barra em 100% e três fiapos, que se lê
 * como "os outros três não trabalham" em vez de "os outros três não recebem".
 * Por isso o número absoluto anda colado na barra.
 *
 * A coluna de CONVERSÃO por pessoa não sai: a organização inteira tem 2 vendas,
 * ambas no mesmo corretor. Taxa sobre amostra 0, 0, 0 e 2 não distingue ninguém
 * de ninguém — é a mesma armadilha que `conversao.afirmavel` já bloqueia no
 * agregado, com o mesmo limiar, aplicado agora por pessoa.
 */
export function PerformanceDaEquipe({ equipe }: { equipe: Equipe }) {
  if (!equipe.mensuravel) {
    return (
      <SemLastro
        titulo="cadastro não lido"
        oQueFalta="Não foi possível ler os perfis da organização, então o ranking está indisponível — não está vazio."
      />
    );
  }
  if (!equipe.corretores.length) {
    return (
      <SemLastro
        titulo="nenhuma carteira atribuída"
        oQueFalta={`As ${inteiro(equipe.base)} leads da base estão sem responsável. Falta distribuir para haver ranking.`}
      />
    );
  }
  const maior = Math.max(1, ...equipe.corretores.map((c) => c.total));
  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {equipe.corretores.map((c) => (
          <li key={c.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-corpo text-[var(--atlas-texto-forte)]" title={c.nome}>
                {c.nome}
              </span>
              <span className="cc6-num shrink-0 text-rotulo text-[var(--atlas-texto-medio)]">
                {inteiro(c.total)} <span className="text-[var(--atlas-texto-fraco)]">na carteira</span>
                <span className="text-[var(--atlas-texto-fraco)]"> · </span>
                {inteiro(c.abertas)} <span className="text-[var(--atlas-texto-fraco)]">abertas</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_12%,transparent)] text-[var(--atlas-texto-fraco)]">
              <div
                className="h-full rounded-full bg-[var(--atlas-accent)]"
                style={{ width: `${Math.max(2, Math.round((c.total / maior) * 100))}%` }}
                role="presentation"
              />
            </div>
            <p className="mt-1 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
              {c.taxaAfirmavel && c.taxa !== null
                ? `${umaCasa(c.taxa)}% de conversão sobre ${inteiro(c.total)}`
                : `${inteiro(c.ganhos)} venda${c.ganhos === 1 ? "" : "s"} — abaixo de ${equipe.limiarVendasParaTaxa}, contagem não vira taxa`}
            </p>
          </li>
        ))}
      </ul>
      {equipe.concentracaoDoMaior !== null ? (
        <p className="text-rotulo leading-5 text-[var(--atlas-texto-medio)]">
          O maior carrega{" "}
          <strong className="font-semibold text-[var(--atlas-texto-forte)]">
            {inteiro(equipe.maiorCarteira)} das {inteiro(equipe.base)}
          </strong>{" "}
          leads ({umaCasa(equipe.concentracaoDoMaior)}%)
          {equipe.semDono > 0 ? `, e ${inteiro(equipe.semDono)} estão sem responsável` : ""}. Um ranking com essa
          distribuição não compara pessoas: ele mostra como a distribuição está feita.
        </p>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FAIXA 3 · EVOLUÇÃO DE LEADS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A PERGUNTA: o salto foi demanda ou foi importação?
 *
 * O mockup pede TRÊS linhas — novos, qualificados, negociações. Só a primeira
 * tem lastro na janela: `created_at` cobre a base inteira sem um único nulo. As
 * outras duas só poderiam sair de `pipeline_stage_moves`, que começou a
 * registrar dias atrás — desenhadas no mesmo eixo, elas leriam como "caiu para
 * zero" em todos os dias anteriores, que é o OPOSTO do que aconteceu.
 *
 * Então sai uma linha só — e sobre ela, tracejada, a parcela que entrou por
 * lote de importação. Onde a tracejada encosta na cheia, não houve mercado:
 * houve upload. É a única forma de o pico de 270 leads em seis minutos não ser
 * lido como crescimento.
 */
export function EvolucaoDeLeads({ evolucao }: { evolucao: Evolucao }) {
  const dias = evolucao.dias;
  if (dias.length < 2) {
    return (
      <SemLastro
        titulo="série curta demais"
        oQueFalta="Menos de dois dias com lead criada. Uma série precisa de dois pontos para ter direção."
      />
    );
  }

  const L = 700;
  const A = 150;
  const padX = 8;
  const padTopo = 12;
  const padBase = 20;
  const maior = Math.max(1, ...dias.map((d) => d.novos));
  const passo = (L - padX * 2) / Math.max(1, dias.length - 1);
  const x = (i: number) => padX + i * passo;
  const y = (v: number) => A - padBase - (v / maior) * (A - padTopo - padBase);

  const caminho = (chave: "novos" | "importadas") =>
    dias.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[chave]).toFixed(1)}`).join(" ");

  const houveImportacao = dias.some((d) => d.importadas > 0);
  const pico = dias.reduce((melhor, d) => (d.novos > melhor.novos ? d : melhor), dias[0]!);
  const totalNaSerie = dias.reduce((s, d) => s + d.novos, 0);
  const importadasNaSerie = dias.reduce((s, d) => s + d.importadas, 0);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${L} ${A}`}
        className="h-[150px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Leads criadas por dia entre ${dataCurta(evolucao.de ?? "")} e ${dataCurta(evolucao.ate ?? "")}: ${inteiro(totalNaSerie)} no total, pico de ${inteiro(pico.novos)} em ${dataCurta(pico.dia)}${houveImportacao ? `, das quais ${inteiro(importadasNaSerie)} entraram por importação` : ""}.`}
      >
        {/* Linha de base: sem ela, um vale não se distingue do fim do gráfico.
            Cor por token, não por `currentColor` — ver a nota do funil. */}
        <line
          x1={padX}
          x2={L - padX}
          y1={A - padBase}
          y2={A - padBase}
          stroke="color-mix(in srgb, var(--atlas-texto-fraco) 45%, transparent)"
          strokeWidth="1"
        />
        <path
          d={caminho("novos")}
          fill="none"
          stroke="var(--atlas-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {houveImportacao ? (
          <path
            d={caminho("importadas")}
            fill="none"
            stroke="var(--atlas-estado-atencao)"
            strokeWidth="2"
            strokeDasharray="5 4"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {/* Um alvo invisível por dia, só para o `title` nativo — tooltip sem
            uma linha de JavaScript e sem biblioteca. */}
        {dias.map((d, i) => (
          <rect key={d.dia} x={x(i) - passo / 2} y={0} width={Math.max(passo, 1)} height={A} fill="transparent">
            <title>
              {`${dataCurta(d.dia)}: ${inteiro(d.novos)} lead${d.novos === 1 ? "" : "s"} criada${d.novos === 1 ? "" : "s"}${d.importadas > 0 ? ` · ${inteiro(d.importadas)} por importação` : ""}`}
            </title>
          </rect>
        ))}
      </svg>
      <div className="mt-1 flex items-baseline justify-between gap-3 text-micro text-[var(--atlas-texto-fraco)]">
        <span className="cc6-num">{evolucao.de ? dataCurta(evolucao.de) : ""}</span>
        <span>
          <span className="text-[var(--atlas-accent)]">━</span> criadas
          {houveImportacao ? (
            <>
              {" · "}
              <span className="text-[var(--atlas-estado-atencao)]">╌</span> parcela importada
            </>
          ) : null}
        </span>
        <span className="cc6-num">{evolucao.ate ? dataCurta(evolucao.ate) : ""}</span>
      </div>
      <figcaption className="mt-2 space-y-1.5">
        <p className="text-rotulo leading-5 text-[var(--atlas-texto-medio)]">
          {houveImportacao ? (
            <>
              {inteiro(importadasNaSerie)} das {inteiro(totalNaSerie)} leads da série entraram por lote de importação.
              O pico de {dataCurta(pico.dia)} ({inteiro(pico.novos)} leads
              {pico.importadas > 0 ? `, ${inteiro(pico.importadas)} importadas` : ""}) mede entrada na base, não
              demanda de mercado.
            </>
          ) : (
            <>
              {inteiro(totalNaSerie)} leads criadas na janela, com pico de {inteiro(pico.novos)} em{" "}
              {dataCurta(pico.dia)}. Nenhuma veio de importação: a série mede criação orgânica.
            </>
          )}
        </p>
        {/* As duas linhas que o mockup pede e que não existem — declaradas,
            não omitidas. Painel que some é indistinguível de painel quebrado. */}
        {evolucao.linhasIndisponiveis.map((linha) => (
          <p key={linha.chave} className="text-micro leading-4 text-[var(--atlas-texto-fraco)]">
            <span className="cc6-num text-[var(--atlas-texto-medio)]">— </span>
            <strong className="font-semibold text-[var(--atlas-texto-medio)]">linha &quot;{linha.chave}&quot;:</strong>{" "}
            {linha.porque}
          </p>
        ))}
      </figcaption>
    </figure>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FAIXA 3 · TOP PROJETOS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * POR LEADS, COM O DENOMINADOR — e o "por VGV" recusado por escrito.
 *
 * O mockup pede barras por VGV. Medido: preço de tabela nulo em 2 dos 4
 * empreendimentos; `units.price` só existe para um (e é valor de ESTOQUE, não
 * VGV vendido); e a única venda com valor apurado tem `development_id` nulo, o
 * que impede até o VGV FECHADO de ser atribuído a um projeto.
 *
 * Barras em `div`, não em SVG, de propósito: uma barra é um retângulo, e
 * retângulo com largura percentual e o número ao lado é lido por leitor de tela
 * sem nenhuma tradução.
 */
export function TopProjetosPorLeads({ dados }: { dados: TopProjetos }) {
  if (!dados.mensuravel) {
    return (
      <SemLastro
        titulo="cadastro não lido"
        oQueFalta="Não foi possível ler os empreendimentos da organização. O ranking está indisponível, não vazio."
      />
    );
  }
  const maior = Math.max(1, ...dados.projetos.map((p) => p.leads));
  const vinculadas = dados.base - dados.semVinculo;
  return (
    <div className="space-y-3">
      {dados.projetos.length ? (
        <ul className="space-y-2.5">
          {dados.projetos.map((projeto) => (
            <li key={projeto.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-corpo text-[var(--atlas-texto-forte)]" title={projeto.nome}>
                  {projeto.nome}
                </span>
                <span className="cc6-num shrink-0 text-rotulo text-[var(--atlas-texto-medio)]">
                  {inteiro(projeto.leads)}
                  <span className="text-[var(--atlas-texto-fraco)]">
                    {" "}
                    lead{projeto.leads === 1 ? "" : "s"}
                    {vinculadas > 0 ? ` · ${umaCasa((projeto.leads / vinculadas) * 100)}% das vinculadas` : ""}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_12%,transparent)] text-[var(--atlas-texto-fraco)]">
                {projeto.leads > 0 ? (
                  <div
                    className="h-full rounded-full bg-[var(--atlas-accent)]"
                    style={{ width: `${Math.max(2, Math.round((projeto.leads / maior) * 100))}%` }}
                    role="presentation"
                  />
                ) : null}
              </div>
              {projeto.leads === 0 ? (
                <p className="mt-1 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                  Nenhuma lead vinculada a este empreendimento. Ele está cadastrado e não está recebendo demanda.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <SemLastro
          titulo="nenhum empreendimento cadastrado"
          oQueFalta="Sem empreendimento na base não há o que ranquear. Falta cadastrar o produto."
        />
      )}
      {/* O denominador é obrigatório. Medido em 02/08/2026: o maior projeto tem
          174 leads, e 291 das 489 da base não têm empreendimento nenhum
          vinculado — mais do que o líder do ranking. Sem esta linha, "174" se
          lê como o retrato da operação quando é o retrato de 198 leads. */}
      <p className="text-rotulo leading-5 text-[var(--atlas-texto-medio)]">
        {inteiro(dados.semVinculo)} de {inteiro(dados.base)} leads estão sem empreendimento vinculado — este ranking
        cobre {inteiro(vinculadas)}.
      </p>
      <SemLastro titulo="sem lastro · ranking por VGV" oQueFalta={dados.porqueSemVgv} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FAIXA 3 · ALERTAS INTELIGENTES
   ══════════════════════════════════════════════════════════════════════════ */

const CLASSE_DA_SEVERIDADE: Record<string, string> = {
  critical: "text-[var(--atlas-estado-perigo)]",
  attention: "text-[var(--atlas-estado-atencao)]",
  opportunity: "text-[var(--atlas-accent)]",
  healthy: "text-[var(--atlas-estado-sucesso)]",
};
/**
 * ── EMOJI SÓ ONDE ELE ACRESCENTA UM CANAL ───────────────────────────────────
 *
 * O item de alerta trazia um ponto colorido de 6px ao lado da palavra
 * "crítico"/"atenção". O ponto não dizia nada que a palavra e a cor já não
 * dissessem — era um terceiro codificador da MESMA informação, e quem tem baixa
 * visão de cor perdia dois dos três.
 *
 * O emoji troca esse ponto por uma FORMA reconhecível de relance, que sobrevive
 * em escala de cinza e não depende de ler a palavra. Não é decoração: é o
 * mesmo canal, melhor.
 *
 * O que NÃO recebeu emoji, de propósito: o delta dos indicadores. Lá já existem
 * seta e cor, e um terceiro símbolo seria exatamente a redundância que este
 * comentário acaba de remover daqui.
 *
 * `aria-hidden` porque a palavra ao lado já nomeia a severidade — o leitor de
 * tela não deve ouvir "triângulo vermelho crítico".
 */
const EMOJI_DA_SEVERIDADE: Record<string, string> = {
  critical: "🔴",
  attention: "⚠️",
  opportunity: "💡",
  healthy: "✅",
};
const NOME_DA_SEVERIDADE: Record<string, string> = {
  critical: "crítico",
  attention: "atenção",
  opportunity: "oportunidade",
  healthy: "saudável",
};

/**
 * A ÚNICA FONTE DA BASE COM SEVERIDADE REAL.
 *
 * O documento de referência aponta `lead_alerts` e `ai_shadow_decisions`. As
 * duas têm linhas — e nenhuma tem severidade: `lead_alerts` guarda id, lead,
 * destinatário, `motivo` (dois valores possíveis, `atribuicao` e `criacao`) e
 * as datas; `ai_shadow_decisions` tem um único agente e um campo de confiança,
 * que não é severidade. Quem desenhasse "alerta com severidade" a partir delas
 * inventaria a coluna.
 *
 * `briefing.signals` já chega à página, já vem ordenado por severidade e
 * impacto, e cada sinal carrega a evidência e a ação com destino. É daí que
 * este painel lê.
 */
export function AlertasInteligentes({
  sinais,
  indisponivel,
}: {
  sinais: SinalDoBriefing[];
  indisponivel: boolean;
}) {
  if (indisponivel) {
    return (
      <SemLastro
        titulo="briefing não lido"
        oQueFalta="A leitura dos sinais falhou. Os alertas estão indisponíveis — o que não é o mesmo que não haver alerta."
      />
    );
  }
  const acionaveis = sinais.filter((s) => s.severity === "critical" || s.severity === "attention");
  if (!acionaveis.length) {
    return (
      <p className="text-rotulo leading-5 text-[var(--atlas-texto-medio)]">
        Nenhum sinal crítico ou de atenção nesta leitura
        {sinais.length ? ` — os ${inteiro(sinais.length)} sinais medidos estão em oportunidade ou saudável.` : "."}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {acionaveis.slice(0, 5).map((sinal) => (
        <li key={sinal.id} className="cc6-panel-quiet p-3">
          <p className={`flex items-center gap-1.5 text-micro font-semibold uppercase tracking-wide ${CLASSE_DA_SEVERIDADE[sinal.severity] ?? ""}`}>
            <span aria-hidden="true" className="text-[0.85rem] leading-none">
              {EMOJI_DA_SEVERIDADE[sinal.severity] ?? "•"}
            </span>
            {NOME_DA_SEVERIDADE[sinal.severity] ?? sinal.severity}
            <span className="font-normal text-[var(--atlas-texto-fraco)]">· {sinal.area}</span>
          </p>
          <p className="mt-1.5 text-corpo font-medium leading-tight text-[var(--atlas-texto-forte)]">{sinal.title}</p>
          <p className="mt-1 text-rotulo leading-5 text-[var(--atlas-texto-medio)]">{sinal.evidence}</p>
          {sinal.href ? (
            <Link
              href={sinal.href}
              className="mt-1 inline-flex min-h-11 items-center text-rotulo font-semibold text-[var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
            >
              {sinal.action} →
            </Link>
          ) : (
            <p className="mt-1 text-rotulo text-[var(--atlas-texto-fraco)]">{sinal.action}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FAIXA 4 · INSIGHTS DO COPILOTO
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * QUATRO CARTÕES — e o quarto é o que declara o que a IA NÃO enxerga.
 *
 * O documento manda ler `ai_insights` e `atlas_recommendations`. Medido: as
 * duas tabelas EXISTEM e as duas têm ZERO linhas. A tabela existir não é o
 * dado existir — quem fosse buscar ali desenharia quatro cartões vazios e
 * concluiria que a IA não tem o que dizer.
 *
 * A partição sai de `briefing.signals`, que a página já busca, e o cartão
 * "Tendência" é substituído pelos PONTOS CEGOS declarados pelo próprio
 * briefing: tendência exigiria comparar duas janelas, e a Faixa 1 já provou
 * que a série de estado não cobre a janela anterior.
 */
export function InsightsDoCopiloto({
  sinais,
  pontosCegos,
  insightsLocais,
  indisponivel,
}: {
  sinais: SinalDoBriefing[];
  pontosCegos: PontoCego[];
  insightsLocais: InsightLocal[];
  indisponivel: boolean;
}) {
  const porMaiorImpacto = (a: SinalDoBriefing, b: SinalDoBriefing) => b.impact - a.impact;
  const oportunidade = sinais.filter((s) => s.severity === "opportunity").sort(porMaiorImpacto)[0] ?? null;
  const atencao = sinais.filter((s) => s.severity === "attention").sort(porMaiorImpacto)[0] ?? null;
  /**
   * A recomendação EXCLUI o que os dois cartões anteriores já estão mostrando.
   * Sem isto, o sinal de maior impacto aparece duas vezes lado a lado — e três
   * cartões contando a mesma coisa passam a impressão de três problemas onde há
   * um só, que é inflar a operação com repetição.
   */
  const jaMostrados = new Set([oportunidade?.id, atencao?.id].filter(Boolean));
  const recomendacao =
    sinais.filter((s) => s.action && s.href && !jaMostrados.has(s.id)).sort(porMaiorImpacto)[0] ?? null;

  /** Leitura que falhou tem frase própria em TODOS os cartões: "nenhum sinal"
   *  e "não foi possível ler" mandam fazer coisas diferentes. */
  const semLeitura = (
    <SemLastro
      titulo="briefing não lido"
      oQueFalta="A leitura dos sinais falhou. Isto não é ausência de sinal — é ausência de leitura. Recarregue antes de concluir que está tudo bem."
    />
  );

  /**
   * O emoji entra aqui pelo mesmo critério dos alertas: os quatro cartões são
   * lidos em VARREDURA, lado a lado, e hoje só a palavra os distingue. Uma
   * forma reconhecível na frente do título separa "oportunidade" de "atenção"
   * antes da leitura — e sobrevive em escala de cinza, que a cor não faz.
   *
   * `aria-hidden` no emoji: o título ao lado já nomeia o cartão.
   */
  const cartoes: Array<{
    chave: string;
    titulo: string;
    emoji: string;
    corpo: React.ReactNode;
  }> = [
    {
      chave: "oportunidade",
      titulo: "Oportunidade",
      emoji: "💡",
      corpo: indisponivel ? (
        semLeitura
      ) : oportunidade ? (
        <CorpoDoSinal sinal={oportunidade} />
      ) : (
        <SemLastro
          titulo="nenhuma oportunidade medida"
          oQueFalta="Nenhum sinal de oportunidade nesta leitura. Falta lead com sinal de compra registrado para haver o que apontar."
        />
      ),
    },
    {
      chave: "atencao",
      titulo: "Atenção",
      emoji: "⚠️",
      corpo: indisponivel ? (
        semLeitura
      ) : atencao ? (
        <CorpoDoSinal sinal={atencao} />
      ) : (
        <SemLastro
          titulo="nenhum ponto de atenção medido"
          oQueFalta="Nenhum sinal de atenção nesta leitura. Não é o mesmo que operação saudável: é o que esta leitura conseguiu ver."
        />
      ),
    },
    {
      chave: "recomendacao",
      titulo: "Recomendação",
      emoji: "🎯",
      corpo: indisponivel ? (
        semLeitura
      ) : recomendacao ? (
        <CorpoDoSinal sinal={recomendacao} />
      ) : (
        <SemLastro
          titulo="nenhuma ação recomendada"
          oQueFalta="Nenhum sinal desta leitura veio com ação e destino, além dos já mostrados ao lado. Recomendação sem destino é frase, não recomendação."
        />
      ),
    },
    {
      chave: "cobertura",
      /* O quarto cartão do mockup é "Tendência". Ele foi TROCADO, não removido:
         tendência exige comparar duas janelas, e a janela anterior não tem um
         único movimento registrado. No lugar entra o que a IA declara não
         enxergar — que é a informação honesta disponível no mesmo espaço. */
      titulo: "O que a IA não enxerga",
      emoji: "🫥",
      corpo: pontosCegos.length ? (
        <ul className="space-y-1.5">
          {pontosCegos.slice(0, 3).map((ponto) => (
            <li key={ponto.id}>
              <p className="text-corpo font-medium text-[var(--atlas-texto-forte)]">{ponto.title}</p>
              <p className="mt-0.5 text-rotulo leading-5 text-[var(--atlas-texto-medio)]">{ponto.reason}</p>
            </li>
          ))}
        </ul>
      ) : (
        <SemLastro
          titulo="sem lastro · tendência"
          oQueFalta="Tendência exige comparar duas janelas de tempo, e o registro de etapa não cobre a janela anterior. Falta histórico de movimentação acumulado."
        />
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cartoes.map((cartao) => (
          <article key={cartao.chave} className="cc6-panel min-w-0 p-4">
            <p className="cc6-eyebrow flex items-center gap-1.5">
              <span aria-hidden="true" className="text-[0.9rem] leading-none">{cartao.emoji}</span>
              {cartao.titulo}
            </p>
            <div className="mt-2">{cartao.corpo}</div>
          </article>
        ))}
      </div>
      {/* Complemento sem custo: os insights que a própria página já calcula em
          memória a partir de leads e tarefas. Eles NÃO vêm de `ai_insights` —
          essa tabela está vazia — e por isso vêm rotulados como cálculo local. */}
      {insightsLocais.length ? (
        <p className="text-rotulo leading-5 text-[var(--atlas-texto-medio)]">
          <span className="font-semibold text-[var(--atlas-texto-forte)]">Calculado no instantâneo desta tela:</span>{" "}
          {insightsLocais.map((i) => i.conteudo).join(" ")}
        </p>
      ) : null}
    </div>
  );
}

function CorpoDoSinal({ sinal }: { sinal: SinalDoBriefing }) {
  return (
    <>
      <p className="text-corpo font-medium text-[var(--atlas-texto-forte)]">{sinal.title}</p>
      <p className="mt-1 text-rotulo leading-5 text-[var(--atlas-texto-medio)]">{sinal.evidence}</p>
      {sinal.href ? (
        <Link
          href={sinal.href}
          className="mt-1 inline-flex min-h-11 items-center text-rotulo font-semibold text-[var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
        >
          {sinal.action} →
        </Link>
      ) : null}
    </>
  );
}
