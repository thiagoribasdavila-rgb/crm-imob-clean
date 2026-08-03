"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { StatusBadge } from "@/components/atlas/status-badge";

/**
 * A FILA DE ATENDIMENTO — quem recebe a próxima lead de cada empreendimento e
 * de cada campanha, e em que ordem.
 *
 * ── Por que esta tela existe, e o que ela substitui ─────────────────────────
 *
 * Havia DUAS telas para a mesma decisão, e nenhuma das duas funcionava inteira:
 *
 *   /settings/distribuicao ..... montava o elenco por projeto/campanha e
 *                                gravava de verdade — mas o motor nunca lia o
 *                                escopo, então o elenco não mudava para onde a
 *                                lead ia. Ficava escondida em configurações.
 *   /distribution (elegibilidade) mostrava "Pausar/Ativar" e "Peso" por
 *                                corretor e mandava `action: "configure_member"`
 *                                para uma rota que NÃO conhece essa ação: 400 a
 *                                cada clique, com a mensagem de erro genérica.
 *
 * Este painel é a única porta agora: escolher o escopo, ver a fila na ordem,
 * colocar e tirar gente, e ler de quem é a vez.
 *
 * ── AS TRÊS FRASES QUE ESTE PAINEL NUNCA DEIXA DE DIZER ────────────────────
 *
 * 1. O QUE SIGNIFICA FILA VAZIA. "0 na fila" lê-se como "ninguém vai receber",
 *    e é o oposto: sem fila montada, o escopo fica ABERTO a toda a equipe. Não
 *    dizer isso já custou confusão neste produto.
 *
 * 2. O QUE ACONTECE QUANDO O TIME ESTÁ FORA. Se a fila existe e ninguém dela
 *    pode atender, a lead NÃO cai para quem foi deixado de fora: sobe para o
 *    gerente, com o motivo escrito no histórico.
 *
 * 3. POR QUE NINGUÉM ESTÁ MARCADO COMO PRÓXIMO. Fila montada e nenhum "próximo"
 *    parece defeito de tela. Quase sempre é a operação: ninguém com o WhatsApp
 *    conectado, e sem canal ligado a lead entra represada de propósito.
 */

type Corretor = {
  id: string; nome: string; ativo: boolean;
  disponivel: boolean; whatsappConectado: boolean;
  cargaAberta: number; capacidade: number;
  elegivelAgora: boolean; porQueNao: string | null;
};

type EscopoItem = {
  escopo: "projeto" | "campanha"; id: string; nome: string;
  leadsTotal: number; leads30d: number; leadsSemDono: number;
  plataforma: string | null; situacao: string | null;
};

type Membro = { id: string; escopo: string; escopoId: string; profileId: string; ativo: boolean; posicao: number | null };

type Lugar = {
  profileId: string; nome: string; ordem: number;
  ultimaLeadEm: string | null; elegivelAgora: boolean;
  porQueNao: string | null; proximo: boolean; puladoPorque: string | null;
};

type Resposta = {
  contexto: { corretores: Corretor[]; escopos: EscopoItem[]; travaGeral: string | null } | null;
  fila: { escopo: string; escopoId: string; lugares: Lugar[]; proximoId: string | null; porque: string } | null;
  membros: Membro[];
};

function quandoRecebeu(iso: string | null): string {
  if (!iso) return "ainda não recebeu deste escopo";
  const minutos = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(minutos)) return "ainda não recebeu deste escopo";
  if (minutos < 60) return `última há ${minutos} min`;
  if (minutos < 1440) return `última há ${Math.floor(minutos / 60)} h`;
  return `última há ${Math.floor(minutos / 1440)} d`;
}

const CHIP_ATIVO = "border-[color:var(--atlas-accent)]! text-[var(--atlas-texto-forte)]!";
const CHIP_PARADO = "hover:border-[rgba(148,163,184,0.35)]! hover:text-[var(--atlas-texto-forte)]!";

export function FilaDeAtendimentoPanel({ podeEditar = true }: { podeEditar?: boolean }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [gravando, setGravando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<{ escopo: "projeto" | "campanha"; id: string } | null>(null);
  const [mostrarSemVolume, setMostrarSemVolume] = useState(false);

  const carregar = useCallback(async (alvo: { escopo: string; id: string } | null, silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const busca = new URLSearchParams({ contexto: "1" });
      if (alvo) { busca.set("escopo", alvo.escopo); busca.set("escopoId", alvo.id); }
      const resposta = await fetch(`/api/v1/crm/elenco-de-distribuicao?${busca}`, { cache: "no-store" });
      const corpo = await resposta.json();
      if (!resposta.ok || !corpo?.ok) {
        // A mensagem do servidor é preservada de propósito: ela distingue "não
        // pôde ler" de "não há ninguém", que é justamente a confusão que este
        // painel existe para evitar.
        setErro(corpo?.error?.message || "Não foi possível carregar a fila de atendimento.");
        return;
      }
      setDados(corpo.data as Resposta);
      setErro(null);
    } catch {
      setErro("Não foi possível falar com o servidor. A fila NÃO está vazia — ela não pôde ser lida.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(selecionado); }, [carregar, selecionado]);

  const escopos = dados?.contexto?.escopos ?? [];
  const corretores = dados?.contexto?.corretores ?? [];
  const membros = dados?.membros ?? [];
  const fila = dados?.fila ?? null;

  const naFilaAgora = useMemo(
    () => new Set(fila?.lugares.map((lugar) => lugar.profileId) ?? []),
    [fila],
  );

  /**
   * Empreendimentos e campanhas ordenados por VOLUME, não por nome.
   *
   * A pergunta que traz alguém a esta tela é "quem atende o que está entrando";
   * a campanha que gerou 23 leads no mês importa mais que a que gerou zero, e
   * ordenar por nome esconde isso atrás da letra inicial. As de volume zero
   * continuam acessíveis — atrás de um botão, porque montar time para campanha
   * que não gera lead é o caso raro, não o comum.
   */
  const porTipo = useCallback((tipo: "projeto" | "campanha") => {
    const doTipo = escopos.filter((item) => item.escopo === tipo);
    const ordenados = doTipo.slice().sort((a, b) =>
      b.leads30d - a.leads30d || b.leadsTotal - a.leadsTotal || a.nome.localeCompare(b.nome, "pt-BR"));
    return mostrarSemVolume ? ordenados : ordenados.filter((item) => item.leadsTotal > 0 || item.escopo === "projeto");
  }, [escopos, mostrarSemVolume]);

  const semVolumeEscondidos = useMemo(
    () => escopos.filter((item) => item.escopo === "campanha" && item.leadsTotal === 0).length,
    [escopos],
  );

  const quantosNaFila = useCallback(
    (item: EscopoItem) => membros.filter((m) => m.ativo && m.escopo === item.escopo && m.escopoId === item.id).length,
    [membros],
  );

  const escopoAtual = useMemo(
    () => escopos.find((item) => item.escopo === selecionado?.escopo && item.id === selecionado?.id) ?? null,
    [escopos, selecionado],
  );

  const foraDaFila = useMemo(
    () => corretores.filter((corretor) => !naFilaAgora.has(corretor.id)),
    [corretores, naFilaAgora],
  );

  async function escrever(corpo: Record<string, unknown>, chave: string) {
    if (!selecionado || !podeEditar) return;
    setGravando(chave);
    setAviso(null);
    try {
      const resposta = await fetch("/api/v1/crm/elenco-de-distribuicao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ escopo: selecionado.escopo, escopoId: selecionado.id, ...corpo }),
      });
      const dadosDaEscrita = await resposta.json();
      if (!resposta.ok || !dadosDaEscrita?.ok) {
        setErro(dadosDaEscrita?.error?.message || "Não foi possível gravar a fila.");
        return;
      }
      if (dadosDaEscrita.data?.aviso) setAviso(dadosDaEscrita.data.aviso);
      setErro(null);
      await carregar(selecionado, true);
    } catch {
      setErro("Não foi possível falar com o servidor para gravar a fila.");
    } finally {
      setGravando(null);
    }
  }

  return (
    <div className="cc6-panel overflow-hidden" data-phase="fila-de-atendimento">
      <header className="px-5 pt-4 pb-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h2 id="fila-de-atendimento-titulo" className="text-base font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
            Fila de atendimento
          </h2>
          <p className="cc6-eyebrow text-micro!">Rodízio por empreendimento e por campanha</p>
        </div>
        <p className="mt-1 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
          A próxima lead vai para quem vem <strong className="text-[var(--atlas-texto-medio)]">depois de quem recebeu por último</strong>.
          Campanha tem precedência sobre empreendimento. Só quem está na fila entra no rodízio deste escopo.
        </p>
      </header>

      {erro ? (
        <div className="px-5 pb-3">
          <AtlasRecoverableError description={erro} onRetry={() => void carregar(selecionado)} busy={carregando} />
        </div>
      ) : null}

      {/* A frase 3: por que ninguém aparece como próximo. Fica acima da fila
          porque explica a fila inteira, não uma linha dela. */}
      {dados?.contexto?.travaGeral ? (
        <div className="cc6-hairline cc6-sev-band px-5 py-3" style={{ "--cc6-sev": "var(--atlas-estado-atencao)" } as React.CSSProperties}>
          <p className="text-corpo leading-5 text-[var(--atlas-texto-forte)]">{dados.contexto.travaGeral}</p>
        </div>
      ) : null}

      <div className="cc6-hairline grid gap-0 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* ── ONDE ─────────────────────────────────────────────────────────── */}
        <nav aria-label="Empreendimentos e campanhas" className="lg:border-r lg:border-[var(--atlas-border-subtle)]">
          {carregando && !dados ? (
            <div className="space-y-2 p-5" aria-busy="true">
              {[1, 2, 3, 4].map((item) => <AtlasSkeleton key={item} className="h-10" />)}
            </div>
          ) : escopos.length === 0 ? (
            <div className="p-5">
              <AtlasEmpty
                reason="not-configured"
                eyebrow="Nada para montar"
                title="Nenhum empreendimento nem campanha"
                description="Cadastre um empreendimento ou registre uma campanha para montar a fila dele."
              />
            </div>
          ) : (
            <div className="py-2">
              {(["projeto", "campanha"] as const).map((tipo) => (
                <section key={tipo} className="mb-2 last:mb-0">
                  <h3 className="px-5 py-1.5 text-rotulo font-bold uppercase tracking-wider text-[var(--atlas-texto-fraco)]">
                    {tipo === "projeto" ? "Empreendimentos" : "Campanhas"}
                  </h3>
                  <ul>
                    {porTipo(tipo).map((item) => {
                      const quantos = quantosNaFila(item);
                      const atual = selecionado?.escopo === item.escopo && selecionado?.id === item.id;
                      return (
                        <li key={`${item.escopo}:${item.id}`}>
                          <button
                            type="button"
                            onClick={() => setSelecionado({ escopo: item.escopo, id: item.id })}
                            aria-current={atual ? "true" : undefined}
                            className={`flex min-h-11 w-full items-start gap-3 px-5 py-2.5 text-left transition-colors ${atual ? "bg-[rgba(75,141,248,0.10)]" : "hover:bg-[rgba(75,141,248,0.04)]"}`}
                          >
                            <span className="min-w-0 flex-1">
                              {/* SEM `truncate`: nome de campanha da Meta é
                                  comprido por natureza ("[Cia360] Inside Smart|
                                  Lead | Imob | Jul.26") e cortado não identifica
                                  campanha nenhuma — que é justamente a escolha
                                  que esta lista existe para permitir. */}
                              <span className={`block text-sm leading-5 ${atual ? "font-semibold text-[var(--atlas-texto-forte)]" : "text-[var(--atlas-texto-medio)]"}`}>
                                {item.nome}
                              </span>
                              <span className="mt-0.5 block text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                                {item.leads30d > 0
                                  ? <><span className="cc6-num">{item.leads30d}</span> lead{item.leads30d === 1 ? "" : "s"} em 30 dias</>
                                  : item.leadsTotal > 0
                                    ? <><span className="cc6-num">{item.leadsTotal}</span> no total · nada em 30 dias</>
                                    : "nenhuma lead ainda"}
                                {item.leadsSemDono > 0 ? <> · <span className="cc6-warn cc6-num">{item.leadsSemDono}</span> sem dono</> : null}
                              </span>
                            </span>
                            {/* "livre" não é enfeite: é a diferença entre "fila
                                aberta a todos" e "ninguém recebe". */}
                            <span className={`shrink-0 text-rotulo tabular-nums ${quantos > 0 ? "text-[var(--atlas-texto-medio)]" : "text-[var(--atlas-texto-fraco)]"}`}>
                              {quantos > 0 ? `${quantos} na fila` : "livre"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {porTipo(tipo).length === 0 ? (
                      <li className="px-5 py-2 text-sm text-[var(--atlas-texto-fraco)]">nenhuma</li>
                    ) : null}
                  </ul>
                </section>
              ))}
              {semVolumeEscondidos > 0 ? (
                <div className="px-5 pt-1 pb-3">
                  <button
                    type="button"
                    onClick={() => setMostrarSemVolume((atual) => !atual)}
                    className="cc6-chip cc6-interativo cursor-pointer"
                  >
                    {mostrarSemVolume
                      ? "ocultar campanhas sem lead"
                      : `mostrar ${semVolumeEscondidos} campanha${semVolumeEscondidos === 1 ? "" : "s"} sem lead`}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </nav>

        {/* ── QUEM, E EM QUE ORDEM ─────────────────────────────────────────── */}
        <section aria-labelledby="fila-de-atendimento-titulo">
          {!selecionado ? (
            <div className="p-5">
              <AtlasEmpty
                reason="no-results"
                eyebrow="Escolha o escopo"
                title="Selecione um empreendimento ou uma campanha"
                description="A fila é montada por escopo: quem atende o Arvo não é quem atende a campanha de investidor."
              />
            </div>
          ) : (
            <>
              <div className="cc6-hairline px-5 py-3 lg:border-t-0">
                <p className="text-sm font-semibold leading-5 text-[var(--atlas-texto-forte)]">{escopoAtual?.nome ?? "Escopo selecionado"}</p>
                {/* A frase 1: o que significa fila vazia. */}
                <p className="mt-1 text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
                  {fila && fila.lugares.length > 0 ? (
                    <>
                      <span className="cc6-num font-semibold text-[var(--atlas-texto-medio)]">{fila.lugares.length}</span> de {corretores.length} corretores na fila.
                      {" "}Só eles entram no rodízio deste escopo.
                    </>
                  ) : (
                    <>
                      <strong className="text-[var(--atlas-texto-forte)]">Fila vazia</strong> — e isso quer dizer que este escopo está{" "}
                      <strong className="text-[var(--atlas-texto-forte)]">aberto a toda a equipe</strong>, não que ninguém receba.
                      Coloque alguém na fila para restringir e passar a valer o rodízio.
                    </>
                  )}
                </p>
                {/* A frase 2: o que acontece quando o time está fora. */}
                {fila && fila.lugares.length > 0 ? (
                  <p className="mt-2 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                    Se nenhum deles puder atender quando a lead chegar, ela <strong>não</strong> vai para quem ficou de fora: sobe para o gerente, com o motivo no histórico.
                  </p>
                ) : null}
                {aviso ? (
                  <p className="cc6-warn mt-2 text-corpo leading-5">{aviso}</p>
                ) : null}
              </div>

              {carregando && !fila ? (
                <div className="space-y-2 p-5" aria-busy="true">
                  {[1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-12" />)}
                </div>
              ) : fila && fila.lugares.length > 0 ? (
                <ol>
                  {fila.lugares.map((lugar, indice) => (
                    <li
                      key={lugar.profileId}
                      className={`cc6-hairline flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 ${lugar.proximo ? "cc6-sev-band bg-[rgba(75,141,248,0.06)]" : ""}`}
                      style={lugar.proximo ? ({ "--cc6-sev": "var(--atlas-accent)" } as React.CSSProperties) : undefined}
                    >
                      <span
                        className={`cc6-metric-value w-8 shrink-0 text-center text-lg ${lugar.proximo ? "text-[color:var(--atlas-accent)]!" : "text-[var(--atlas-texto-fraco)]!"}`}
                        aria-hidden="true"
                      >
                        {String(lugar.ordem).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-[var(--atlas-texto-forte)]">{lugar.nome}</h4>
                          {lugar.proximo ? <StatusBadge tone="info">Próximo</StatusBadge> : null}
                          {lugar.puladoPorque ? <StatusBadge tone="warning">Pulado</StatusBadge> : null}
                        </div>
                        {/* SEM `truncate`: esta linha é a JUSTIFICATIVA da
                            posição e do pulo. Reticências comeriam exatamente o
                            motivo, que é a parte que o corretor cobra. */}
                        <p className="mt-0.5 text-xs leading-4 text-[var(--atlas-texto-fraco)]">
                          {quandoRecebeu(lugar.ultimaLeadEm)}
                          {lugar.porQueNao ? <> · <span className="cc6-warn">{lugar.porQueNao}</span></> : <> · <span className="cc6-ok">pode receber agora</span></>}
                        </p>
                      </div>
                      {podeEditar ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={indice === 0 || gravando !== null}
                            onClick={() => void escrever({ profileId: lugar.profileId, acao: "mover", direcao: "subir" }, `subir:${lugar.profileId}`)}
                            aria-label={`Subir ${lugar.nome} na fila`}
                            className="cc6-chip cc6-interativo cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={indice === fila.lugares.length - 1 || gravando !== null}
                            onClick={() => void escrever({ profileId: lugar.profileId, acao: "mover", direcao: "descer" }, `descer:${lugar.profileId}`)}
                            aria-label={`Descer ${lugar.nome} na fila`}
                            className="cc6-chip cc6-interativo cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            disabled={gravando !== null}
                            onClick={() => void escrever({ profileId: lugar.profileId, ativo: false }, `sair:${lugar.profileId}`)}
                            className="cc6-ghost-btn disabled:opacity-50"
                          >
                            {gravando === `sair:${lugar.profileId}` ? "tirando…" : "Tirar da fila"}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}

              {/* O motivo vindo do motor, palavra por palavra. É a MESMA frase
                  que vai para o histórico da lead — se a tela contasse a decisão
                  com outras palavras, haveria duas versões da mesma verdade. */}
              {fila && fila.lugares.length > 0 ? (
                <p className="cc6-hairline px-5 py-2.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                  {fila.porque}
                </p>
              ) : null}

              {/* ── QUEM AINDA NÃO ESTÁ NA FILA ──────────────────────────── */}
              {podeEditar ? (
                <div className="cc6-hairline px-5 py-4">
                  <p className="cc6-eyebrow">Fora da fila deste escopo</p>
                  {foraDaFila.length === 0 ? (
                    <p className="mt-2 text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
                      {corretores.length === 0
                        ? "Nenhum corretor ativo na organização."
                        : "Todos os corretores da organização já estão nesta fila."}
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                        Um clique coloca a pessoa no FIM da fila — entrar não fura a vez de quem já estava.
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {foraDaFila.map((corretor) => (
                          <button
                            key={corretor.id}
                            type="button"
                            disabled={gravando !== null}
                            onClick={() => void escrever({ profileId: corretor.id, ativo: true }, `entrar:${corretor.id}`)}
                            title={corretor.porQueNao
                              ? `${corretor.nome} — ${corretor.porQueNao}. Entra na fila do mesmo jeito e recebe quando puder.`
                              : `${corretor.nome} — ${corretor.cargaAberta} de ${corretor.capacidade} em carteira.`}
                            className={`cc6-chip cc6-interativo max-w-full cursor-pointer whitespace-normal! disabled:opacity-50 ${corretor.elegivelAgora ? CHIP_ATIVO : CHIP_PARADO}`}
                          >
                            {gravando === `entrar:${corretor.id}` ? "colocando…" : <>+ {corretor.nome}</>}
                            {corretor.porQueNao ? (
                              <span className="ml-1.5 text-micro text-[var(--atlas-texto-fraco)]">({corretor.porQueNao})</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      <p className="cc6-hairline px-5 py-2.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
        Montar a fila é decisão de liderança · a ordem vale para leads de entrada automática (Meta e portais) e para redistribuição aprovada ·{" "}
        <Link href="/integrations/whatsapp" className="underline decoration-dotted underline-offset-2 hover:text-[var(--atlas-texto-medio)]">
          o canal de WhatsApp
        </Link>{" "}
        precisa estar conectado para receber.
      </p>
    </div>
  );
}
