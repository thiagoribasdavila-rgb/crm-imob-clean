"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ACOES,
  PRAZOS,
  lerRespostaDaMarcacao,
  type ChaveDeAcao,
  type ChaveDePrazo,
} from "@/lib/crm/next-action";

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
 *
 * ── UM ESCRITOR, TRÊS SUPERFÍCIES ───────────────────────────────────────────
 *
 * Este componente nasceu montado num lugar só: o CARTÃO MOBILE da lista de
 * leads, dentro de `.atlas-leads-mobile` — que o CSS esconde a partir de
 * 1180px. Ou seja: no monitor onde o corretor passa o dia, o botão não existia.
 * Medido em produção depois de meses no ar: das 67 leads ABERTAS, ZERO tinham
 * próxima ação (as 5 marcadas da base inteira são leads já perdidas).
 *
 * Eu havia reportado esse "5 de 490" como comportamento da operação. Era
 * defeito de produto — o corretor não agendava porque não havia onde clicar.
 *
 * A correção é montar o MESMO componente na tabela desktop e no cartão do
 * Kanban, nunca escrever um segundo botão que fale com a mesma coluna: dois
 * escritores para `next_action_at` seriam duas verdades sobre o mesmo
 * compromisso, e é assim que os caminhos divergem sem ninguém notar.
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
  /**
   * Recebe o que o SERVIDOR confirmou, não o que a tela pediu. `quando` vem
   * `null` quando a próxima ação foi LIMPA — quem recebe precisa gravar esse
   * `null`, e não cair de volta no valor antigo.
   */
  aoMarcar?: (quando: string | null, descricao: string | null) => void;
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
      // Resposta sem JSON (502 do proxy devolve HTML) não pode estourar no
      // parser: a pessoa veria a exceção no lugar do que aconteceu.
      const b = await r.json().catch(() => null);
      /* A leitura é PURA e mora em lib/crm/next-action.ts: ela recusa o
         `response.ok` que não vem acompanhado do eco do que ficou gravado.
         Sem isso, um 200 sem linha afetada — o caso silencioso do PostgREST —
         desenharia "✓ terça, 14h30" numa lead que continua sem compromisso. */
      const leitura = lerRespostaDaMarcacao(corpo.limpar ? "limpar" : "marcar", r.ok, b);
      if (!leitura.confirmado) {
        setResultado(leitura.motivo);
        return;
      }
      setResultado(leitura.quando
        ? `✓ ${new Date(leitura.quando).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
        : "✓ próxima ação removida");
      setAberto(false);
      setAcao(null);
      aoMarcar?.(leitura.quando, leitura.descricao);
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
