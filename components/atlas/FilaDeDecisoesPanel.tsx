"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * AS DECISÕES QUE A IA JÁ TOMOU — e que, até aqui, ninguém via.
 *
 * ── O que foi medido ───────────────────────────────────────────────────────
 *
 * Em 01/08/2026, `ai_shadow_decisions` tinha 20 redistribuições preparadas pelo
 * agente de SLA, todas `retido=true`, `executado=false`, `decisao_humana=null`.
 * Nenhum arquivo sob `app/` ou `components/` lia a tabela. As funções que
 * fechariam o ciclo existiam sem um único chamador.
 *
 * Este painel é a porta que faltava. Ele não decide nada: mostra o que a IA
 * decidiria, por quê, e coleta o julgamento humano — que é a evidência sem a
 * qual o modo sombra nunca sai da sombra.
 *
 * ── As três frases que este painel nunca deixa de dizer ────────────────────
 *
 * 1. **Falha de leitura não vira "nada pendente".** Fila vazia é tranquilidade;
 *    fabricá-la a partir de um erro de rede é a mentira mais cara possível aqui.
 * 2. **Aprovar MUDA O MUNDO.** O rótulo diz o que vai acontecer com a lead, não
 *    "confirmar". Botão que esconde a consequência é armadilha.
 * 3. **O que não pode ser decidido diz por quê**, em vez de sumir ou de ficar
 *    cinza sem explicação.
 */

type Decisao = {
  id: string;
  agente: string;
  acao: string;
  frase: string;
  porque: string;
  leadId: string | null;
  paraQuemRotulo: string;
  atrasoHoras: number | null;
  podeDecidir: boolean;
  porqueNaoPode: string | null;
};

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; decisoes: Decisao[]; decidiveis: number; travadas: number };

export function FilaDeDecisoesPanel() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [gravando, setGravando] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/v1/crm/decisoes-pendentes", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        // A mensagem do servidor é preservada porque ela distingue "não consegui
        // ler" de "não há nada" — e as duas mandam a pessoa fazer coisas opostas.
        setEstado({ fase: "erro", mensagem: j?.error?.message || "Não foi possível ler a fila de decisões." });
        return;
      }
      setEstado({
        fase: "pronto",
        decisoes: j.data.decisoes ?? [],
        decidiveis: j.data.decidiveis ?? 0,
        travadas: j.data.travadas ?? 0,
      });
    } catch {
      setEstado({
        fase: "erro",
        mensagem: "Não foi possível falar com o servidor. A fila NÃO está vazia — ela não pôde ser lida.",
      });
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const decidir = async (d: Decisao, decisao: "aprovada" | "recusada") => {
    setGravando(d.id);
    setRecado(null);
    try {
      const r = await fetch("/api/v1/crm/decisoes-pendentes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ registroId: d.id, decisao }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        setRecado(j?.error?.message || "Não foi possível registrar a decisão.");
        return;
      }
      setRecado(
        decisao === "aprovada"
          ? `Feito: ${j.data.frase} A lead já está com o novo responsável.`
          : "Recusa registrada. A lead continua com o dono atual.",
      );
      await carregar();
    } finally {
      setGravando(null);
    }
  };

  return (
    <div className="atlas-panel atlas-fila-decisoes">
      <header className="atlas-fila-decisoes-topo">
        <h2>
          <span aria-hidden="true">🧠</span> Decisões que a IA preparou
        </h2>
        {estado.fase === "pronto" ? (
          <span className="atlas-fila-decisoes-contagem">
            {estado.decidiveis} para decidir
            {estado.travadas > 0 ? ` · ${estado.travadas} travada${estado.travadas > 1 ? "s" : ""}` : ""}
          </span>
        ) : null}
      </header>

      {estado.fase === "carregando" ? (
        <p className="atlas-fila-decisoes-vazio">Lendo a fila…</p>
      ) : null}

      {estado.fase === "erro" ? (
        <p className="atlas-fila-decisoes-erro">
          <span aria-hidden="true">⚠️</span> {estado.mensagem}{" "}
          <button type="button" className="atlas-fila-decisoes-retry" onClick={() => void carregar()}>
            tentar de novo
          </button>
        </p>
      ) : null}

      {recado ? <p className="atlas-fila-decisoes-recado">{recado}</p> : null}

      {estado.fase === "pronto" && estado.decisoes.length === 0 ? (
        <p className="atlas-fila-decisoes-vazio">
          <span aria-hidden="true">✅</span> Nenhuma decisão esperando por você. A IA não tem nada a propor agora
          — isto foi <strong>lido</strong>, não presumido.
        </p>
      ) : null}

      {estado.fase === "pronto" && estado.decisoes.length > 0 ? (
        <ul className="atlas-fila-decisoes-lista">
          {estado.decisoes.map((d) => (
            <li key={d.id} className="atlas-fila-decisao" data-travada={d.podeDecidir ? undefined : "true"}>
              <span className="atlas-fila-decisao-faixa" aria-hidden="true" />
              <div className="atlas-fila-decisao-corpo">
                <p className="atlas-fila-decisao-frase">{d.frase}</p>
                {d.porque ? <p className="atlas-fila-decisao-porque">{d.porque}</p> : null}
                <p className="atlas-fila-decisao-meta">
                  <span aria-hidden="true">🤖</span> {d.agente}
                  {d.atrasoHoras !== null ? (
                    <>
                      {" · "}
                      <span aria-hidden="true">⏱️</span> {d.atrasoHoras.toLocaleString("pt-BR")}h sem primeiro contato
                    </>
                  ) : null}
                </p>
              </div>

              {d.podeDecidir ? (
                <div className="atlas-fila-decisao-acoes">
                  <button
                    type="button"
                    className="atlas-fila-decisao-sim"
                    disabled={gravando === d.id}
                    onClick={() => void decidir(d, "aprovada")}
                  >
                    {/* O rótulo diz o que ACONTECE, não "confirmar". */}
                    <span aria-hidden="true">✅</span> Passar para {d.paraQuemRotulo}
                  </button>
                  <button
                    type="button"
                    className="atlas-fila-decisao-nao"
                    disabled={gravando === d.id}
                    onClick={() => void decidir(d, "recusada")}
                  >
                    Manter como está
                  </button>
                </div>
              ) : (
                <p className="atlas-fila-decisao-travada">{d.porqueNaoPode}</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
