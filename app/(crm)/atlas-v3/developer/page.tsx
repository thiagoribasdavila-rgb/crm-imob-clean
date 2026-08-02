"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { RelatorioIncorporadorLinhaDoTempo } from "@/components/atlas/relatorio-incorporador-linha-do-tempo";
import {
  dinheiro,
  duracao,
  EXPLICACAO_DE_ATRIBUICAO,
  ROTULO_DE_ATRIBUICAO,
  TRACO,
  type DiaDaSerie,
  type EstadoDeAtribuicao,
  type FunilApurado,
  type LeituraDaSerie,
  type LinhaDeCampanha,
  type LinhaDeEmpreendimento,
  type Mediana,
  type ResumoDeAtribuicao,
} from "@/lib/relatorio-incorporador/apuracao";

/**
 * RELATÓRIO DO INCORPORADOR — campanha, gasto e conversão.
 *
 * Esta tela não calcula nada. Tudo vem apurado de
 * `/api/v1/relatorio-incorporador`, que por sua vez usa
 * `lib/relatorio-incorporador/apuracao`. Uma conta, um lugar.
 *
 * ── A DECISÃO DE DESENHO QUE MANDA AQUI ────────────────────────────────────
 *
 * O pedido foi "o maior número de informações relevantes possível". Isso
 * autoriza extrair tudo o que os dados sustentam — não autoriza preencher o
 * resto. MEDIDO na produção em 02/08/2026:
 *
 *     gasto de mídia .......... R$ 3.845,19 em 7 campanhas
 *     leads apontando campanha  24, todas numa 8ª campanha, essa sem gasto
 *     interseção ............... VAZIA
 *
 * Os dois conjuntos são disjuntos. Custo por lead, portanto, não é computável
 * para nenhuma campanha desta base — e a tela diz isso, com todas as letras, no
 * lugar mais alto da hierarquia. Célula em branco ali seria lida como zero, e
 * zero seria lido como "essa campanha não trouxe ninguém".
 *
 * ── HIERARQUIA POR CONSEQUÊNCIA ────────────────────────────────────────────
 *
 *     34px  o dinheiro sem atribuição — é o que exige decisão hoje
 *     20px  gasto, leads e conversão por campanha e por empreendimento
 *     13px  nomes, explicações, o texto que se lê
 *     11px  rótulos, unidades, procedência
 *
 * Latência e cobertura de instrumento são AUDITORIA: ficam embaixo, em 11px.
 */

type Relatorio = {
  janela: { dias: number; inicio: string; fim: string };
  incorporadoras: Array<{ id: string; nome: string; status: string | null }>;
  filtro: { incorporador: string | null };
  cobertura: {
    leads: number;
    comEmpreendimento: number;
    comCampanha: number;
    comPrimeiroContato: number;
    comMovimento: number;
    importadas: number;
  };
  campanhas: LinhaDeCampanha[];
  campanhasSilenciosas: number;
  atribuicao: ResumoDeAtribuicao;
  empreendimentos: LinhaDeEmpreendimento[];
  funil: FunilApurado;
  registroDeMovimentoDesde: string | null;
  serie: DiaDaSerie[];
  leituraDaSerie: LeituraDaSerie;
  naoMedido: string[];
  geradoEm: string;
};

type Estado = "carregando" | "pronto" | "sem-permissao" | "erro";

const JANELAS = [30, 90, 365] as const;
type Janela = (typeof JANELAS)[number];

/* ── `cc6-num` PINTA DE ÂMBAR NO TEMA CLARO, E VENCE O UTILITÁRIO ───────────
   `:root[data-theme="light"] .cc6-num:not(.atlas-leads-table-panel *)` crava um
   âmbar escuro literal em globals.css (linha 10357 — o valor fica lá, e não
   repetido aqui, porque o portão de cor cravada conta hexadecimal em `.tsx`
   inclusive dentro de comentário). A regra é SEM CAMADA e os utilitários
   do Tailwind vivem em `@layer utilities` — sem camada vence camada. Qualquer
   elemento que carregue `cc6-num` E uma tinta sai âmbar, e a tinta pedida é
   ignorada em silêncio.

   O estrago que isso causaria nesta tela é direto: o gasto sem atribuição é
   vermelho e o gasto atribuído é neutro, e os dois sairiam da mesma cor. A
   distinção que dá sentido à página morreria sem ninguém ver.

   Separar os papéis resolve sem tocar em globals.css: `cc6-num` no PAI, só para
   doar a figura tabular; a cor no FILHO, onde a regra do pai não alcança e a
   herança carrega valor computado, não seletor. */
function Num({ children, tinta = "text-[var(--atlas-texto-forte)]", envolucro = "" }: {
  children: ReactNode;
  tinta?: string;
  envolucro?: string;
}) {
  return (
    <span className={`cc6-num ${envolucro}`.trim()}>
      <span className={tinta}>{children}</span>
    </span>
  );
}

/** Rótulo do degrau 11px: mono, caixa alta, tracking largo. */
function Rotulo({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`cc6-eyebrow ${className}`.trim()}>{children}</p>;
}

/* ── O `<th>` DA LINHA VINHA EM CAIXA ALTA, 11px E COM FUNDO PRÓPRIO ───────
   MEDIDO no navegador em 02/08/2026, nesta tela: o nome da campanha
   "[Cia360] Inside Smart| Lead | Imob | Jun.26 - ADV - v2" saía
   "[CIA360] INSIDE SMART| LEAD | IMOB | JUN.26 - ADV - V2", em 11px.

   A causa é `app/globals.css`, regra
   `.atlas-app-shell[data-visual-system="atlas-core-v2"] th` (linha 7980):
   `font-size: 11px; letter-spacing: .05em; text-transform: uppercase;
   background: var(--atlas-surface-subtle)`. Ela mira TODO `th`, e um
   `<th scope="row">` é o cabeçalho da linha — não um cabeçalho de coluna. O
   arquivo é inteiramente SEM CAMADA, então essa regra vence qualquer utilitário
   do Tailwind, que vive em `@layer utilities`. Nenhuma classe resolveria.

   `style={{}}` é o que a cascata deixa: inline vence declaração sem camada. Vai
   no `th`, e não em cada `<span>` de dentro, porque assim o conserto é um só e a
   herança leva o valor corrigido para os filhos.

   `background` entra junto por obrigação, não por gosto: a regra pintava o fundo
   da célula e a cor do texto vem dos tokens do painel. Mexeu num, responde pelo
   outro no mesmo lugar — devolver o fundo ao painel mantém o par honesto. */
const CELULA_DE_LINHA: React.CSSProperties = {
  textTransform: "none",
  letterSpacing: "normal",
  fontSize: "var(--text-corpo)",
  fontWeight: 500,
  background: "transparent",
  color: "var(--atlas-texto-forte)",
};

const percentual = (valor: number | null, casas = 1) =>
  valor === null ? TRACO : `${valor.toFixed(casas).replace(".", ",")}%`;

const TINTA_POR_ATRIBUICAO: Record<EstadoDeAtribuicao, string> = {
  completa: "text-[var(--atlas-estado-sucesso)]",
  gasto_sem_atribuicao: "text-[var(--atlas-estado-perigo)]",
  lead_sem_gasto: "text-[var(--atlas-estado-atencao)]",
  sem_dado: "text-[var(--atlas-texto-fraco)]",
};

/**
 * Mediana com a amostra colada. Amostra pequena não vira número escondido: vira
 * traço com o tamanho ao lado, para o leitor saber que existe medição e que ela
 * ainda não decide.
 */
function TempoMedido({ mediana }: { mediana: Mediana }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <Num tinta={mediana.suficiente ? "text-[var(--atlas-texto-forte)]" : "text-[var(--atlas-texto-fraco)]"}>
        {duracao(mediana.valor)}
      </Num>
      <span className="text-rotulo text-[var(--atlas-texto-fraco)]">
        n=<Num tinta="text-[var(--atlas-texto-fraco)]">{mediana.amostra}</Num>
      </span>
    </span>
  );
}

/** Célula de valor monetário/derivado que pode não existir. O motivo entra no title. */
function ValorOuMotivo({ valor, motivo }: { valor: number | null; motivo: string | null }) {
  if (valor === null) {
    return (
      <span
        className="text-rotulo text-[var(--atlas-texto-fraco)]"
        title={motivo ?? "não medido"}
      >
        {TRACO} {motivo ? "não computável" : "não medido"}
      </span>
    );
  }
  return <Num>{dinheiro(valor)}</Num>;
}

/**
 * `useSearchParams` obriga a fronteira de Suspense no App Router. Ela existe
 * para o link vindo do cadastro de incorporadoras cair já filtrado no parceiro
 * certo — mandar para "todas" depois de clicar num nome específico seria uma
 * navegação que mente.
 */
export default function RelatorioDoIncorporadorPage() {
  return (
    <Suspense fallback={<AtlasSkeleton className="h-64" />}>
      <Superficie />
    </Suspense>
  );
}

function Superficie() {
  const parametros = useSearchParams();
  const [janela, setJanela] = useState<Janela>(90);
  const [incorporador, setIncorporador] = useState<string>(
    () => parametros.get("incorporador") || "todos",
  );
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [estado, setEstado] = useState<Estado>("carregando");

  // Trocar janela ou parceiro rápido dispara respostas fora de ordem — a antiga
  // podia sobrescrever a nova e a tela mostraria o recorte errado sem avisar.
  const abortRef = useRef<AbortController | null>(null);

  const carregar = useCallback(async (dias: Janela, parceiro: string) => {
    abortRef.current?.abort();
    const controlador = new AbortController();
    abortRef.current = controlador;
    setEstado("carregando");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("sessão expirada");
      const resposta = await fetch(
        `/api/v1/relatorio-incorporador?dias=${dias}&incorporador=${encodeURIComponent(parceiro)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controlador.signal },
      );
      if (controlador.signal.aborted) return;
      if (resposta.status === 401 || resposta.status === 403) {
        setEstado("sem-permissao");
        return;
      }
      const corpo = await resposta.json();
      if (controlador.signal.aborted) return;
      if (!resposta.ok || corpo?.ok !== true) throw new Error("relatório indisponível");
      setRelatorio(corpo.data as Relatorio);
      setEstado("pronto");
    } catch {
      if (controlador.signal.aborted) return;
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    void carregar(janela, incorporador);
    return () => abortRef.current?.abort();
  }, [janela, incorporador, carregar]);

  return (
    <div className="space-y-5 pb-12" data-superficie="relatorio-incorporador">
      <PageHeader
        eyebrow="Relatório do incorporador"
        title="Campanha, gasto e conversão"
        description="O que a mídia custou, quantas pessoas entraram por ela e até onde elas foram. Onde a ligação entre as duas pontas não existe, o relatório diz isso — não desenha zero."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Rotulo className="mr-1">Janela</Rotulo>
        {JANELAS.map((dias) => (
          <button
            key={dias}
            type="button"
            onClick={() => setJanela(dias)}
            aria-pressed={janela === dias}
            className={`cc6-chip cc6-interativo text-rotulo ${janela === dias ? "cc6-destaque cc6-interativo-acento" : ""}`}
          >
            {dias} dias
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-[var(--atlas-border)]" aria-hidden="true" />
        <Rotulo className="mr-1">Incorporadora</Rotulo>
        <button
          type="button"
          onClick={() => setIncorporador("todos")}
          aria-pressed={incorporador === "todos"}
          className={`cc6-chip cc6-interativo text-rotulo ${incorporador === "todos" ? "cc6-destaque cc6-interativo-acento" : ""}`}
        >
          Todas
        </button>
        {(relatorio?.incorporadoras ?? []).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setIncorporador(item.id)}
            aria-pressed={incorporador === item.id}
            className={`cc6-chip cc6-interativo text-rotulo ${incorporador === item.id ? "cc6-destaque cc6-interativo-acento" : ""}`}
          >
            {item.nome}
          </button>
        ))}
      </div>

      {estado === "sem-permissao" ? (
        <div className="cc6-panel cc6-atencao p-5 sm:p-6">
          <Rotulo>Acesso</Rotulo>
          <p className="mt-2 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
            Este relatório mostra o gasto de mídia do parceiro e fica com a liderança comercial
            (diretoria, superintendência ou gerência).
          </p>
        </div>
      ) : null}

      {estado === "erro" ? (
        <AtlasRecoverableError
          title="O relatório não pôde ser apurado"
          description="A apuração cruza campanha, gasto, lead e movimentação. Uma dessas leituras falhou."
          onRetry={() => void carregar(janela, incorporador)}
        />
      ) : null}

      {estado === "carregando" ? (
        <div className="space-y-4">
          <AtlasSkeleton className="h-32" />
          <AtlasSkeleton className="h-64" />
          <AtlasSkeleton className="h-48" />
        </div>
      ) : null}

      {estado === "pronto" && relatorio ? (
        <>
          <BlocoDeDecisao relatorio={relatorio} />
          <BlocoDeCampanhas relatorio={relatorio} />
          <BlocoDaLinhaDoTempo relatorio={relatorio} />
          <BlocoDeEmpreendimentos relatorio={relatorio} />
          <BlocoDoFunil relatorio={relatorio} />
          <BlocoDeLastro relatorio={relatorio} />
        </>
      ) : null}
    </div>
  );
}

/* ── 1 · A DECISÃO ─────────────────────────────────────────────────────────
   O único número em 34px da tela. Ele foi escolhido pela pergunta "o que exige
   decisão hoje?" — não é o gasto total (informa), nem o volume de leads
   (informa): é o dinheiro que o CRM não consegue ligar a ninguém, porque
   enquanto ele existir todo custo por lead desta base é conta sobre denominador
   furado. */
function BlocoDeDecisao({ relatorio }: { relatorio: Relatorio }) {
  const { atribuicao, cobertura } = relatorio;
  const temBuraco = atribuicao.gastoSemAtribuicao > 0;
  /* Sem NENHUMA campanha com gasto no recorte, `gastoSemAtribuicao` vale 0 — e
     imprimir "R$ 0,00" aqui seria o erro que esta tela inteira existe para não
     cometer: leria-se "não há buraco de atribuição", quando o certo é "não há
     gasto medido para responder". Traço, e a frase muda junto. */
  const semGastoMedido = atribuicao.gastoTotal === null;

  return (
    <section className={`cc6-panel ${temBuraco ? "cc6-alerta" : ""} p-5 sm:p-6`}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div>
          <Rotulo>
            {semGastoMedido ? "Gasto de mídia" : temBuraco ? "Gasto sem atribuição" : "Gasto atribuído"}
          </Rotulo>
          <p className="mt-2">
            <Num
              envolucro="text-heroi leading-[1.05] font-semibold tracking-[-0.02em]"
              tinta={temBuraco ? "text-[var(--atlas-estado-perigo)]" : "text-[var(--atlas-texto-fraco)]"}
            >
              {semGastoMedido ? TRACO : dinheiro(atribuicao.gastoSemAtribuicao)}
            </Num>
          </p>
          <p className="mt-3 max-w-[62ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
            {semGastoMedido ? (
              <>
                Nenhuma campanha com linha de gasto neste recorte. Isso não é gasto zero: é gasto que
                não chegou até aqui — ou porque a conta de anúncio não respondeu pela janela, ou porque
                nenhuma campanha está ligada a este parceiro.
              </>
            ) : temBuraco ? (
              <>
                É{" "}
                <Num tinta="text-[var(--atlas-texto-forte)]">{percentual(atribuicao.parcelaSemAtribuicao)}</Num>{" "}
                do gasto medido, em{" "}
                <Num tinta="text-[var(--atlas-texto-forte)]">{atribuicao.campanhasSemAtribuicao}</Num>{" "}
                campanha(s) que nenhuma lead aponta. Isso <strong>não</strong>{" "}quer dizer que elas não
                trouxeram ninguém: quer dizer que o dinheiro saiu de uma conta de anúncio e as leads
                entraram por outra, e o CRM não tem chave para ligar as duas pontas.
              </>
            ) : (
              <>Todo o gasto medido da janela tem lead apontando a campanha.</>
            )}
          </p>
          {atribuicao.campanhasComAtribuicaoCompleta === 0 && atribuicao.campanhasComGasto > 0 ? (
            <p className="mt-2 max-w-[62ch] text-corpo leading-6 text-[var(--atlas-estado-perigo)]">
              Nenhuma campanha tem as duas pontas ao mesmo tempo. Custo por lead não é computável em
              nenhuma linha desta janela — e a coluna diz isso, em vez de mostrar uma célula vazia.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-4 self-start sm:grid-cols-2">
          <Destaque
            rotulo="Gasto medido"
            valor={atribuicao.gastoTotal === null ? TRACO : dinheiro(atribuicao.gastoTotal)}
            apoio={`${atribuicao.campanhasComGasto} campanha(s) com linha de gasto`}
          />
          <Destaque
            rotulo="Leads atribuídas"
            valor={String(atribuicao.leadsAtribuidas)}
            apoio={`de ${cobertura.leads} na janela · ${percentual(
              cobertura.leads ? Math.round((cobertura.leads ? (atribuicao.leadsAtribuidas / cobertura.leads) * 1000 : 0)) / 10 : null,
            )}`}
          />
          <Destaque
            rotulo="Campanhas ligadas"
            valor={String(atribuicao.campanhasComAtribuicaoCompleta)}
            apoio="com gasto E lead na mesma campanha"
            tinta={
              atribuicao.campanhasComAtribuicaoCompleta === 0
                ? "text-[var(--atlas-estado-perigo)]"
                : "text-[var(--atlas-texto-forte)]"
            }
          />
          <Destaque
            rotulo="Leads com empreendimento"
            valor={String(relatorio.cobertura.comEmpreendimento)}
            apoio="é onde a quebra por produto tem lastro"
          />
        </div>
      </div>
    </section>
  );
}

function Destaque({
  rotulo,
  valor,
  apoio,
  tinta = "text-[var(--atlas-texto-forte)]",
}: {
  rotulo: string;
  valor: string;
  apoio: string;
  tinta?: string;
}) {
  return (
    <div>
      <Rotulo>{rotulo}</Rotulo>
      <p className="mt-1">
        <Num envolucro="text-numero leading-7 font-semibold" tinta={tinta}>
          {valor}
        </Num>
      </p>
      <p className="mt-0.5 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{apoio}</p>
    </div>
  );
}

/* ── 2 · CAMPANHAS ─────────────────────────────────────────────────────────
   Dez colunas porque dez coisas foram medidas por campanha e cada uma responde
   uma pergunta diferente de compra de mídia: quanto saiu (gasto), quantas
   pessoas isso trouxe (leads, contatadas), quanto custou cada uma (CPL),
   entrega (impressões), atenção (cliques, CTR) e preço da atenção (CPC, CPM).

   A tabela rola dentro do painel — nunca o corpo da página. */
function BlocoDeCampanhas({ relatorio }: { relatorio: Relatorio }) {
  const linhas = [...relatorio.campanhas].sort(
    (a, b) => (b.gasto.valor ?? -1) - (a.gasto.valor ?? -1) || b.leadsAtribuidas - a.leadsAtribuidas,
  );

  /* Lista vazia não pode virar tabela com cabeçalho e nada embaixo: cabeçalho sem
     linha lê-se como "consultei e não achei nada", quando neste produto quase
     sempre significa "o recorte não alcança este dado". */
  if (!linhas.length) {
    return (
      <section className="cc6-panel cc6-atencao p-5 sm:p-6">
        <Rotulo>Por campanha</Rotulo>
        <p className="mt-2 max-w-[86ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          Nenhuma campanha alcança este recorte. Campanha se liga a uma incorporadora de duas formas —
          apontando um projeto dela, ou tendo lead atribuída a um empreendimento dela — e nenhuma das
          duas existe aqui. O gasto de mídia da janela continua existindo no total geral; o que não
          existe é o critério para dizer que parte dele é deste parceiro.
        </p>
      </section>
    );
  }

  return (
    <section className="cc6-panel">
      <header className="px-5 pt-5 sm:px-6 sm:pt-6">
        <Rotulo>Por campanha</Rotulo>
        <p className="mt-1 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          Gasto, entrega, leads e conversão de cada campanha, e o estado da atribuição de cada uma.
          {relatorio.campanhasSilenciosas > 0 ? (
            <> {relatorio.campanhasSilenciosas} campanha(s) sem gasto e sem lead ficaram fora.</>
          ) : null}
        </p>
      </header>

      {/* O recuo das células NÃO vem daqui. `.atlas-app-shell th, td` em
          globals.css (linha 3206) crava `padding: 14px 16px` sem camada, e
          utilitário do Tailwind vive em `@layer utilities` — sem camada vence
          camada. Classes de padding nas células seriam letra morta; ficam de
          fora para não enganar quem ler depois. Pelo mesmo motivo o filete entre
          as linhas não vem de `cc6-hairline` no `<tr>`: `.atlas-app-shell table`
          crava `border-collapse: separate`, e sob `separate` o navegador não
          pinta borda de `<tr>` — quem pinta é o `border-bottom` da célula, da
          mesma regra. Medido: `<tr>` sai com 0px e `<td>` com 1px.

          A rolagem é do container, nunca do corpo da página. */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[64rem] text-corpo">
          <thead>
            <tr>
              <th scope="col" className="w-[24rem] py-2 text-left">
                <Rotulo>Campanha e atribuição</Rotulo>
              </th>
              {/* A ordem conta a história na sequência em que ela decide:
                  quanto saiu → quantas pessoas isso trouxe → quanto custou cada
                  uma. Entrega e preço de leilão (impressões, cliques, CTR, CPC,
                  CPM) vêm depois, e são justamente as que o container empurra
                  para a rolagem numa tela estreita. Medido em 02/08/2026: a
                  tabela pede 1.172px e o painel oferece 1.104 — 68px sobram, e
                  eles têm de sobrar do lado do que informa, não do que decide. */}
              {["Gasto", "Leads", "Custo por lead", "Contatadas", "Impressões", "Cliques", "CTR", "CPC", "CPM"].map((titulo) => (
                <th key={titulo} scope="col" className="py-2 text-right whitespace-nowrap">
                  <Rotulo>{titulo}</Rotulo>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((campanha) => (
              <tr key={campanha.id} className="align-top">
                <th scope="row" className="py-3 text-left" style={CELULA_DE_LINHA}>
                  {/* Sem `truncate`: o nome cortado é justamente o que o gestor
                      precisa ler inteiro para mandar pausar a campanha. */}
                  <span className="block break-words">{campanha.nome}</span>
                  {/* O estado da atribuição sobe para cá em vez de virar a 11ª
                      coluna: com 11 colunas ele caía fora da área visível, e é
                      justamente o que decide se as outras dez podem ser lidas. */}
                  <span
                    className={`mt-1 inline-block text-rotulo leading-4 font-medium ${TINTA_POR_ATRIBUICAO[campanha.atribuicao]}`}
                    title={EXPLICACAO_DE_ATRIBUICAO[campanha.atribuicao]}
                  >
                    {ROTULO_DE_ATRIBUICAO[campanha.atribuicao]}
                  </span>
                  <span className="mt-0.5 block text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                    {[campanha.plataforma, campanha.status].filter(Boolean).join(" · ")}
                    {campanha.primeiroDiaDeGasto ? (
                      <>
                        {" · "}
                        {campanha.diasComGasto} dia(s) com gasto, {campanha.primeiroDiaDeGasto.slice(8)}/
                        {campanha.primeiroDiaDeGasto.slice(5, 7)} a {campanha.ultimoDiaDeGasto?.slice(8)}/
                        {campanha.ultimoDiaDeGasto?.slice(5, 7)}
                      </>
                    ) : null}
                    {campanha.empreendimentos.length ? <> · {campanha.empreendimentos.join(", ")}</> : null}
                  </span>
                </th>
                <td className="py-3 text-right whitespace-nowrap">
                  {campanha.gasto.valor === null ? (
                    <span className="text-rotulo text-[var(--atlas-texto-fraco)]" title="nenhuma linha em marketing_spend para esta campanha na janela">
                      {TRACO} não medido
                    </span>
                  ) : (
                    <Num
                      envolucro="text-numero leading-6 font-semibold"
                      tinta={
                        campanha.atribuicao === "gasto_sem_atribuicao"
                          ? "text-[var(--atlas-estado-perigo)]"
                          : "text-[var(--atlas-texto-forte)]"
                      }
                    >
                      {dinheiro(campanha.gasto.valor)}
                    </Num>
                  )}
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  <Num
                    envolucro="text-numero leading-6 font-semibold"
                    tinta={
                      campanha.leadsAtribuidas === 0 && campanha.atribuicao === "gasto_sem_atribuicao"
                        ? "text-[var(--atlas-estado-perigo)]"
                        : "text-[var(--atlas-texto-forte)]"
                    }
                  >
                    {campanha.leadsAtribuidas}
                  </Num>
                </td>
                <td className="max-w-[9rem] py-3 text-right">
                  <ValorOuMotivo valor={campanha.cpl.valor} motivo={campanha.cpl.motivo} />
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  <Num tinta="text-[var(--atlas-texto-medio)]">{campanha.leadsContatadas}</Num>
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  <Num tinta="text-[var(--atlas-texto-medio)]">
                    {campanha.impressoes ? campanha.impressoes.toLocaleString("pt-BR") : TRACO}
                  </Num>
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  <Num tinta="text-[var(--atlas-texto-medio)]">{campanha.cliques || TRACO}</Num>
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  <Num tinta="text-[var(--atlas-texto-medio)]">{percentual(campanha.ctr, 2)}</Num>
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  <ValorOuMotivo valor={campanha.cpc.valor} motivo={campanha.cpc.motivo} />
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  <ValorOuMotivo valor={campanha.cpm.valor} motivo={campanha.cpm.motivo} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cc6-hairline px-5 py-4 sm:px-6">
        <p className="max-w-[86ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          <strong className="text-[var(--atlas-texto-forte)]">Sem atribuição</strong>{" "}quer dizer que a
          campanha gastou e nenhuma lead do CRM carrega o identificador dela. Não é o mesmo que
          &ldquo;não trouxe ninguém&rdquo;: é o mesmo que &ldquo;não sabemos&rdquo;. Por isso a coluna
          de leads mostra zero em vermelho e a de custo por lead mostra o motivo — o zero é a
          contagem real de leads ligadas, e a ausência de custo é a consequência dela.
        </p>
      </div>
    </section>
  );
}

/* ── 3 · A LINHA DO TEMPO ─────────────────────────────────────────────────── */
function BlocoDaLinhaDoTempo({ relatorio }: { relatorio: Relatorio }) {
  const l = relatorio.leituraDaSerie;
  return (
    <section className="cc6-panel">
      <header className="px-5 pt-5 sm:px-6 sm:pt-6">
        <Rotulo>Dinheiro e gente no mesmo eixo</Rotulo>
        <p className="mt-1 max-w-[86ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          A tabela acima diz quanto e quantos. Só o tempo diz <em>quando</em> — e é aí que aparecem os
          dias em que o dinheiro saiu sem ninguém entrar, os dias em que entrou gente sem dinheiro ter
          saído, e o pico de volume que é planilha importada, não mídia. Coincidir no tempo não é
          atribuir; a chave que liga uma ponta na outra continua faltando.
        </p>
      </header>

      <RelatorioIncorporadorLinhaDoTempo serie={relatorio.serie} leitura={l} />

      {/* SEM NENHUM DIA MEDIDO, AS DUAS PRIMEIRAS CONTAS NÃO EXISTEM ──────────
          As duas primeiras lajotas contam dias DENTRO da cobertura do feed. Com
          `diasMedidos === 0` não há dia dentro da cobertura, e "0 dia(s) ·
          R$ 0,00" seria a soma de um conjunto vazio impressa como moeda — o
          leitor lê "medimos e não houve", quando o certo é "não há o que medir".
          MEDIDO em 02/08/2026, no chip "Teixeira Duarte" desta própria tela: a
          lajota ao lado dizia "o feed de gasto responde por 0 dos 90 dias" e
          esta dizia "R$ 0,00" — duas leituras opostas da mesma ausência, lado a
          lado. Quando existe cobertura, zero volta a ser zero medido. */}
      <div className="cc6-hairline grid gap-4 px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <Destaque
          rotulo="Gastou, ninguém entrou"
          valor={l.diasMedidos ? `${l.diasComGastoESemLead} dia(s)` : TRACO}
          apoio={
            l.diasMedidos
              ? `${dinheiro(l.gastoEmDiasSemLead)} sem nenhuma lead de mídia no mesmo dia`
              : "nenhum dia desta janela tem gasto medido — não há dia para comparar com a entrada de leads"
          }
          tinta={
            l.diasMedidos && l.diasComGastoESemLead
              ? "text-[var(--atlas-estado-perigo)]"
              : l.diasMedidos
                ? "text-[var(--atlas-texto-forte)]"
                : "text-[var(--atlas-texto-fraco)]"
          }
        />
        <Destaque
          rotulo="Entrou gente, não gastou"
          valor={l.diasMedidos ? `${l.diasComLeadESemGasto} dia(s)` : TRACO}
          apoio={
            l.diasMedidos
              ? `${l.leadsEmDiasSemGasto} lead(s) de mídia em dia medido com gasto zero`
              : "afirmar que não saiu dinheiro num dia exige ter medido aquele dia, e nenhum foi medido"
          }
          tinta={
            l.diasMedidos && l.diasComLeadESemGasto
              ? "text-[var(--atlas-estado-atencao)]"
              : l.diasMedidos
                ? "text-[var(--atlas-texto-forte)]"
                : "text-[var(--atlas-texto-fraco)]"
          }
        />
        <Destaque
          rotulo="Fora da cobertura"
          valor={`${relatorio.serie.length - l.diasMedidos} dia(s)`}
          apoio={`o feed de gasto responde por ${l.diasMedidos} dos ${relatorio.serie.length} dias da janela`}
        />
        <Destaque
          rotulo="Maior importação"
          valor={l.maiorDiaDeImportacao ? String(l.maiorDiaDeImportacao.leads) : TRACO}
          apoio={
            l.maiorDiaDeImportacao
              ? `leads de planilha em ${l.maiorDiaDeImportacao.dia.slice(8)}/${l.maiorDiaDeImportacao.dia.slice(5, 7)} — volume que não é mídia`
              : "nenhuma importação na janela"
          }
        />
      </div>
    </section>
  );
}

/* ── 4 · EMPREENDIMENTOS ───────────────────────────────────────────────────
   É onde há mais lastro: 198 das 489 leads da janela apontam empreendimento,
   contra 24 que apontam campanha. A quebra por produto sustenta conclusão que a
   quebra por campanha ainda não sustenta. */
function BlocoDeEmpreendimentos({ relatorio }: { relatorio: Relatorio }) {
  const linhas = [...relatorio.empreendimentos].sort((a, b) => b.leads - a.leads);

  /* Mesma regra do bloco de campanhas, que faltava aqui: dez colunas de
     cabeçalho com nada embaixo lê-se como "consultei e não achei nada". MEDIDO
     em 02/08/2026 com `?incorporador=` de uma incorporadora sem empreendimento
     cadastrado — a tabela saía com os 10 rótulos e zero linhas. */
  if (!linhas.length) {
    return (
      <section className="cc6-panel cc6-atencao p-5 sm:p-6">
        <Rotulo>Por empreendimento</Rotulo>
        <p className="mt-2 max-w-[86ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          Nenhum empreendimento alcança este recorte. A quebra por produto sai de{" "}
          <code>developments</code> filtrado pela incorporadora escolhida — sem empreendimento
          vinculado a ela, não há linha para mostrar, e uma tabela vazia diria que a consulta
          rodou e voltou sem nada.
        </p>
      </section>
    );
  }

  return (
    <section className="cc6-panel">
      <header className="px-5 pt-5 sm:px-6 sm:pt-6">
        <Rotulo>Por empreendimento</Rotulo>
        <p className="mt-1 max-w-[86ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          A quebra com mais lastro do relatório:{" "}
          <Num tinta="text-[var(--atlas-texto-forte)]">{relatorio.cobertura.comEmpreendimento}</Num> leads
          apontam produto, contra{" "}
          <Num tinta="text-[var(--atlas-texto-forte)]">{relatorio.cobertura.comCampanha}</Num> que apontam
          campanha.
        </p>
      </header>

      {/* O recuo das células NÃO vem daqui. `.atlas-app-shell th, td` em
          globals.css (linha 3206) crava `padding: 14px 16px` sem camada, e
          utilitário do Tailwind vive em `@layer utilities` — sem camada vence
          camada. Classes de padding nas células seriam letra morta; ficam de
          fora para não enganar quem ler depois. Pelo mesmo motivo o filete entre
          as linhas não vem de `cc6-hairline` no `<tr>`: `.atlas-app-shell table`
          crava `border-collapse: separate`, e sob `separate` o navegador não
          pinta borda de `<tr>` — quem pinta é o `border-bottom` da célula, da
          mesma regra. Medido: `<tr>` sai com 0px e `<td>` com 1px.

          A rolagem é do container, nunca do corpo da página. */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[58rem] text-corpo">
          <thead>
            <tr>
              <th scope="col" className="py-2 text-left">
                <Rotulo>Empreendimento</Rotulo>
              </th>
              {["Leads", "Atendidas", "1º contato", "Fora do prazo", "Visita", "Proposta", "Fechamento", "Saíram", "Gasto ligado"].map((titulo) => (
                <th key={titulo} scope="col" className="py-2 text-right whitespace-nowrap">
                  <Rotulo>{titulo}</Rotulo>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((item) => {
              const etapa = (chave: string) => item.funil.etapas.find((e) => e.chave === chave)?.leads ?? 0;
              const fechamento = Math.max(etapa("contrato"), etapa("ganho"));
              return (
                <tr key={item.id} className="align-top">
                  <th scope="row" className="py-3 text-left" style={CELULA_DE_LINHA}>
                    <span className="block break-words text-[var(--atlas-texto-forte)]">{item.nome}</span>
                    <span className="mt-0.5 block text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                      {[item.incorporadora ?? "incorporadora não vinculada", item.cidade, item.status]
                        .filter(Boolean)
                        .join(" · ")}
                      {item.leadsComCampanha ? <> · {item.leadsComCampanha} lead(s) com campanha</> : null}
                    </span>
                  </th>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Num envolucro="text-numero leading-6 font-semibold">{item.leads}</Num>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Num tinta="text-[var(--atlas-texto-medio)]">{item.leadsContatadas}</Num>{" "}
                    <span className="text-rotulo text-[var(--atlas-texto-fraco)]">
                      ({percentual(item.taxaDeAtendimento)})
                    </span>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <TempoMedido mediana={item.tempoAtePrimeiroContato} />
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Num
                      tinta={
                        item.foraDoPrazo
                          ? "text-[var(--atlas-estado-perigo)]"
                          : "text-[var(--atlas-texto-medio)]"
                      }
                    >
                      {item.foraDoPrazo}
                    </Num>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Num tinta="text-[var(--atlas-texto-medio)]">{etapa("visita")}</Num>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Num tinta="text-[var(--atlas-texto-medio)]">{etapa("proposta")}</Num>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Num
                      tinta={
                        fechamento
                          ? "text-[var(--atlas-estado-sucesso)]"
                          : "text-[var(--atlas-texto-medio)]"
                      }
                    >
                      {fechamento}
                    </Num>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Num tinta="text-[var(--atlas-texto-medio)]">{item.funil.sairam}</Num>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    {item.gastoLigado.valor === null ? (
                      <span
                        className="text-rotulo text-[var(--atlas-texto-fraco)]"
                        title="nenhuma campanha aponta um projeto que aponte este empreendimento"
                      >
                        {TRACO} sem vínculo
                      </span>
                    ) : (
                      <Num>{dinheiro(item.gastoLigado.valor)}</Num>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cc6-hairline px-5 py-4 sm:px-6">
        <p className="max-w-[86ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          <strong className="text-[var(--atlas-texto-forte)]">Gasto ligado</strong>{" "}desce da campanha
          para o empreendimento por dois saltos — campanha → projeto → empreendimento. Enquanto nenhuma
          campanha apontar um projeto, a coluna não tem como existir, e ela diz isso em vez de somar
          zero.
        </p>
      </div>
    </section>
  );
}

/* ── 5 · O FUNIL ─────────────────────────────────────────────────────────── */
function BlocoDoFunil({ relatorio }: { relatorio: Relatorio }) {
  const f = relatorio.funil;
  const desde = relatorio.registroDeMovimentoDesde
    ? new Date(relatorio.registroDeMovimentoDesde).toLocaleDateString("pt-BR")
    : null;

  return (
    <section className="cc6-panel">
      <header className="px-5 pt-5 sm:px-6 sm:pt-6">
        <Rotulo>Funil e tempo por etapa</Rotulo>
        <p className="mt-1 max-w-[86ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          Contado em <code>pipeline_stage_moves</code>, a fonte canônica de movimentação. A primeira
          chegada em cada etapa é a que conta — a lead que volta para contato depois de uma proposta
          não recomeça o relógio.
        </p>
      </header>

      {/* O recuo das células NÃO vem daqui. `.atlas-app-shell th, td` em
          globals.css (linha 3206) crava `padding: 14px 16px` sem camada, e
          utilitário do Tailwind vive em `@layer utilities` — sem camada vence
          camada. Classes de padding nas células seriam letra morta; ficam de
          fora para não enganar quem ler depois. Pelo mesmo motivo o filete entre
          as linhas não vem de `cc6-hairline` no `<tr>`: `.atlas-app-shell table`
          crava `border-collapse: separate`, e sob `separate` o navegador não
          pinta borda de `<tr>` — quem pinta é o `border-bottom` da célula, da
          mesma regra. Medido: `<tr>` sai com 0px e `<td>` com 1px.

          A rolagem é do container, nunca do corpo da página. */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-corpo">
          <thead>
            <tr>
              <th scope="col" className="py-2 text-left">
                <Rotulo>Etapa</Rotulo>
              </th>
              {["Leads", "Do topo", "Passagem", "Da criação até aqui", "Daqui até avançar"].map((titulo) => (
                <th key={titulo} scope="col" className="py-2 text-right whitespace-nowrap">
                  <Rotulo>{titulo}</Rotulo>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="py-3 text-left" style={CELULA_DE_LINHA}>
                Entraram
                <span className="mt-0.5 block text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                  leads criadas na janela — o denominador de tudo abaixo
                </span>
              </th>
              <td className="py-3 text-right">
                <Num envolucro="text-numero leading-6 font-semibold">{f.entraram}</Num>
              </td>
              <td className="py-3 text-right text-[var(--atlas-texto-fraco)]">100%</td>
              <td className="py-3 text-right text-[var(--atlas-texto-fraco)]">{TRACO}</td>
              <td className="py-3 text-right text-[var(--atlas-texto-fraco)]">{TRACO}</td>
              <td className="py-3 text-right text-[var(--atlas-texto-fraco)]">{TRACO}</td>
            </tr>
            {f.etapas.map((etapa) => (
              <tr key={etapa.chave} className="align-top">
                <th scope="row" className="py-3 text-left" style={CELULA_DE_LINHA}>
                  {etapa.rotulo}
                  {etapa.puloDeEtapa ? (
                    <span className="mt-0.5 block text-rotulo leading-4 text-[var(--atlas-estado-atencao)]">
                      mais leads aqui do que na etapa anterior — alguém pulou a etapa no registro
                    </span>
                  ) : null}
                </th>
                <td className="py-3 text-right">
                  <Num envolucro="text-numero leading-6 font-semibold">{etapa.leads}</Num>
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  <Num tinta="text-[var(--atlas-texto-medio)]">{percentual(etapa.shareDoTopo)}</Num>
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  <Num
                    tinta={
                      etapa.puloDeEtapa
                        ? "text-[var(--atlas-estado-atencao)]"
                        : "text-[var(--atlas-texto-medio)]"
                    }
                  >
                    {percentual(etapa.passagem)}
                  </Num>
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  <TempoMedido mediana={etapa.tempoAteChegar} />
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  <TempoMedido mediana={etapa.tempoAteAvancar} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cc6-hairline grid gap-4 px-5 py-4 sm:grid-cols-3 sm:px-6">
        <Destaque
          rotulo="Saíram"
          valor={String(f.sairam)}
          apoio="perdido ou comprou de outro"
          tinta={f.sairam ? "text-[var(--atlas-estado-perigo)]" : "text-[var(--atlas-texto-forte)]"}
        />
        <Destaque
          rotulo="Sem movimento"
          valor={String(f.semMovimento)}
          apoio="nenhuma linha no livro — não estão paradas numa etapa, estão mudas"
        />
        <Destaque
          rotulo="Elegíveis a tempo"
          valor={String(f.elegiveisParaTempo)}
          apoio={
            desde
              ? `nascidas depois de ${desde}, quando o livro de movimentação começou`
              : "sem livro de movimentação nesta base"
          }
          tinta={
            f.elegiveisParaTempo < f.entraram / 2
              ? "text-[var(--atlas-estado-atencao)]"
              : "text-[var(--atlas-texto-forte)]"
          }
        />
      </div>

      {desde ? (
        <div className="cc6-hairline px-5 py-4 sm:px-6">
          <p className="max-w-[86ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
            <strong className="text-[var(--atlas-texto-forte)]">
              A coluna &ldquo;da criação até aqui&rdquo; só olha lead nascida depois de {desde}.
            </strong>{" "}
            Para uma lead mais velha, o intervalo entre a criação e o primeiro movimento não mede
            atendimento: mede a distância até o dia em que a medição passou a existir. Contá-la
            inflaria a mediana e faria o parceiro cobrar um atraso que ninguém teve.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/* ── 6 · O LASTRO ─────────────────────────────────────────────────────────
   Auditoria fica embaixo e em 11px — quem lê isto está conferindo, não
   decidindo. Mas não pode faltar: sem a cobertura, o leitor não sabe se "24
   leads com campanha" é pouco ou é tudo. */
function BlocoDeLastro({ relatorio }: { relatorio: Relatorio }) {
  const c = relatorio.cobertura;
  const cobertura: Array<[string, number]> = [
    ["apontam empreendimento", c.comEmpreendimento],
    ["apontam campanha", c.comCampanha],
    ["têm primeiro contato marcado", c.comPrimeiroContato],
    ["têm movimentação registrada", c.comMovimento],
    ["entraram por importação de planilha", c.importadas],
  ];

  return (
    <section className="cc6-panel cc6-panel-quiet p-5 sm:p-6">
      <Rotulo>Lastro da medição</Rotulo>
      <p className="mt-1 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
        Janela de {relatorio.janela.dias} dias, de{" "}
        {relatorio.janela.inicio.split("-").reverse().join("/")} a{" "}
        {relatorio.janela.fim.split("-").reverse().join("/")}.{" "}
        <Num tinta="text-[var(--atlas-texto-forte)]">{c.leads}</Num> leads entraram nela.
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cobertura.map(([rotulo, valor]) => {
          const parte = c.leads ? Math.round((valor / c.leads) * 1000) / 10 : null;
          return (
            <li
              key={rotulo}
              className="flex items-baseline justify-between gap-3 rounded-[10px] px-3 py-2"
              style={{
                // Faixa proporcional em vez de barra própria: a linha inteira é o
                // dado, e nenhum filete novo entra na tela. 12% é o teto medido
                // neste repositório para o texto seguir passando em AA sobre a
                // faixa, nos dois temas.
                background: `linear-gradient(to right, color-mix(in srgb, var(--atlas-accent) 12%, transparent) ${parte ?? 0}%, transparent ${parte ?? 0}%)`,
              }}
            >
              <span className="text-corpo text-[var(--atlas-texto-medio)]">{rotulo}</span>
              {/* `text-corpo` explícito: sem ele o número herdava os 16px do
                  corpo da página — o quinto degrau que a escala do v3 não tem. */}
              <span className="text-corpo whitespace-nowrap">
                <Num tinta="text-[var(--atlas-texto-forte)]">{valor}</Num>{" "}
                <span className="text-rotulo text-[var(--atlas-texto-fraco)]">{percentual(parte)}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {relatorio.naoMedido.length ? (
        <div className="mt-5">
          <Rotulo>O que não foi medido</Rotulo>
          <ul className="mt-2 space-y-1.5">
            {relatorio.naoMedido.map((linha) => (
              <li key={linha} className="max-w-[92ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
                {linha}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-5 max-w-[92ch] text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
        Origem de cada número: gasto, impressões e cliques de <code>marketing_spend</code>; nome,
        plataforma e situação de <code>marketing_campaigns</code>; atribuição pela coluna{" "}
        <code>campaign_id</code> da lead; etapas e tempos de <code>pipeline_stage_moves</code>; primeiro
        contato de <code>leads.first_contacted_at</code>. Apurado em{" "}
        {new Date(relatorio.geradoEm).toLocaleString("pt-BR")}.
      </p>
    </section>
  );
}
