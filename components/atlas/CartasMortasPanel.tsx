"use client";

/**
 * A FILA MORTA, NA TELA — a porta que faltava para a porta que faltava.
 *
 * ── O que foi medido em 03/08/2026 ─────────────────────────────────────────
 *
 * `/api/v3/dlq/retry` existe desde 16/07/2026 e resolve uma carta morta por
 * clique. `/api/v3/dlq` foi escrita depois para LISTÁ-LAS, e o comentário dela
 * diz, com todas as letras, que nada chamava a irmã.
 *
 * As duas continuaram sem tela. O portão `check-rotas-orfas` não acusava porque
 * lia o texto CRU dos arquivos: a menção em comentário contava como chamada.
 * Corrigido o instrumento, as duas apareceram — junto com a rota de execução da
 * Meta, que estava no mesmo caso.
 *
 * E há trabalho esperando: `integration_outbox` tem 10 linhas em `dead_letter`,
 * todas `meta.conversion.send`, todas com o mesmo erro —
 * `META_CONVERSIONS_ACCESS_TOKEN não configurado`. São 10 sinais de conversão
 * que o algoritmo da Meta nunca recebeu. Ferramenta pronta, defeito conhecido,
 * e nenhum lugar no produto onde apertar o botão.
 *
 * ── Por que o painel diz de quem é a vez ───────────────────────────────────
 *
 * Reprocessar REENFILEIRA entrega real, e a rota trata isso como decisão de
 * diretoria (403 para os demais). Um botão que aparece para todo mundo e falha
 * para quase todos ensina a ignorar o painel. A API já responde `euPosso` — o
 * botão só existe para quem pode, e quem não pode lê de quem é a vez.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Linha = {
  id: string;
  topico: string;
  criadaEm: string | null;
  idadeHoras: number | null;
  tentativas: number | null;
  resolvida: boolean;
  ultimoErro?: string | null;
};

type Resposta = {
  contagem?: { operacionais?: number | null; total?: number | null } | number | null;
  quemResolve?: { perfil?: string; euPosso?: boolean; porque?: string };
  linhas?: Linha[];
};

const QUANDO = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function quantasOperacionais(contagem: Resposta["contagem"]): number | null {
  if (typeof contagem === "number") return contagem;
  const valor = contagem?.operacionais;
  return typeof valor === "number" ? valor : null;
}

export function CartasMortasPanel() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  /** `null` = ainda não li. Distinto de "li e deu zero" — ver o vazio abaixo. */
  const [carregando, setCarregando] = useState(true);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [recuperadas, setRecuperadas] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    const sessao = await supabase.auth.getSession();
    const token = sessao.data.session?.access_token || "";
    const resposta = await fetch("/api/v3/dlq", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      // Erro de leitura NÃO vira lista vazia. "Nenhuma carta morta" é uma
      // tranquilidade que não pode ser fabricada por falha de leitura — é o
      // mesmo cuidado que a rota de alertas já paga.
      setErro(corpo?.error?.message || corpo?.error || "Não foi possível ler a fila de mortos agora.");
      setDados(null);
    } else {
      setDados(corpo?.data ?? corpo);
      setErro("");
    }
    setCarregando(false);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function reprocessar(id: string) {
    setOcupada(id);
    const sessao = await supabase.auth.getSession();
    const resposta = await fetch("/api/v3/dlq/retry", {
      method: "POST",
      headers: { Authorization: `Bearer ${sessao.data.session?.access_token || ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: id }),
    });
    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      // A frase do servidor: 403 de alçada, 409 de já resolvida e 422 de evento
      // sem vínculo pedem coisas diferentes de quem lê.
      setErro(corpo?.error?.message || corpo?.error || "Não foi possível reprocessar este item.");
    } else {
      setRecuperadas((atual) => ({ ...atual, [id]: "Reenfileirada. A próxima passagem do worker tenta a entrega de novo." }));
      await carregar();
    }
    setOcupada(null);
  }

  const linhas = (dados?.linhas ?? []).filter((l) => !l.resolvida);
  const podeReprocessar = dados?.quemResolve?.euPosso === true;
  const operacionais = quantasOperacionais(dados?.contagem);

  return (
    <section className="cc6-panel space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="cc6-eyebrow">Entregas que não aconteceram</p>
        {operacionais !== null ? <span className="cc6-num text-numero">{operacionais}</span> : null}
      </div>

      {erro ? (
        <p className="text-sm leading-6 text-[var(--atlas-texto-medio)]">{erro}</p>
      ) : carregando ? (
        <p className="text-sm leading-6 text-[var(--atlas-texto-fraco)]">Lendo a fila de mortos…</p>
      ) : linhas.length === 0 ? (
        <p className="text-sm leading-6 text-[var(--atlas-texto-medio)]">
          Nenhuma entrega parada. Este vazio foi MEDIDO — a leitura respondeu e não havia carta morta aberta.
        </p>
      ) : (
        <ul className="space-y-2">
          {linhas.map((linha) => (
            <li key={linha.id} className="cc6-panel-quiet space-y-1 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="cc6-chip">{linha.topico}</span>
                <span className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]">
                  {linha.criadaEm ? QUANDO.format(new Date(linha.criadaEm)) : "sem data"}
                  {typeof linha.tentativas === "number" ? ` · ${linha.tentativas} tentativa(s)` : ""}
                </span>
              </div>
              {linha.ultimoErro ? (
                <p className="text-sm leading-6 text-[var(--atlas-texto-medio)]">{linha.ultimoErro}</p>
              ) : null}
              {recuperadas[linha.id] ? (
                <p className="text-sm leading-6 text-[var(--atlas-texto-medio)]">{recuperadas[linha.id]}</p>
              ) : podeReprocessar ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={ocupada === linha.id}
                    onClick={() => void reprocessar(linha.id)}
                    className="cc6-ghost-btn disabled:opacity-40"
                  >
                    {ocupada === linha.id ? "Reenfileirando…" : "Reprocessar"}
                  </button>
                </div>
              ) : (
                <p className="text-rotulo text-[var(--atlas-texto-fraco)]">
                  {dados?.quemResolve?.porque ?? "Reprocessar é decisão da diretoria."}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
