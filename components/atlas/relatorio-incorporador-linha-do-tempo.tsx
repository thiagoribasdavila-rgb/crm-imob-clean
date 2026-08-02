"use client";

import type { DiaDaSerie, LeituraDaSerie } from "@/lib/relatorio-incorporador/apuracao";
import { dinheiro } from "@/lib/relatorio-incorporador/apuracao";

/**
 * A LINHA DO TEMPO — o único gráfico do relatório, e ele existe por uma
 * pergunta que nenhuma tabela desta tela responde.
 *
 * ── POR QUE ESTE GRÁFICO PASSA E OUTROS NÃO ────────────────────────────────
 *
 * A tabela de campanhas já diz "gastou R$ 3.845,19 e 0 leads apontam". Um
 * gráfico de barras dos mesmos totais só reimprimiria aquilo maior. O que a
 * tabela NÃO consegue dizer é *quando*:
 *
 *   · em que dias o dinheiro saiu e ninguém entrou;
 *   · em que dias entrou gente e o dinheiro não saiu;
 *   · em que dias o feed de gasto simplesmente não cobre nada;
 *   · e qual pico de volume é planilha importada, não mídia.
 *
 * Essas quatro formas são as quatro metades do buraco de atribuição, e só
 * existem quando os dois eixos dividem o mesmo tempo. Nenhum número daqui é
 * repetido em tabela nenhuma da página.
 *
 * ── DUAS FAIXAS, NÃO DOIS EIXOS ────────────────────────────────────────────
 *
 * Sobrepor reais e leads num eixo duplo deixa a escala escolher a conclusão:
 * basta esticar um lado para as curvas "casarem". Duas faixas empilhadas com o
 * MESMO eixo horizontal entregam a co-ocorrência no tempo sem afirmar
 * proporção nenhuma entre as grandezas.
 *
 * ── E O QUE ELE NÃO DIZ ────────────────────────────────────────────────────
 *
 * Coincidir no tempo não é atribuir. Duas séries podem subir juntas por
 * sazonalidade, por outra campanha, por acaso. O gráfico mostra a forma; quem
 * liga uma ponta na outra é a chave de campanha na lead — que é justamente a
 * que está faltando.
 */

/** Geometria em unidades de usuário do SVG. O texto é HTML, fora do SVG, para
 *  não encolher junto com a escala. */
const ALTURA_FAIXA = 46;
const VAO_ENTRE_FAIXAS = 12;
const LARGURA_POR_DIA = 12;
const FOLGA_DA_BARRA = 2.4;

const tinta = (token: string, porcento: number) =>
  `color-mix(in srgb, var(${token}) ${porcento}%, transparent)`;

const dataCurta = (dia: string) => {
  const [, mes, diaDoMes] = dia.split("-");
  return `${diaDoMes}/${mes}`;
};

export function RelatorioIncorporadorLinhaDoTempo({
  serie,
  leitura,
}: {
  serie: DiaDaSerie[];
  leitura: LeituraDaSerie;
}) {
  if (!serie.length) return null;

  const largura = serie.length * LARGURA_POR_DIA;
  const alturaTotal = ALTURA_FAIXA * 2 + VAO_ENTRE_FAIXAS;
  const gastoMaximo = Math.max(...serie.map((d) => d.gasto ?? 0), 1);
  const midiaMaxima = Math.max(...serie.map((d) => d.leadsDeMidia), 1);
  const larguraDaBarra = Math.max(1, LARGURA_POR_DIA - FOLGA_DA_BARRA);

  const resumoParaLeitorDeTela = [
    `Linha do tempo de ${serie.length} dias.`,
    leitura.coberturaDoGasto
      ? `O feed de gasto cobre ${dataCurta(leitura.coberturaDoGasto.de)} a ${dataCurta(leitura.coberturaDoGasto.ate)}, ${leitura.diasMedidos} dias.`
      : "Nenhum dia com gasto medido.",
    `${leitura.diasComGastoESemLead} dia(s) tiveram gasto e nenhuma lead de mídia, somando ${dinheiro(leitura.gastoEmDiasSemLead)}.`,
    `${leitura.diasComLeadESemGasto} dia(s) medidos tiveram lead de mídia sem gasto, somando ${leitura.leadsEmDiasSemGasto} lead(s).`,
    leitura.maiorDiaDeImportacao
      ? `O maior volume de um dia foi importação de planilha: ${leitura.maiorDiaDeImportacao.leads} leads em ${dataCurta(leitura.maiorDiaDeImportacao.dia)}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="px-5 pb-5 sm:px-6">
      <svg
        viewBox={`0 0 ${largura} ${alturaTotal}`}
        className="block h-auto w-full"
        role="img"
        aria-label={resumoParaLeitorDeTela}
      >
        <defs>
          {/* Hachura = "a conta de anúncio não respondeu por este dia". Barra de
              altura zero diria "gastou zero", e ninguém mediu isso. */}
          <pattern id="rel-inc-nao-medido" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={tinta("--atlas-texto-fraco", 34)} strokeWidth="1.4" />
          </pattern>
        </defs>

        {serie.map((dia, indice) => {
          const x = indice * LARGURA_POR_DIA + FOLGA_DA_BARRA / 2;

          if (!dia.gastoMedido) {
            return (
              <rect
                key={`gasto-${dia.dia}`}
                x={x}
                y={0}
                width={larguraDaBarra}
                height={ALTURA_FAIXA}
                fill="url(#rel-inc-nao-medido)"
              >
                <title>{`${dataCurta(dia.dia)} · gasto não medido — o feed da conta de anúncio não cobre este dia`}</title>
              </rect>
            );
          }

          const valor = dia.gasto ?? 0;
          const altura = valor > 0 ? Math.max(1.2, (valor / gastoMaximo) * ALTURA_FAIXA) : 0;
          // Dia em que saiu dinheiro e nenhuma lead de mídia entrou: a metade do
          // buraco que só a linha do tempo mostra.
          const dinheiroSemGente = valor > 0 && dia.leadsDeMidia === 0;
          return (
            <g key={`gasto-${dia.dia}`}>
              {altura > 0 ? (
                <rect
                  x={x}
                  y={ALTURA_FAIXA - altura}
                  width={larguraDaBarra}
                  height={altura}
                  rx={1}
                  fill={dinheiroSemGente ? tinta("--atlas-estado-perigo", 72) : tinta("--atlas-accent", 62)}
                />
              ) : null}
              <rect x={x} y={0} width={larguraDaBarra} height={ALTURA_FAIXA} fill="transparent">
                <title>
                  {`${dataCurta(dia.dia)} · ${dinheiro(valor)} · ${dia.impressoes.toLocaleString("pt-BR")} impressões · ${dia.cliques} cliques${dinheiroSemGente ? " · nenhuma lead de mídia neste dia" : ""}`}
                </title>
              </rect>
            </g>
          );
        })}

        <line
          x1="0"
          y1={ALTURA_FAIXA + VAO_ENTRE_FAIXAS / 2}
          x2={largura}
          y2={ALTURA_FAIXA + VAO_ENTRE_FAIXAS / 2}
          stroke={tinta("--atlas-texto-fraco", 30)}
          strokeWidth="1"
        />

        {serie.map((dia, indice) => {
          const x = indice * LARGURA_POR_DIA + FOLGA_DA_BARRA / 2;
          const base = ALTURA_FAIXA + VAO_ENTRE_FAIXAS;
          const altura = dia.leadsDeMidia > 0
            ? Math.max(1.2, (dia.leadsDeMidia / midiaMaxima) * ALTURA_FAIXA)
            : 0;
          // Lead que entrou em dia medido sem gasto — a outra metade do buraco.
          const genteSemDinheiro = dia.gastoMedido && (dia.gasto ?? 0) === 0 && dia.leadsDeMidia > 0;
          return (
            <g key={`leads-${dia.dia}`}>
              {altura > 0 ? (
                <rect
                  x={x}
                  y={base}
                  width={larguraDaBarra}
                  height={altura}
                  rx={1}
                  fill={genteSemDinheiro ? tinta("--atlas-estado-atencao", 78) : tinta("--atlas-estado-sucesso", 62)}
                />
              ) : null}
              {/* Importação de planilha NÃO entra na barra de mídia: 270 linhas
                  num dia fariam a escala inteira mentir e o dia parecer o melhor
                  da campanha. Vira um losango, com a contagem no rótulo. */}
              {dia.leadsImportadas > 0 ? (
                <path
                  d={`M ${x + larguraDaBarra / 2} ${base + ALTURA_FAIXA - 6} l 3.2 3.2 l -3.2 3.2 l -3.2 -3.2 z`}
                  fill={tinta("--atlas-texto-medio", 80)}
                />
              ) : null}
              <rect x={x} y={base} width={larguraDaBarra} height={ALTURA_FAIXA} fill="transparent">
                <title>
                  {`${dataCurta(dia.dia)} · ${dia.leadsDeMidia} lead(s) de mídia`
                    + (dia.leadsImportadas ? ` · ${dia.leadsImportadas} importada(s) de planilha` : "")
                    + (dia.leadsOutras ? ` · ${dia.leadsOutras} de outra origem` : "")
                    + (genteSemDinheiro ? " · sem gasto registrado neste dia" : "")}
                </title>
              </rect>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex items-center justify-between text-rotulo text-[var(--atlas-texto-fraco)]">
        <span>{dataCurta(serie[0].dia)}</span>
        {leitura.coberturaDoGasto ? (
          <span>
            feed de gasto: {dataCurta(leitura.coberturaDoGasto.de)}–{dataCurta(leitura.coberturaDoGasto.ate)}
          </span>
        ) : null}
        <span>{dataCurta(serie[serie.length - 1].dia)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="cc6-eyebrow text-rotulo!">Leitura</span>
        <Legenda cor={tinta("--atlas-accent", 62)} texto="gasto do dia" />
        <Legenda cor={tinta("--atlas-estado-perigo", 72)} texto="gastou e nenhuma lead de mídia" />
        <Legenda cor={tinta("--atlas-estado-sucesso", 62)} texto="leads de mídia" />
        <Legenda cor={tinta("--atlas-estado-atencao", 78)} texto="lead sem gasto no dia" />
        <Legenda cor={tinta("--atlas-texto-medio", 80)} texto="importação de planilha" losango />
        <Legenda cor={tinta("--atlas-texto-fraco", 34)} texto="gasto não medido" hachurado />
      </div>
    </div>
  );
}

function Legenda({
  cor,
  texto,
  losango = false,
  hachurado = false,
}: {
  cor: string;
  texto: string;
  losango?: boolean;
  hachurado?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 ${losango ? "rotate-45" : "rounded-[2px]"}`}
        style={
          hachurado
            ? { border: `1px solid ${cor}`, background: "transparent" }
            : { background: cor }
        }
      />
      {texto}
    </span>
  );
}

export default RelatorioIncorporadorLinhaDoTempo;
