"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ACOES, PRAZOS, type ChaveDeAcao, type ChaveDePrazo } from "@/lib/crm/next-action";

/**
 * MARCAR A PRÓXIMA AÇÃO SEM SAIR DA FILA.
 *
 * Na base, 208 de 217 leads não tinham próxima ação — porque só havia dois
 * caminhos para gravá-la, ambos caros: agendar uma visita ao imóvel, ou abrir a
 * ficha e submeter o formulário inteiro. Quem só queria dizer "ligo terça" não
 * tinha onde clicar.
 *
 * ── AS ESCOLHAS DE DESENHO ──────────────────────────────────────────────────
 *
 * **Dois cliques, não um.** O quê e o quando. Um clique só exigiria adivinhar
 * um dos dois, e "Follow-up daqui a 3 dias" sem dizer o que fazer é o lembrete
 * que a pessoa ignora ao receber.
 *
 * **Três prazos e cinco ações.** Não é preguiça de cobrir mais casos: menu
 * longo obriga a escolher, e escolher é o custo que fez os 208 ficarem vazios.
 * Quem precisa de data exata continua tendo a agenda e a ficha.
 *
 * **Fechado por padrão.** Numa fila de 25 leads, 25 blocos de botões abertos
 * são mais ruído do que a fila inteira. Abre quando a pessoa pede.
 */
export function NextActionQuickSet({
  leadId,
  proximaAcaoEm,
  descricaoAtual,
  aoMarcar,
}: {
  leadId: string;
  proximaAcaoEm?: string | null;
  descricaoAtual?: string | null;
  aoMarcar?: (quando: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [acao, setAcao] = useState<ChaveDeAcao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function gravar(corpo: Record<string, unknown>) {
    setSalvando(true);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const r = await fetch(`/api/v1/leads/${leadId}/next-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session?.access_token || ""}` },
        body: JSON.stringify(corpo),
      });
      const b = await r.json();
      if (!r.ok) {
        setResultado(b?.error?.message || "Não foi possível marcar.");
        return;
      }
      const quando = b?.data?.proximaAcaoEm ?? null;
      setResultado(quando
        ? `✓ ${new Date(quando).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
        : "✓ próxima ação removida");
      setAberto(false);
      setAcao(null);
      aoMarcar?.(quando);
    } catch {
      setResultado("Falha de rede.");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <div className="atlas-proxima-acao">
        <button type="button" onClick={() => { setAberto(true); setResultado(null); }} disabled={salvando}>
          {proximaAcaoEm ? "🗓️ Remarcar" : "🗓️ Marcar próxima ação"}
        </button>
        {proximaAcaoEm && !resultado ? (
          <span className="atlas-proxima-acao-atual">
            {descricaoAtual || "Follow-up"} ·{" "}
            {new Date(proximaAcaoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : null}
        {resultado ? <span className="atlas-proxima-acao-feito">{resultado}</span> : null}
      </div>
    );
  }

  return (
    <div className="atlas-proxima-acao" data-aberto="true">
      {!acao ? (
        <>
          <span className="atlas-proxima-acao-passo">O que fazer?</span>
          {ACOES.map((a) => (
            <button key={a.chave} type="button" onClick={() => setAcao(a.chave)} disabled={salvando}>
              {a.rotulo}
            </button>
          ))}
        </>
      ) : (
        <>
          <span className="atlas-proxima-acao-passo">Quando?</span>
          {PRAZOS.map((p) => (
            <button
              key={p.chave}
              type="button"
              onClick={() => void gravar({ prazo: p.chave as ChaveDePrazo, acao })}
              disabled={salvando}
            >
              {p.rotulo}
            </button>
          ))}
        </>
      )}
      {/* Limpar existe porque a lead avança, se perde, ou o compromisso cai.
          Sem esta saída a única alternativa seria marcar uma data falsa. */}
      {proximaAcaoEm ? (
        <button type="button" onClick={() => void gravar({ limpar: true })} disabled={salvando} data-secundario="true">
          Limpar
        </button>
      ) : null}
      <button type="button" onClick={() => { setAberto(false); setAcao(null); }} disabled={salvando} data-secundario="true">
        Cancelar
      </button>
    </div>
  );
}

export default NextActionQuickSet;
