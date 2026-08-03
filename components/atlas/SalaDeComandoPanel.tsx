"use client";

/**
 * SALA DE COMANDO — os seis indicadores e o funil.
 *
 * ── AS TRÊS DECISÕES DE DESENHO, E O PORQUÊ DE CADA UMA ─────────────────────
 *
 * 1. SVG e div, nunca canvas. Canvas não tem texto, não é lido por leitor de
 *    tela e nenhum dos contratos deste projeto consegue inspecioná-lo. O
 *    Sparkline que existe nesta base crava `#38bdf8` e fundo escuro — quebra no
 *    tema claro, que é justamente o tema de quem está no sol entre visitas.
 *
 * 2. Cor só como ESTADO, nunca como enfeite. Esta base já pagou duas limpezas de
 *    over-design (balanço 3D em 34 telas, botões flutuantes). Aqui não há glow,
 *    gradiente decorativo nem movimento: a densidade vem de número por
 *    centímetro e de limiar desenhado, que é o que o diretor lê em cinco minutos.
 *
 * 3. Etapa vazia é DESENHADA, com o motivo — e o motivo precisa ser VERDADE.
 *
 *    A primeira versão escrevia, em toda etapa vazia: "o funil não está travado
 *    aqui, ele não chegou até aqui". Medido em 2026-07-30 contra
 *    `pipeline_stage_moves`: FALSO. 2 leads alcançaram visita, 3 alcançaram
 *    proposta, 3 alcançaram contrato. Elas chegaram e SAÍRAM.
 *
 *    "Não chegou" e "chegou e vazou" mandam a direção fazer coisas opostas — a
 *    primeira manda empurrar topo, a segunda manda descobrir quem largou a lead
 *    depois da visita. Uma frase honesta na FORMA e falsa no CONTEÚDO é pior que
 *    barra muda, porque convence. Por isso cada etapa carrega dois números:
 *    quantas estão aqui agora e quantas já passaram por aqui.
 *
 * ── SUPERFÍCIE POR TOKEN, NÃO POR COR CRAVADA ──────────────────────────────
 *
 * Medido no `app/globals.css`: o tema claro sobrescreve `text-white`,
 * `text-slate-200/400/500` (2 regras cada) — o TEXTO estava coberto. O que NÃO
 * tem regra nenhuma é a superfície: `bg-white/[.03]`, `bg-white/[.05]` e
 * `border-white/10`, que esta primeira versão usava. Branco a 3% sobre fundo
 * claro é card sem superfície e barra sem trilha. Agora a superfície vem de
 * `atlas-panel` e o acento de `var(--atlas-accent)`, que o tema claro redefine.
 */

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import {
  AlertasInteligentes,
  AtividadesEmTempoReal,
  CartaoKpi,
  EvolucaoDeLeads,
  InsightsDoCopiloto,
  PerformanceDaEquipe,
  SemLastro,
  TopProjetosPorLeads,
  type DeltaLeadsTotais,
  type DeltasDeEstado,
  type Equipe,
  type Evolucao,
  type InsightLocal,
  type ItemDoFeed,
  type PontoCego,
  type SinalDoBriefing,
  type TopProjetos,
} from "@/components/atlas/sala-de-comando-faixas";

type Etapa = {
  chave: string;
  rotulo: string;
  quantidade: number;
  jaPassaram: number;
  percentualDoTopo: number | null;
  porqueVazia: string | null;
};

type Dados = {
  indicadores: {
    leadsTotais: number;
    emAberto: number;
    emAtendimento: number;
    emNegociacao: number;
    vgvFechado: number;
    vgvEmNegociacaoIndisponivel: string | null;
    vendasSemValorInformado: number;
    corretoresComCarteira: number;
    comPrimeiroContato: number;
  };
  conversao: {
    ganhos: number;
    perdidos: number;
    base: number;
    taxa: number | null;
    afirmavel: boolean;
    porqueNaoAfirmavel: string | null;
  };
  funil: Etapa[];
  saidasDoFunil: {
    total: number;
    semPrimeiroContato: number;
    semMotivoEscrito: number;
    direitoDeNovo: number;
    diasAteSair: { media: number; minimo: number; maximo: number; medidas: number } | null;
    mensuravel: boolean;
  };
  investimento: {
    importado: boolean;
    investimentoTotal: number;
    leadsAtribuidas: number;
    campanhas: Array<{ externalId: string; nome: string; reais: number; leads: number; cpl: number | null }>;
    gastoSemLead: { campanhas: number; reais: number };
    leadSemGasto: { campanhas: number; leads: number };
    cplGlobal: number | null;
    porqueSemCpl: string | null;
    periodo: { de: string | null; ate: string | null };
    amostraTruncada: boolean;
  };
  procedencia: {
    amostraTruncada: boolean;
    registroDeMovimentoDesde: string | null;
    registroDeMovimentoMensuravel: boolean;
    movimentosLidos: number;
  };
  /* Os quatro blocos da referência visual. Ver sala-de-comando-faixas.tsx. */
  deltaLeadsTotais: DeltaLeadsTotais;
  deltasDeEstado: DeltasDeEstado;
  evolucao: Evolucao;
  topProjetos: TopProjetos;
  equipe: Equipe;
  /** Quando a MEDIÇÃO foi feita. É esta a régua do "há X min", não o relógio
   *  do render — que além de impuro faria o mesmo item mudar de idade a cada
   *  repintura sem nada ter acontecido na operação. */
  geradoEm: string;
};

/**
 * ── O QUE A PÁGINA ENTREGA, E POR QUE NÃO É BUSCADO AQUI ───────────────────
 *
 * Onze dos catorze painéis desta referência não precisam de consulta nova: a
 * página já busca dez rotas. Feed, sinais e insights chegam por propriedade,
 * de `/api/ai/briefing` e do instantâneo de `/api/v1/core-v2/module-health`,
 * que a página JÁ buscou. Refazer essas chamadas aqui criaria uma segunda
 * verdade sobre o mesmo fato — que é a doença que este repositório mais paga.
 *
 * Todas são opcionais: `<SalaDeComandoPanel />` sem propriedade nenhuma
 * continua válido, e cada painel sem fonte nasce declarando o que falta em vez
 * de sumir.
 */
export type PropriedadesDaSala = {
  feed?: ItemDoFeed[];
  /** Leads lidas contra o total do módulo: divergiu, o feed diz "amostra". */
  feedAmostra?: { lidas: number; total: number | null } | null;
  /** Momento da leitura, para o "há X min" não depender do relógio do render. */
  referenciaMs?: number;
  sinais?: SinalDoBriefing[];
  sinaisIndisponivel?: boolean;
  pontosCegos?: PontoCego[];
  insightsLocais?: InsightLocal[];
};

const inteiro = (n: number) => n.toLocaleString("pt-BR");
/**
 * Decimal em pt-BR. O tile removido hoje imprimia `{valor}` cru e saía "0.2%"
 * com PONTO numa tela em português — e o mesmo descuido apareceu aqui em
 * "23.4 dias" antes de ser pego na verificação em tela.
 */
const decimal = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Data ISO em dd/mm — a tela é em português e o gráfico é curto. */
const dataCurta = (iso: string) => {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return dia && mes ? `${dia}/${mes}` : (ano ?? iso);
};
const brl = (n: number) =>
  n >= 1_000_000
    ? `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Indicador({
  rotulo,
  valor,
  detalhe,
  alerta,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string | null;
  alerta?: boolean;
}) {
  return (
    // `atlas-panel` porque ele muda de superfície com o tema; `bg-white/[.03]`
    // não muda, e no claro vira branco sobre branco.
    <div
      className={
        alerta
          ? "rounded-2xl border border-amber-400/25 bg-amber-400/[.06] p-4"
          : "atlas-panel rounded-2xl p-4"
      }
    >
      <p className="text-rotulo font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{valor}</p>
      {/* O detalhe carrega o DENOMINADOR ou o motivo. Número sem denominador foi
          como "442 leads" virou um dado sem significado nesta base. */}
      {/* ── O AVISO PRECISA SER LEGÍVEL NO TEMA EM QUE ELE APARECE ───────────
          MEDIDO no navegador, tema claro, 02/08/2026: `text-amber-300` sobre a
          tinta de alerta dá 1,40:1 em 11px. O piso é 4,5:1 — este texto não
          estava fraco, estava AUSENTE para quem lê no claro, e o que ele diz é
          "de 489 — o resto nunca foi tocado". `var(--atlas-warning)` vira com o
          tema (âmbar escuro no claro) e mede 5,19:1. A superfície âmbar fica: ela
          funciona nos dois temas; era só o TEXTO que não virava. Herança carrega
          valor computado, não referência — fundo e cor são um par. */}
      {detalhe ? (
        <p className={`mt-1 text-rotulo leading-4 ${alerta ? "text-[var(--atlas-warning)]" : "text-slate-500"}`}>{detalhe}</p>
      ) : null}
    </div>
  );
}

/**
 * SAÍDAS DO FUNIL — a pergunta da verba, respondida pelo lado que tem dado.
 *
 * Este bloco nasceu quando o lado da compra estava cego (`marketing_spend` com
 * ZERO linhas). Desde 31/07/2026 o gasto é importado e mora no card acima — mas
 * este continua sendo a metade mais acionável da conta, porque responde algo que
 * o custo não responde: a lead que saiu do funil chegou a ser trabalhada?
 *
 * Cada número traz o DENOMINADOR ao lado. "100 sem contato" é uma informação
 * diferente de "100 de 104 sem contato" — a segunda decide, a primeira só assusta.
 */
function SaidasDoFunil({ dados }: { dados: Dados["saidasDoFunil"] }) {
  if (!dados.mensuravel) {
    return (
      <p className="text-xs leading-5 text-slate-400">
        Não foi possível ler o histórico de movimentação. As saídas do funil estão indisponíveis — não são zero.
      </p>
    );
  }
  if (dados.total === 0) {
    return (
      <p className="text-xs leading-5 text-slate-400">
        Nenhuma saída do funil registrada na janela medida.
      </p>
    );
  }

  const proporcao = (n: number) => Math.round((n / dados.total) * 100);
  const semContato = proporcao(dados.semPrimeiroContato);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-white">{inteiro(dados.total)}</p>
          <p className="mt-0.5 text-rotulo leading-4 text-slate-500">saíram do funil (perdido ou comprou em outro lugar)</p>
        </div>
        <div>
          {/* MEDIDO no claro: 1,45:1 em 24px, piso 3:1. E este é o número mais
              acusador da tela — 403 de 414 leads saíram sem uma única ligação.
              O número que mais pesa era o menos visível. */}
          <p className={`text-2xl font-semibold tabular-nums ${semContato >= 50 ? "text-[var(--atlas-warning)]" : "text-white"}`}>
            {inteiro(dados.semPrimeiroContato)}
            <span className="ml-1 text-sm font-normal text-slate-500">de {inteiro(dados.total)}</span>
          </p>
          <p className="mt-0.5 text-rotulo leading-4 text-slate-500">saíram sem nenhum primeiro contato registrado</p>
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-white">
            {inteiro(dados.semMotivoEscrito)}
            <span className="ml-1 text-sm font-normal text-slate-500">de {inteiro(dados.total)}</span>
          </p>
          <p className="mt-0.5 text-rotulo leading-4 text-slate-500">saíram sem motivo escrito</p>
        </div>
      </div>
      {/* A frase de baixo é o que transforma três números numa decisão. */}
      <p className="text-rotulo leading-5 text-slate-400">
        {dados.direitoDeNovo > 0 ? (
          <>
            {inteiro(dados.direitoDeNovo)} de {inteiro(dados.total)} foram direto de &quot;novo&quot; para a saída
            {dados.diasAteSair ? (
              <>
                , depois de{" "}
                <strong className="font-semibold text-slate-300">{decimal(dados.diasAteSair.media)} dias</strong> em
                média na base (do mais rápido, {decimal(dados.diasAteSair.minimo)}, ao mais lento,{" "}
                {decimal(dados.diasAteSair.maximo)}). Nenhum descarte foi impulsivo — foram leads guardadas e depois
                largadas.
              </>
            ) : null}
          </>
        ) : (
          <>Todas as saídas passaram por alguma etapa antes de sair.</>
        )}
        {semContato >= 50 ? (
          <>
            {" "}
            Com {semContato}% saindo sem uma única ligação, o gargalo não está na origem da lead: está no atendimento.
            Comprar mais mídia antes de atender aumenta o mesmo desperdício.
          </>
        ) : null}
      </p>
    </div>
  );
}

/**
 * O DINHEIRO, E SE ELE ENCONTRA AS LEADS.
 *
 * Este bloco nasceu no dia em que `marketing_spend` deixou de ser uma tabela
 * vazia — e a primeira coisa que ele mostrou foi que o gasto e as leads vêm de
 * contas de anúncio diferentes.
 *
 * A tentação, aqui, é imprimir "CPL: R$ 150,50" (R$ 3.612,01 ÷ 24). O número é
 * redondo, cabe num tile e é FALSO: divide o custo de uma conta pelo resultado
 * de outra. A régua deste componente é a mesma da rota — CPL só aparece onde as
 * duas pontas são da MESMA campanha.
 */
function Investimento({ dados }: { dados: Dados["investimento"] }) {
  if (!dados.importado) {
    return (
      <p className="text-xs leading-5 text-slate-400">
        Nenhum investimento importado ainda. O worker <code className="text-slate-300">investimento-de-midia</code> grava
        o gasto da Meta uma vez por dia — enquanto ele não roda, custo por lead e retorno não são zero: são desconhecidos.
      </p>
    );
  }

  const comAsDuasPontas = dados.campanhas.filter((c) => c.cpl !== null);
  const maiorGasto = Math.max(1, ...dados.campanhas.map((c) => c.reais));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-white">{brl(dados.investimentoTotal)}</p>
          <p className="mt-0.5 text-rotulo leading-4 text-slate-500">
            investidos{dados.periodo.de && dados.periodo.ate ? ` entre ${dataCurta(dados.periodo.de)} e ${dataCurta(dados.periodo.ate)}` : ""}
          </p>
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-white">{inteiro(dados.leadsAtribuidas)}</p>
          <p className="mt-0.5 text-rotulo leading-4 text-slate-500">leads com campanha de origem identificada</p>
        </div>
        <div>
          {dados.cplGlobal !== null ? (
            <>
              <p className="text-2xl font-semibold tabular-nums text-white">{brl(dados.cplGlobal)}</p>
              <p className="mt-0.5 text-rotulo leading-4 text-slate-500">
                custo por lead, sobre {inteiro(comAsDuasPontas.length)} campanha{comAsDuasPontas.length === 1 ? "" : "s"} com as duas pontas
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums text-slate-600">—</p>
              <p className="mt-0.5 text-rotulo leading-4 text-slate-500">custo por lead não pode ser afirmado</p>
            </>
          )}
        </div>
      </div>

      {/* A frase que impede o número falso de nascer — e que MEDIDA no tema
          claro dava 1,18:1 em 11px, o pior contraste desta tela. A única frase
          da página cujo trabalho é impedir uma decisão errada ("são contas de
          anúncio diferentes") era a que ninguém conseguia ler. */}
      {dados.porqueSemCpl ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-rotulo leading-5 text-[var(--atlas-warning)]">
          {dados.porqueSemCpl}
        </p>
      ) : null}

      <ul className="space-y-1.5">
        {dados.campanhas.slice(0, 8).map((campanha) => (
          <li key={campanha.externalId} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-rotulo leading-4 text-slate-400" title={campanha.nome}>{campanha.nome}</span>
              <span className="shrink-0 text-rotulo leading-4 tabular-nums text-slate-300">
                {campanha.reais > 0 ? brl(campanha.reais) : "sem gasto"}
                <span className="text-slate-600"> · </span>
                {campanha.leads > 0 ? `${inteiro(campanha.leads)} lead${campanha.leads === 1 ? "" : "s"}` : "0 leads"}
                {/* Mesmo defeito da faixa âmbar, medido na mesma passada: no
                    tema claro `text-emerald-300` fica sob o piso. Não aparecia
                    na varredura porque nenhuma campanha desta base tem as duas
                    pontas — ou seja, era um texto ilegível esperando o primeiro
                    dado que o fizesse nascer. `var(--atlas-success)` mede
                    5,48:1 no claro. */}
                {campanha.cpl !== null ? <span className="text-[var(--atlas-success)]"> · {brl(campanha.cpl)}/lead</span> : null}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full ${campanha.leads > 0 ? "bg-emerald-400/60" : "bg-amber-400/50"}`}
                style={{ width: `${Math.max(2, Math.round((campanha.reais / maiorGasto) * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {dados.campanhas.length > 8 ? (
        <p className="text-rotulo leading-4 text-slate-500">
          Mostrando as 8 de maior gasto, de {inteiro(dados.campanhas.length)} campanhas.
        </p>
      ) : null}
      {dados.amostraTruncada ? (
        <p className="text-rotulo leading-4 text-[var(--atlas-warning)]">
          A leitura foi truncada: estes totais estão sobre amostra, não sobre a base inteira.
        </p>
      ) : null}
    </div>
  );
}

/* A funcao `Funil` local foi removida junto com o painel duplicado: ela
   desenhava o MESMO grafico que components/atlas/PainelDaSala.tsx ja faz,
   com sete degraus e a conversao. Deixar a funcao viva depois de tirar o
   unico chamador seria guardar a proxima duplicata pronta para uso. */

export function SalaDeComandoPanel({
  feed = [],
  feedAmostra = null,
  referenciaMs,
  sinais = [],
  sinaisIndisponivel = false,
  pontosCegos = [],
  insightsLocais = [],
}: PropriedadesDaSala = {}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [semAcesso, setSemAcesso] = useState(false);
  const [semSessaoNoCliente, setSemSessaoNoCliente] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    /**
     * ── O TERCEIRO CAMINHO SILENCIOSO ─────────────────────────────────────
     *
     * Este `if (!token) return` era o mais traiçoeiro dos três. A aplicação
     * autentica por COOKIE (@supabase/ssr): a página inteira renderiza,
     * navegação funciona, o usuário está logado para todos os efeitos. Mas o
     * cliente do navegador pode não ter sessão em memória — medido acontecendo
     * em 2026-07-30, com a página servida e o painel sumindo por completo.
     *
     * O resultado é pior que erro: a tela funciona, MENOS este bloco, e não há
     * nada escrito. Quem vê conclui que o painel foi removido do produto.
     *
     * Agora o estado é declarado — e separado de "ainda carregando", porque
     * confundir os dois faria a mensagem de sessão piscar em toda montagem.
     */
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) {
      setSemSessaoNoCliente(true);
      setCarregando(false);
      return;
    }
    setSemSessaoNoCliente(false);
    try {
      const res = await fetch("/api/v1/analytics/sala-de-comando", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const corpo = await res.json().catch(() => null);
      // 403 é resposta legítima — a sala é de direção — mas ela NÃO pode virar
      // silêncio. Medido em 2026-07-30: 12 dos 15 perfis ativos da organização
      // são corretor, e a rota exige admin/director/superintendent/manager.
      // Com `return` mudo, esses 12 recebiam um <section> vazio: a tela não
      // dizia "você não tem acesso", dizia nada — indistinguível de painel
      // quebrado, e é assim que se abre um chamado de suporte por dia.
      if (res.status === 403) {
        setSemAcesso(true);
        return;
      }
      if (!res.ok) setErro(corpo?.error?.message ?? "Não foi possível medir a operação agora.");
      else setDados(corpo?.data ?? null);
    } catch {
      setErro("Falha de rede ao medir a operação.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (semSessaoNoCliente) {
    return (
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Sala de comando"
          title="Sessão não disponível neste navegador"
          description="A página carregou, mas a sessão do navegador expirou e os números não podem ser medidos com segurança. Recarregue a página ou entre novamente — este bloco não está vazio, está sem permissão de leitura."
        />
      </AtlasCard>
    );
  }
  if (semAcesso) {
    return (
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Sala de comando"
          title="Visão de direção"
          description="Os números consolidados da operação são de gerência e direção. A sua carteira e a sua fila continuam completas nas telas de leads e pipeline."
        />
      </AtlasCard>
    );
  }
  if (erro) {
    return (
      <AtlasCard>
        <AtlasCardHeader eyebrow="Sala de comando" title="Não foi possível medir" description={erro} />
      </AtlasCard>
    );
  }
  // `null` aqui é legítimo APENAS enquanto carrega. Depois disso, sumir é o
  // defeito que os três ramos acima existem para impedir.
  if (carregando) return null;
  if (!dados) {
    return (
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Sala de comando"
          title="Sem resposta para medir"
          description="A consulta retornou sem dados. Isto não significa operação vazia — significa que não houve leitura. Recarregue antes de decidir."
        />
      </AtlasCard>
    );
  }

  const { indicadores: i, conversao: c } = dados;

  const semLastroDeEstado = { tipo: "sem-lastro" as const, porque: dados.deltasDeEstado.porqueIndisponivel };
  const d = dados.deltaLeadsTotais;

  return (
    <div className="space-y-5">
      {/* ══════════════════════════════════════════════════════════════════
          FAIXA 1 · SEIS CARTÕES DE KPI — ícone, valor e delta.

          Os seis do desenho de referência vêm primeiro; os dois que esta tela
          já media e que a referência não lista vêm logo abaixo, na forma em
          que sempre estiveram. NADA foi apagado: "em aberto no funil", que era
          um detalhe do primeiro cartão, virou cartão próprio ("Leads ativos"),
          e a frase do VGV em negociação, que era detalhe do quarto, virou o
          cartão que a referência pede — declarado sem lastro.

          UM delta é medido, cinco são declarados. Não é economia: é a única
          coisa que a base sustenta, e está escrito em cada um deles.
          ══════════════════════════════════════════════════════════════════ */}
      {/* ── OS TRÊS PONTOS DE QUEBRA, COM PAPEL DECLARADO ────────────────────
          base (<768) EMPILHADO · md (≥768) DUAS COLUNAS · xl (≥1280) COMANDO.
          Antes daqui a grade quebrava em `sm` (640) e `lg` (1024) — dois
          degraus sem papel escrito, e um deles punha seis KPIs em três colunas
          de ~200px, que é onde "VGV em negociação" perde a linha. O degrau de
          seis colunas fica só no `2xl`, porque é a única largura em que a
          coluna passa de 250px. */}
      <section aria-label="Indicadores da operação" className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <CartaoKpi
            rotulo="Leads na base"
            glifo="base"
            valor={inteiro(i.leadsTotais)}
            delta={{
              tipo: "medido",
              percentual: d.variacaoPercentual,
              rotulo: `${d.rotulo}, ${d.janelaDias}d`,
              ressalva: d.ressalva,
            }}
          />
          <CartaoKpi
            rotulo="Leads ativos"
            glifo="ativos"
            valor={inteiro(i.emAberto)}
            detalhe="em aberto no funil"
            delta={semLastroDeEstado}
          />
          <CartaoKpi
            rotulo="Em atendimento"
            glifo="atendimento"
            valor={inteiro(i.emAtendimento)}
            detalhe="status contato"
            delta={semLastroDeEstado}
          />
          <CartaoKpi
            rotulo="Em negociação"
            glifo="negociacao"
            valor={inteiro(i.emNegociacao)}
            detalhe={i.emNegociacao === 0 ? "nenhuma oferta viva agora" : "proposta e contrato"}
            delta={semLastroDeEstado}
            estado={i.emNegociacao === 0 ? "atencao" : "neutro"}
          />
          {/* ── O CARTÃO QUE O MOCKUP MOSTRAVA COM "R$ 24,7M" ───────────────
              Confirmado por três caminhos independentes: não há lead em
              proposta ou contrato para somar; `sale_value_brl` está preenchida
              em 1 de 490 linhas; e a saída de fuga tentadora — somar
              `budget_max` — é o ORÇAMENTO DECLARADO DO COMPRADOR, não o valor
              do negócio, e está preenchida em 1 de 490. O cartão nasce
              declarando o que falta. */}
          <CartaoKpi
            rotulo="VGV em negociação"
            glifo="dinheiro"
            valorSemLastro={
              i.vgvEmNegociacaoIndisponivel ??
              "Falta valor de negócio preenchido na lead ao entrar em proposta ou contrato. Sem ele não há o que somar."
            }
            delta={semLastroDeEstado}
          />
          {/* A conversão é o único indicador que se RECUSA a mostrar número quando a
              amostra não sustenta. Uma venda em 482 não distingue 0,2% de 2%. */}
          <CartaoKpi
            rotulo="Conversão"
            glifo="conversao"
            valor={c.afirmavel && c.taxa !== null ? `${c.taxa}%` : `${c.ganhos} venda${c.ganhos === 1 ? "" : "s"}`}
            detalhe={c.afirmavel ? `${inteiro(c.ganhos)} de ${inteiro(c.base)}` : null}
            delta={
              c.afirmavel
                ? semLastroDeEstado
                : { tipo: "nenhum", detalhe: c.porqueNaoAfirmavel }
            }
            estado={c.afirmavel ? "neutro" : "atencao"}
          />
        </div>

        {/* Os dois indicadores que esta tela já media antes da referência. Eles
            não estão no desenho do dono, e continuam aqui exatamente como
            estavam — a referência acrescenta e reorganiza, não substitui. */}
        <div className="grid gap-3 md:grid-cols-2">
          <Indicador
            rotulo="Com primeiro contato"
            valor={inteiro(i.comPrimeiroContato)}
            detalhe={`de ${inteiro(i.leadsTotais)} — o resto nunca foi tocado`}
            alerta={i.comPrimeiroContato < i.leadsTotais * 0.1}
          />
          <Indicador
            rotulo="VGV fechado"
            valor={brl(i.vgvFechado)}
            detalhe={i.vendasSemValorInformado > 0 ? `${i.vendasSemValorInformado} venda sem valor informado` : null}
            alerta={i.vendasSemValorInformado > 0}
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          FAIXA 2 · FUNIL · ATIVIDADES · EQUIPE
          ══════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* O FUNIL SAIU DAQUI: ele existia DUAS vezes na Sala de Comando, com
            o mesmo titulo. O de cima (components/atlas/PainelDaSala.tsx) desenha
            os mesmos degraus com sete etapas e a conversao com denominador.
            Dois graficos do mesmo fato, um acima do outro, fazem o leitor
            procurar a diferenca que nao existe.
            O que este tinha de unico -- em aberto / ganhas / perdidas -- subiu
            para o painel de cima ANTES da remocao (commit 35cf6214): tirar
            redundancia nao pode custar informacao. */}

        <AtlasCard className="min-w-0">
          <AtlasCardHeader
            eyebrow="Atividades em tempo real"
            title="O que mudou por último"
            description="Leads e tarefas do instantâneo desta tela, das mais recentes para as mais antigas."
          />
          <div className="p-5 sm:p-6">
            <AtividadesEmTempoReal
              itens={feed}
              referenciaMs={referenciaMs ?? new Date(dados.geradoEm).getTime()}
              amostra={feedAmostra}
            />
            {/* O mockup pede ícone POR CANAL. Medido: `activities.type` tem UM
                único valor em 481 de 481 linhas, e messages/conversations/
                followups estão todas em zero. Seis ícones sobre um valor só é
                decoração que finge variedade. */}
            <p className="mt-3 border-t border-white/[.06] pt-3 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
              Sem ícone por canal: não há registro de interação por WhatsApp, ligação ou e-mail nesta base — todo
              evento registrado é mudança de etapa. Falta gravar o canal do toque para o feed poder distingui-los.
            </p>
          </div>
        </AtlasCard>

        <AtlasCard className="min-w-0">
          <AtlasCardHeader
            eyebrow="Performance da equipe"
            title="Como a carteira está distribuída"
            description="Ranking por volume de carteira. Conversão por pessoa só aparece acima do mesmo limiar que libera a taxa no total."
          />
          <div className="p-5 sm:p-6">
            <PerformanceDaEquipe equipe={dados.equipe} />
            {dados.equipe.porqueSemTaxaPorCorretor ? (
              <div className="mt-3">
                <SemLastro titulo="sem lastro · conversão por corretor" oQueFalta={dados.equipe.porqueSemTaxaPorCorretor} />
              </div>
            ) : null}
          </div>
        </AtlasCard>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          FAIXA 3 · EVOLUÇÃO · TOP PROJETOS · ALERTAS
          ══════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-4 xl:grid-cols-3">
        <AtlasCard className="min-w-0">
          <AtlasCardHeader
            eyebrow="Evolução de leads"
            title="O salto foi demanda ou importação?"
            description={`${inteiro(dados.evolucao.diasNaBase)} dias de base${dados.evolucao.serieTruncada ? `, mostrando os ${inteiro(dados.evolucao.dias.length)} mais recentes` : ""}.`}
          />
          <div className="p-5 sm:p-6">
            <EvolucaoDeLeads evolucao={dados.evolucao} />
          </div>
        </AtlasCard>

        <AtlasCard className="min-w-0">
          <AtlasCardHeader
            eyebrow="Top projetos"
            title={dados.topProjetos.rotulo}
            description="Ranking por LEADS, não por VGV — o rótulo diz o que o número é."
          />
          <div className="p-5 sm:p-6">
            <TopProjetosPorLeads dados={dados.topProjetos} />
          </div>
        </AtlasCard>

        <AtlasCard className="min-w-0">
          <AtlasCardHeader
            eyebrow="Alertas inteligentes"
            title="O que pede decisão agora"
            description="Sinais com severidade e destino, do briefing que esta página já busca."
          />
          <div className="p-5 sm:p-6">
            <AlertasInteligentes sinais={sinais} indisponivel={sinaisIndisponivel} />
          </div>
        </AtlasCard>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          FAIXA 4 · INSIGHTS DO COPILOTO
          ══════════════════════════════════════════════════════════════════ */}
      <section aria-label="Insights do copiloto" className="space-y-3">
        <p className="cc6-eyebrow">Insights do copiloto</p>
        <InsightsDoCopiloto
          sinais={sinais}
          pontosCegos={pontosCegos}
          insightsLocais={insightsLocais}
          indisponivel={sinaisIndisponivel}
        />
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          FAIXA 5 · AS DUAS METADES DA MESMA CONTA, LADO A LADO NO COMANDO

          MEDIDO no navegador, diretor, 1440×900: estes dois cartões eram os
          únicos da medição ainda empilhados em largura inteira — 530px e 259px,
          um sobre o outro, enquanto as faixas 2 e 3 acima já dividiam a linha
          em três. Somavam 789px de altura para desenhar duas listas curtas num
          cartão de 1.066px de largura.

          Eles são pares de conteúdo, não vizinhos por acaso: um responde
          "quanto custou trazer a lead", o outro "ela chegou a ser trabalhada
          antes de ser largada". Ler os dois lado a lado é a comparação — e é o
          papel do ponto de quebra `xl`, o de COMANDO.

          `items-start` para que o cartão mais curto não estique até a altura do
          mais alto: espaço em branco esticado dentro de um cartão é o que faz
          parecer que falta conteúdo.
          ══════════════════════════════════════════════════════════════════ */}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {/* O lado da COMPRA. Ficou fora desta tela enquanto `marketing_spend`
            estava vazia — e o comentário da rota dizia exatamente isso. Entrou no
            dia em que o importador passou a gravar, com a régua de que CPL só
            aparece onde gasto e lead são da mesma campanha. */}
        <AtlasCard className="min-w-0">
          <AtlasCardHeader
            eyebrow="Investimento"
            title="O dinheiro encontra as leads?"
            description="Gasto real importado da conta de anúncios, campanha a campanha, confrontado com as leads que declararam vir de cada uma."
          />
          <div className="p-5 sm:p-6">
            <Investimento dados={dados.investimento} />
          </div>
        </AtlasCard>

        {/* É a mesma história vista pelo outro lado. O funil mostra onde as
            leads estão; este mostra como as que já não estão foram embora. */}
        <AtlasCard className="min-w-0">
          <AtlasCardHeader
            eyebrow="Saídas do funil"
            title="Como as leads que saíram foram embora"
            description="A outra metade da conta: não quanto custou a lead, e sim se ela chegou a ser trabalhada antes de ser largada."
          />
          <div className="p-5 sm:p-6">
            <SaidasDoFunil dados={dados.saidasDoFunil} />
          </div>
        </AtlasCard>
      </div>
    </div>
  );
}
