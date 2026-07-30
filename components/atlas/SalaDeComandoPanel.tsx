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
  procedencia: {
    amostraTruncada: boolean;
    registroDeMovimentoDesde: string | null;
    registroDeMovimentoMensuravel: boolean;
    movimentosLidos: number;
  };
};

const inteiro = (n: number) => n.toLocaleString("pt-BR");
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
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{valor}</p>
      {/* O detalhe carrega o DENOMINADOR ou o motivo. Número sem denominador foi
          como "442 leads" virou um dado sem significado nesta base. */}
      {detalhe ? (
        <p className={`mt-1 text-[11px] leading-4 ${alerta ? "text-amber-300" : "text-slate-500"}`}>{detalhe}</p>
      ) : null}
    </div>
  );
}

function Funil({ etapas }: { etapas: Etapa[] }) {
  const maior = Math.max(1, ...etapas.map((e) => e.quantidade));
  const maiorPassagem = Math.max(1, ...etapas.map((e) => e.jaPassaram));
  return (
    <ul className="space-y-2.5">
      {etapas.map((etapa) => {
        const largura = Math.max(etapa.quantidade > 0 ? 4 : 0, (etapa.quantidade / maior) * 100);
        return (
          <li key={etapa.chave}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium text-slate-200">{etapa.rotulo}</span>
              <span className="tabular-nums text-slate-400">
                {inteiro(etapa.quantidade)}
                {etapa.percentualDoTopo !== null && etapa.quantidade > 0 ? (
                  <span className="ml-1.5 text-slate-500">{etapa.percentualDoTopo}% do topo</span>
                ) : null}
                {/* O segundo número é o que distingue "não chegou" de "vazou".
                    Sem ele, uma etapa em zero conta a história errada. */}
                {etapa.jaPassaram > 0 ? (
                  <span className="ml-2 text-slate-500">· {inteiro(etapa.jaPassaram)} já passaram</span>
                ) : null}
              </span>
            </div>
            {/* Barra em div, não em SVG: uma barra é um retângulo, e retângulo com
                largura percentual e texto ao lado é legível por leitor de tela.
                A trilha usa currentColor a 10% em vez de branco: branco a 5% some
                no tema claro, e trilha invisível faz a barra flutuar sem escala. */}
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_12%,transparent)] text-slate-400">
              <div
                className={`h-full rounded-full ${etapa.quantidade > 0 ? "bg-[var(--atlas-accent)]" : ""}`}
                style={{ width: `${largura}%` }}
                role="presentation"
              />
              {/* Marca de "já passou por aqui" quando a etapa está vazia: uma
                  trilha fantasma, para o zero não parecer nunca-visitado. */}
              {etapa.quantidade === 0 && etapa.jaPassaram > 0 ? (
                <div
                  className="-mt-2 h-2 rounded-full border border-dashed border-[var(--atlas-accent)] opacity-40"
                  style={{ width: `${Math.max(4, (etapa.jaPassaram / maiorPassagem) * 100)}%` }}
                  role="presentation"
                />
              ) : null}
            </div>
            {etapa.porqueVazia ? (
              <p className="mt-1 text-[11px] leading-4 text-slate-500">{etapa.porqueVazia}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function SalaDeComandoPanel() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [semAcesso, setSemAcesso] = useState(false);

  const carregar = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
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
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

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
  if (!dados) return null;

  const { indicadores: i, conversao: c } = dados;

  return (
    <div className="space-y-5">
      <section aria-label="Indicadores da operação" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Indicador rotulo="Leads na base" valor={inteiro(i.leadsTotais)} detalhe={`${inteiro(i.emAberto)} em aberto no funil`} />
        <Indicador
          rotulo="Com primeiro contato"
          valor={inteiro(i.comPrimeiroContato)}
          detalhe={`de ${inteiro(i.leadsTotais)} — o resto nunca foi tocado`}
          alerta={i.comPrimeiroContato < i.leadsTotais * 0.1}
        />
        <Indicador rotulo="Em atendimento" valor={inteiro(i.emAtendimento)} detalhe="status contato" />
        <Indicador
          rotulo="Em negociação"
          valor={inteiro(i.emNegociacao)}
          detalhe={i.vgvEmNegociacaoIndisponivel}
          alerta={i.emNegociacao === 0}
        />
        <Indicador
          rotulo="VGV fechado"
          valor={brl(i.vgvFechado)}
          detalhe={i.vendasSemValorInformado > 0 ? `${i.vendasSemValorInformado} venda sem valor informado` : null}
          alerta={i.vendasSemValorInformado > 0}
        />
        {/* A conversão é o único indicador que se RECUSA a mostrar número quando a
            amostra não sustenta. Uma venda em 482 não distingue 0,2% de 2%. */}
        <Indicador
          rotulo="Conversão"
          valor={c.afirmavel && c.taxa !== null ? `${c.taxa}%` : `${c.ganhos} venda${c.ganhos === 1 ? "" : "s"}`}
          detalhe={c.afirmavel ? `${inteiro(c.ganhos)} de ${inteiro(c.base)}` : c.porqueNaoAfirmavel}
          alerta={!c.afirmavel}
        />
      </section>

      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Funil de vendas"
          title="Onde as leads estão agora"
          description={`${inteiro(i.emAberto)} em aberto · ${inteiro(c.ganhos)} ganha${c.ganhos === 1 ? "" : "s"} · ${inteiro(c.perdidos)} perdida${c.perdidos === 1 ? "" : "s"}`}
        />
        <div className="p-5 sm:p-6">
          <Funil etapas={dados.funil} />
          {/* A procedência fica ABAIXO do funil, em texto pequeno: ela não é o
              que o diretor lê primeiro, mas é o que responde "desde quando?" —
              e sem ela "3 já passaram" parece cobrir a história inteira. */}
          <p className="mt-4 border-t border-white/[.06] pt-3 text-[11px] leading-4 text-slate-500">
            {dados.procedencia.registroDeMovimentoMensuravel ? (
              dados.procedencia.registroDeMovimentoDesde ? (
                <>
                  &quot;Já passaram&quot; cobre {inteiro(dados.procedencia.movimentosLidos)} movimentos
                  registrados desde{" "}
                  {new Date(dados.procedencia.registroDeMovimentoDesde).toLocaleDateString("pt-BR")}. O que
                  aconteceu antes disso não tem registro.
                </>
              ) : (
                <>Nenhuma movimentação de etapa registrada ainda — &quot;já passaram&quot; começa a contar a partir da primeira.</>
              )
            ) : (
              <>Não foi possível ler o histórico de movimentação; &quot;já passaram&quot; está indisponível, não é zero.</>
            )}
            {dados.procedencia.amostraTruncada ? (
              <span className="ml-1 text-amber-300">
                Atenção: a leitura de leads foi truncada — estes agregados estão sobre amostra, não sobre a base inteira.
              </span>
            ) : null}
          </p>
        </div>
      </AtlasCard>
    </div>
  );
}
