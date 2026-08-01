"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, Megaphone, Building2, AlertTriangle } from "lucide-react";

/**
 * QUEM PARTICIPA DA FILA DE CADA PROJETO E DE CADA CAMPANHA.
 *
 * A regra mora em `lib/distribution/elenco-por-escopo.ts` e a gravação em
 * `/api/v1/crm/elenco-de-distribuicao`. Esta tela não decide nada — ela só
 * torna a decisão possível com o mouse.
 *
 * ── AS DUAS FRASES QUE ESTA TELA NUNCA DEIXA DE DIZER ──────────────────────
 *
 * 1. O que significa NENHUM selecionado. "0 corretores" pode ser lido como
 *    "ninguém vai receber" — e é o oposto: sem elenco a fila fica ABERTA a
 *    toda a equipe. Não dizer isso já custou confusão neste produto.
 *
 * 2. O que acontece quando o time está fora. Se o elenco existe e ninguém dele
 *    pode atender, a lead NÃO cai para quem foi deixado de fora: ela sobe para
 *    o gerente. Quem monta o time precisa saber disso antes de montar.
 */

type Corretor = { id: string; nome: string; ativo: boolean };
type EscopoItem = { escopo: "projeto" | "campanha"; id: string; nome: string };
type Membro = { id: string; escopo: string; escopoId: string; profileId: string; ativo: boolean };

export default function ElencoDeDistribuicao() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [corretores, setCorretores] = useState<Corretor[]>([]);
  const [escopos, setEscopos] = useState<EscopoItem[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [selecionado, setSelecionado] = useState<EscopoItem | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/v1/crm/elenco-de-distribuicao?contexto=1", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        // A mensagem do servidor é preservada: ela distingue "não pôde ler" de
        // "não há ninguém", que é justamente a confusão que este produto evita.
        setErro(j?.error?.message || "Não foi possível carregar o elenco.");
        return;
      }
      setCorretores(j.data.contexto?.corretores ?? []);
      setEscopos(j.data.contexto?.escopos ?? []);
      setMembros(j.data.membros ?? []);
    } catch {
      setErro("Não foi possível falar com o servidor. A lista NÃO está vazia — ela não pôde ser lida.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const doEscopo = useMemo(() => {
    if (!selecionado) return new Set<string>();
    return new Set(
      membros
        .filter((m) => m.ativo && m.escopo === selecionado.escopo && m.escopoId === selecionado.id)
        .map((m) => m.profileId),
    );
  }, [membros, selecionado]);

  const alternar = async (corretor: Corretor) => {
    if (!selecionado) return;
    const entrando = !doEscopo.has(corretor.id);
    setGravando(corretor.id);
    setAviso(null);
    try {
      const r = await fetch("/api/v1/crm/elenco-de-distribuicao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          escopo: selecionado.escopo, escopoId: selecionado.id,
          profileId: corretor.id, ativo: entrando,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) { setErro(j?.error?.message || "Não foi possível gravar."); return; }
      if (j.data?.aviso) setAviso(j.data.aviso);
      await carregar();
    } finally {
      setGravando(null);
    }
  };

  const porTipo = (tipo: "projeto" | "campanha") => escopos.filter((e) => e.escopo === tipo);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--atlas-text-primary)]">Quem participa da fila</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--atlas-text-secondary)]">
          A distribuição automática escolhe pelo menor número de leads em aberto. Aqui você
          restringe <strong>quem entra nesse sorteio</strong> para cada empreendimento e cada campanha.
          Campanha tem precedência sobre empreendimento.
        </p>
      </header>

      {erro ? (
        <div className="atlas-panel mb-6 flex gap-3 rounded-2xl p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--atlas-warning)]" aria-hidden="true" />
          <p className="text-sm text-[var(--atlas-text-primary)]">{erro}</p>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <nav aria-label="Empreendimentos e campanhas" className="atlas-panel rounded-2xl p-4">
          {carregando ? (
            <div className="h-40 animate-pulse rounded-xl" aria-label="Carregando escopos" />
          ) : escopos.length === 0 ? (
            <p className="text-sm text-[var(--atlas-text-secondary)]">
              Nenhum empreendimento nem campanha cadastrada ainda.
            </p>
          ) : (
            <>
              {(["projeto", "campanha"] as const).map((tipo) => (
                <section key={tipo} className="mb-4 last:mb-0">
                  <h2 className="mb-2 flex items-center gap-2 text-rotulo font-bold uppercase tracking-wider text-[var(--atlas-text-secondary)]">
                    {tipo === "projeto" ? <Building2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />}
                    {tipo === "projeto" ? "Empreendimentos" : "Campanhas"}
                  </h2>
                  <ul className="space-y-1">
                    {porTipo(tipo).map((e) => {
                      const quantos = membros.filter((m) => m.ativo && m.escopo === e.escopo && m.escopoId === e.id).length;
                      const atual = selecionado?.escopo === e.escopo && selecionado?.id === e.id;
                      return (
                        <li key={`${e.escopo}:${e.id}`}>
                          <button
                            type="button"
                            onClick={() => setSelecionado(e)}
                            aria-current={atual ? "true" : undefined}
                            className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm ${atual ? "bg-[var(--atlas-surface-interactive)] text-[var(--atlas-text-primary)]" : "text-[var(--atlas-text-secondary)]"}`}
                          >
                            <span className="min-w-0 truncate">{e.nome}</span>
                            <span className="shrink-0 text-rotulo tabular-nums">
                              {quantos > 0 ? `${quantos}` : "livre"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {porTipo(tipo).length === 0 ? (
                      <li className="px-3 text-sm text-[var(--atlas-text-secondary)]">nenhum</li>
                    ) : null}
                  </ul>
                </section>
              ))}
            </>
          )}
        </nav>

        <section className="atlas-panel rounded-2xl p-4" aria-label="Corretores do escopo">
          {!selecionado ? (
            <p className="text-sm text-[var(--atlas-text-secondary)]">
              Escolha um empreendimento ou campanha ao lado para montar o time dele.
            </p>
          ) : (
            <>
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--atlas-text-primary)]">
                <Users className="h-4 w-4" aria-hidden="true" />
                {selecionado.nome}
              </h2>

              {/* A frase 1: o que significa nenhum selecionado. */}
              <p className="mb-4 text-sm text-[var(--atlas-text-secondary)]">
                {doEscopo.size === 0 ? (
                  <>
                    <strong className="text-[var(--atlas-text-primary)]">Nenhum corretor selecionado</strong> — e isso
                    quer dizer que a fila está <strong>aberta a toda a equipe</strong>, não que ninguém receba.
                  </>
                ) : (
                  <>
                    {doEscopo.size} de {corretores.length} corretores participam. Só eles entram no rodízio deste escopo.
                  </>
                )}
              </p>

              {/* A frase 2: o que acontece quando o time está fora. */}
              {doEscopo.size > 0 ? (
                <p className="mb-4 rounded-xl border border-[var(--atlas-border-subtle)] p-3 text-corpo text-[var(--atlas-text-secondary)]">
                  Se nenhum deles estiver disponível quando a lead chegar, ela <strong>não</strong> vai para quem
                  ficou de fora: sobe para o gerente, com o motivo escrito no histórico.
                </p>
              ) : null}

              {aviso ? (
                <p className="mb-4 rounded-xl border border-[var(--atlas-border-subtle)] p-3 text-corpo text-[var(--atlas-text-primary)]">{aviso}</p>
              ) : null}

              <ul className="space-y-1">
                {corretores.map((c) => {
                  const dentro = doEscopo.has(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => void alternar(c)}
                        disabled={gravando === c.id}
                        aria-pressed={dentro}
                        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-[var(--atlas-text-primary)] disabled:opacity-50"
                      >
                        <span
                          aria-hidden="true"
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${dentro ? "border-transparent bg-[var(--atlas-accent)] text-[var(--atlas-texto-sobre-acento)]" : "border-[var(--atlas-border)]"}`}
                        >
                          {dentro ? "✓" : ""}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                        {gravando === c.id ? (
                          <span className="shrink-0 text-rotulo text-[var(--atlas-text-secondary)]">gravando…</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
                {corretores.length === 0 && !carregando ? (
                  <li className="px-3 text-sm text-[var(--atlas-text-secondary)]">
                    Nenhum corretor ativo na organização.
                  </li>
                ) : null}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
