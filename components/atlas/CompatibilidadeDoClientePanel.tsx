"use client";

/**
 * COMPATIBILIDADE CLIENTE × IMÓVEL — o painel.
 *
 * ── ONDE ESTE COMPONENTE DEVERIA SER MONTADO ────────────────────────────────
 *
 * Ele NÃO foi montado em tela nenhuma nesta entrega, de propósito: as telas
 * naturais (`app/(crm)/leads/page.tsx` e `app/(crm)/command-center/page.tsx`)
 * estão bloqueadas por outro workflow em andamento. Montar por cima produziria
 * conflito, e este arquivo não vale um conflito.
 *
 * Os dois pontos de montagem, quando as telas liberarem:
 *
 *   1. FICHA DO CLIENTE — `app/(crm)/leads/[id]/page.tsx`, abaixo da
 *      qualificação:  <CompatibilidadeDoClientePanel leadId={lead.id} />
 *      É o lugar onde o corretor decide o que oferecer na ligação.
 *
 *   2. DIAGNÓSTICO DA CARTEIRA — qualquer painel de liderança (o Command Center
 *      é o destino óbvio):  <CompatibilidadeDoClientePanel />
 *      Sem `leadId` o painel entra em modo carteira e responde a pergunta que
 *      interessa à gestão: para quantos clientes dá para recomendar hoje.
 *
 * ── A DECISÃO DE DESENHO ────────────────────────────────────────────────────
 *
 * O painel dá o MESMO destaque à lacuna e à recomendação. Não é neutralidade
 * estética: medido em 2026-07-30, o motor consegue recomendar para 12 das 482
 * leads da organização com catálogo (2,5%). Um painel que só soubesse mostrar
 * "os três imóveis" ficaria vazio em 97,5% das aberturas e ensinaria a operação
 * a não abri-lo — e aí ele também não serviria quando tivesse o que mostrar.
 *
 * E separa a lacuna por DONO, porque a maior delas não é do cliente: nenhum dos
 * 4 empreendimentos tem preço cadastrado. Mandar o corretor "perguntar o
 * orçamento" não destrava nada enquanto não houver preço com que comparar.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import { CapturaDeRespostaDecisiva } from "@/components/atlas/CapturaDeRespostaDecisiva";

type Criterio = {
  chave: string;
  rotulo: string;
  peso: number;
  decisivo: boolean;
  estado: "atendido" | "nao_atendido" | "falta_cliente" | "falta_oferta";
  detalhe: string;
};

type Pontuacao = {
  ofertaId: string;
  nome: string;
  atendidos: Criterio[];
  naoAtendidos: Criterio[];
  faltaDoCliente: Criterio[];
  faltaDaOferta: Criterio[];
  pontos: number;
  pontosTotais: number;
  aderencia: number | null;
  cobertura: number;
  confianca: "alta" | "media" | "baixa" | "insuficiente";
  riscoDeEstoque: { suspeito: boolean; motivo: string; diasDesdeAtualizacao: number | null };
};

type Alternativa =
  | { indisponivel: true; motivo: string }
  | { ofertaId: string; nome: string; preco?: number; economia?: number | null; bairro?: string | null; porque?: string };

type Resposta = {
  modo: "cliente" | "carteira";
  // modo cliente
  recomendavel?: boolean;
  motivoDaRecusa?: string | null;
  top?: Pontuacao[];
  ofertasNaoAvaliaveis?: Array<{ ofertaId: string; nome: string; porque: string }>;
  /**
   * `destravaOfertas` vinha da API desde sempre e este tipo o OMITIA — então o
   * campo chegava e era descartado no JSX. O corretor via a ordem certa (o motor
   * passou a ordenar por destrave em 2026-07-30) sem ver o motivo dela.
   *
   * É o número que transforma a lista em decisão: "bairro destrava 4 ofertas,
   * preço destrava 1" responde qual pergunta vale o único toque da ligação —
   * medido, com 462 leads de SLA vencido e 23 contatos no histórico inteiro.
   */
  perguntasQueDestravam?: Array<{
    chave: string;
    rotulo: string;
    decisivo: boolean;
    pergunta: string;
    destravaOfertas?: number;
  }>;
  lacunasDoCatalogo?: Array<{ chave: string; rotulo: string; decisivo: boolean; preencher: string; ofertasAfetadas?: number }>;
  alternativaMaisBarata?: Alternativa;
  alternativaProxima?: Alternativa;
  // modo carteira
  clientes?: number;
  comRecomendacao?: number;
  semRecomendacao?: number;
  proporcaoComRecomendacao?: number;
  perguntasMaisFrequentes?: Array<{ chave: string; rotulo: string; clientes: number; pergunta: string }>;
  escopo?: string;
  truncado?: boolean;
  catalogo?: Record<string, number>;
};

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`);

async function cabecalho() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

const CORES: Record<Criterio["estado"], string> = {
  atendido: "text-emerald-300",
  nao_atendido: "text-rose-300",
  falta_cliente: "text-amber-300",
  falta_oferta: "text-sky-300",
};

const NOMES: Record<Criterio["estado"], string> = {
  atendido: "atende",
  nao_atendido: "não atende",
  falta_cliente: "falta o cliente informar",
  falta_oferta: "falta no cadastro do imóvel",
};

export function CompatibilidadeDoClientePanel({ leadId }: { leadId?: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const cab = await cabecalho();
    if (!cab) {
      setErro("Sessão expirada. Entre novamente.");
      setCarregando(false);
      return;
    }
    try {
      const url = leadId ? `/api/v1/crm/compatibilidade?leadId=${encodeURIComponent(leadId)}` : "/api/v1/crm/compatibilidade";
      const res = await fetch(url, { headers: cab, cache: "no-store" });
      const corpo = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível calcular a compatibilidade agora.");
      } else {
        setDados(corpo?.data ?? null);
      }
    } catch {
      setErro("Falha de rede ao calcular a compatibilidade.");
    }
    setCarregando(false);
  }, [leadId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) {
    return (
      <AtlasCard>
        <AtlasCardHeader eyebrow="Matching" title="Compatibilidade" />
        <p className="atlas-text-muted text-sm">Calculando por regras…</p>
      </AtlasCard>
    );
  }

  if (erro) {
    return (
      <AtlasCard>
        <AtlasCardHeader eyebrow="Matching" title="Compatibilidade" />
        <p className="text-sm text-rose-300">{erro}</p>
        <button type="button" onClick={() => void carregar()} className="atlas-btn atlas-btn-quiet mt-3 text-xs">
          Tentar de novo
        </button>
      </AtlasCard>
    );
  }

  if (!dados) return null;

  /* ── MODO CARTEIRA ───────────────────────────────────────────────────────── */
  if (dados.modo === "carteira") {
    return (
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Matching por regras"
          title="Para quantos clientes dá para recomendar hoje"
          description={`Escopo: ${dados.escopo === "organizacao" ? "organização inteira" : "sua carteira"}. Motor determinístico, sem IA.`}
        />
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-semibold">{dados.comRecomendacao ?? 0}</p>
            <p className="atlas-text-muted text-xs">com recomendação</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-amber-300">{dados.semRecomendacao ?? 0}</p>
            <p className="atlas-text-muted text-xs">faltam dados</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">{pct(dados.proporcaoComRecomendacao)}</p>
            <p className="atlas-text-muted text-xs">de {dados.clientes ?? 0} clientes</p>
          </div>
        </div>

        {dados.truncado ? (
          <p className="mt-3 text-xs text-amber-300">
            A leitura atingiu o teto de clientes por consulta — os números acima cobrem a primeira página, não a
            carteira inteira.
          </p>
        ) : null}

        {/* O CATÁLOGO PRIMEIRO: é a lacuna que nenhuma ligação resolve. */}
        {dados.catalogo ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Lacunas do catálogo</p>
            <p className="atlas-text-muted mt-1 text-xs">
              {dados.catalogo.imoveis} imóvel(is) ativo(s). Estas colunas vazias travam o matching para TODOS os
              clientes — e ligar para o cliente não as preenche.
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {[
                ["sem preço", dados.catalogo.semPreco],
                ["sem dormitórios", dados.catalogo.semDormitorios],
                ["sem bairro", dados.catalogo.semBairro],
                ["sem coordenadas", dados.catalogo.semGeo],
                ["sem data de entrega", dados.catalogo.semDataDeEntrega],
                ["sem contagem de estoque", dados.catalogo.semContagemDeEstoque],
                ["sem regra de pagamento", dados.catalogo.semRegraDePagamento],
              ]
                .filter(([, n]) => Number(n) > 0)
                .map(([rotulo, n]) => (
                  <li key={String(rotulo)} className="text-sky-300">
                    {String(rotulo)}: {String(n)} de {dados.catalogo?.imoveis}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {dados.perguntasMaisFrequentes && dados.perguntasMaisFrequentes.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              Perguntas que destravam mais clientes
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {dados.perguntasMaisFrequentes.slice(0, 6).map((p) => (
                <li key={p.chave}>
                  <span className="text-amber-300">{p.clientes} cliente(s)</span> — “{p.pergunta}”
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </AtlasCard>
    );
  }

  /* ── MODO CLIENTE ────────────────────────────────────────────────────────── */
  return (
    <AtlasCard>
      <AtlasCardHeader
        eyebrow="Matching por regras"
        title="Imóveis compatíveis"
        description="Pontuação determinística por 14 critérios. Nada aqui é estimado por IA."
      />

      {!dados.recomendavel ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-sm text-amber-200">Ainda não dá para recomendar imóvel para este cliente.</p>
          <p className="atlas-text-muted mt-1 text-xs">{dados.motivoDaRecusa}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {(dados.top ?? []).map((t) => (
            <li key={t.ofertaId} className="rounded-md border border-white/10 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{t.nome}</p>
                <p className="atlas-text-muted text-xs">
                  {t.pontos}/{t.pontosTotais} pontos · aderência {pct(t.aderencia)} ·{" "}
                  <span className={t.cobertura < 0.3 ? "text-amber-300" : ""}>cobertura {pct(t.cobertura)}</span>
                </p>
              </div>
              {/* Cobertura ao lado da aderência SEMPRE: 100% sobre 1 critério de
                  14 não é compatibilidade, e a tela não pode deixar parecer. */}
              <p className="atlas-text-muted mt-1 text-xs">confiança da leitura: {t.confianca}</p>

              <div className="mt-2 space-y-1 text-xs">
                {[...t.atendidos, ...t.naoAtendidos, ...t.faltaDoCliente, ...t.faltaDaOferta].map((c) => (
                  <p key={c.chave} className={CORES[c.estado]}>
                    {c.rotulo} — {NOMES[c.estado]}
                    {c.decisivo ? " (decisivo)" : ""}: {c.detalhe}
                  </p>
                ))}
              </div>

              {t.riscoDeEstoque.suspeito ? (
                <p className="mt-2 text-xs text-amber-300">Risco de informação desatualizada: {t.riscoDeEstoque.motivo}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {dados.ofertasNaoAvaliaveis && dados.ofertasNaoAvaliaveis.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Fora do ranking</p>
          <ul className="mt-1 space-y-1 text-xs text-sky-300">
            {dados.ofertasNaoAvaliaveis.map((o) => (
              <li key={o.ofertaId}>
                {o.nome} — {o.porque}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">Alternativa mais barata</p>
          <p className="atlas-text-muted mt-1 text-xs">
            {dados.alternativaMaisBarata && "indisponivel" in dados.alternativaMaisBarata
              ? dados.alternativaMaisBarata.motivo
              : `${dados.alternativaMaisBarata?.nome}`}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">Alternativa próxima</p>
          <p className="atlas-text-muted mt-1 text-xs">
            {dados.alternativaProxima && "indisponivel" in dados.alternativaProxima
              ? dados.alternativaProxima.motivo
              : `${dados.alternativaProxima?.nome} — ${dados.alternativaProxima?.bairro ?? ""}`}
          </p>
        </div>
      </div>

      {dados.perguntasQueDestravam && dados.perguntasQueDestravam.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Pergunte ao cliente</p>
          <ul className="mt-1 space-y-1 text-xs">
            {dados.perguntasQueDestravam.map((p) => (
              <li key={p.chave} className="text-amber-200">
                “{p.pergunta}”
                {/*
                  O NÚMERO, e não o rótulo "(destrava o matching)".
                  "destrava o matching" era verdade para toda pergunta decisiva e
                  por isso não separava nenhuma delas. `destravaOfertas` separa:
                  com 4 empreendimentos e preço em 2, bairro destrava 4 e preço
                  destrava 1 — e o corretor tem UM toque por cliente.
                */}
                {typeof p.destravaOfertas === "number" && p.destravaOfertas > 0 ? (
                  <span className="ml-1 whitespace-nowrap text-emerald-300">
                    destrava {p.destravaOfertas} {p.destravaOfertas === 1 ? "imóvel" : "imóveis"}
                  </span>
                ) : p.decisivo ? (
                  " (destrava o matching)"
                ) : null}
                {/*
                  A captura fica NA pergunta, não numa tela separada. O corretor
                  ouve a resposta no telefone e grava ali — medido: 473 leads com
                  SLA de primeiro contato vencido, 4 notas humanas em 469, e
                  nenhuma tela do CRM permitia gravar bairro ou dormitórios numa
                  lead existente. `aoSalvar` recarrega porque a resposta muda o
                  que o motor recomenda na mesma hora.
                */}
                {leadId && p.decisivo ? (
                  <CapturaDeRespostaDecisiva leadId={leadId} chave={p.chave} aoSalvar={() => void carregar()} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dados.lacunasDoCatalogo && dados.lacunasDoCatalogo.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Falta no cadastro do imóvel</p>
          <p className="atlas-text-muted mt-1 text-xs">Isto não se resolve ligando para o cliente.</p>
          <ul className="mt-1 space-y-1 text-xs text-sky-300">
            {dados.lacunasDoCatalogo.map((l) => (
              <li key={l.chave}>
                {l.rotulo} — preencher {l.preencher}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AtlasCard>
  );
}

export default CompatibilidadeDoClientePanel;
