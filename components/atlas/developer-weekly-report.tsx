"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { anunciarTrabalhoDeIa } from "@/lib/ai/presence";

/**
 * RELATÓRIO SEMANAL DO INCORPORADOR — a tela e o envio.
 *
 * A apuração inteira mora no servidor (`/api/v1/developers/[id]/weekly-report`)
 * e o texto do book vem pronto de lá. Este componente não recalcula nada: se a
 * tela pudesse montar o próprio número, existiriam duas contas para o mesmo
 * relatório e um dia elas discordariam — na frente do parceiro.
 *
 * ── SOBRE O ENVIO ───────────────────────────────────────────────────────────
 *
 * O Atlas **não dispara** o relatório para a incorporadora. Ele prepara: copia
 * para a área de transferência, abre o e-mail com o corpo montado, abre o
 * WhatsApp com o texto. Quem aperta "enviar" é gente.
 *
 * Isso não é limitação técnica, é a mesma fronteira do resto do produto: este
 * documento vai para fora em nome da empresa, e mandar sozinho um relatório com
 * "0% das leads atendidas" para o parceiro que paga a mídia é o tipo de coisa
 * que ninguém quer descobrir depois.
 */

type Empreendimento = {
  developmentId: string;
  nome: string;
  leadsRecebidas: number;
  leadsContatadas: number;
  medianaDeRespostaMin: number | null;
  leadsComSlaVencido: number;
  visitasAgendadas: number;
  propostas: number;
  vendas: number;
  campanhas: string[];
  gasto: number | null;
};

type Relatorio = {
  incorporador: { id: string; nome: string };
  semana: { inicio: string; fim: string; rotulo: string };
  total: {
    leadsRecebidas: number;
    leadsContatadas: number;
    taxaDeAtendimento: number | null;
    leadsComSlaVencido: number;
    visitasAgendadas: number;
    propostas: number;
    vendas: number;
    gasto: number | null;
    cpl: number | null;
  };
  empreendimentos: Empreendimento[];
  variacaoDeLeads: number | null;
  naoMedido: string[];
  resumo: string;
  book: string;
  vazio: boolean;
};

const dinheiro = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O emoji carrega o estado da linha, para a tabela ser lida de relance.
 * Três faixas só: bom, atenção, ruim. Uma escala mais fina viraria enfeite —
 * ninguém distingue "72% é laranja-claro" de "68% é laranja-escuro".
 */
function sinalDeAtendimento(taxa: number | null): { emoji: string; rotulo: string } {
  if (taxa === null) return { emoji: "⚪", rotulo: "sem lead na semana" };
  if (taxa >= 0.8) return { emoji: "🟢", rotulo: "atendimento em dia" };
  if (taxa >= 0.5) return { emoji: "🟡", rotulo: "atendimento parcial" };
  return { emoji: "🔴", rotulo: "atendimento crítico" };
}

export function DeveloperWeeklyReport({
  developerId,
  nome,
  email,
}: {
  developerId: string;
  nome: string;
  email?: string | null;
}) {
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    // O robô do canto acende: a apuração cruza leads, visitas, propostas e
    // gasto de uma semana inteira, e a pessoa merece saber que algo corre.
    const encerrar = anunciarTrabalhoDeIa(`Apurando a semana de ${nome}`);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const r = await fetch(`/api/v1/developers/${developerId}/weekly-report`, {
        headers: { Authorization: `Bearer ${sessao.session?.access_token || ""}` },
      });
      const corpo = await r.json();
      if (r.ok) setRelatorio(corpo.data);
      else setErro(corpo?.error?.message || "Não foi possível apurar a semana.");
    } catch {
      setErro("Falha de rede ao apurar a semana.");
    } finally {
      encerrar();
      setCarregando(false);
    }
  }

  async function copiarBook() {
    if (!relatorio) return;
    try {
      await navigator.clipboard.writeText(relatorio.book);
      setAviso("📋 Book copiado — cole no e-mail, no WhatsApp ou no PDF.");
    } catch {
      // Sem permissão de área de transferência (contexto inseguro, navegador
      // antigo): dizer o que houve, não fingir que copiou.
      setAviso("Não foi possível copiar automaticamente. Selecione o texto abaixo e copie.");
    }
  }

  function abrirEmail() {
    if (!relatorio) return;
    const assunto = `Relatório semanal ${relatorio.incorporador.nome} · ${relatorio.semana.rotulo}`;
    // mailto abre o cliente de e-mail COM o texto pronto. Não envia: o dedo que
    // aperta "enviar" continua sendo o de uma pessoa.
    window.location.href =
      `mailto:${email || ""}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(relatorio.book)}`;
  }

  function abrirWhatsApp() {
    if (!relatorio) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(relatorio.book)}`, "_blank", "noopener");
  }

  if (!relatorio) {
    return (
      <div className="atlas-book-acoes">
        <button type="button" onClick={() => void carregar()} disabled={carregando}>
          {carregando ? "Apurando a semana…" : "📊 Relatório da semana"}
        </button>
        {erro ? <span className="atlas-book-erro">{erro}</span> : null}
      </div>
    );
  }

  const sinal = sinalDeAtendimento(relatorio.total.taxaDeAtendimento);

  return (
    <section className="atlas-book" aria-label={`Relatório semanal de ${nome}`}>
      <header className="atlas-book-head">
        <div>
          <p className="atlas-book-semana">🗓️ Semana de {relatorio.semana.rotulo}</p>
          <p className="atlas-book-resumo">
            {sinal.emoji} {relatorio.resumo}
          </p>
        </div>
        <button type="button" onClick={() => void carregar()} disabled={carregando} title="Reapurar">
          ↻
        </button>
      </header>

      {!relatorio.vazio ? (
        <>
          <div className="atlas-book-numeros">
            <span><strong>{relatorio.total.leadsRecebidas}</strong> leads</span>
            <span><strong>{relatorio.total.leadsContatadas}</strong> atendidas</span>
            {relatorio.total.leadsComSlaVencido ? (
              <span data-alerta="true"><strong>{relatorio.total.leadsComSlaVencido}</strong> fora do prazo</span>
            ) : null}
            <span><strong>{relatorio.total.visitasAgendadas}</strong> visitas</span>
            <span><strong>{relatorio.total.propostas}</strong> propostas</span>
            {relatorio.variacaoDeLeads !== null ? (
              <span>
                {relatorio.variacaoDeLeads >= 0 ? "📈" : "📉"}{" "}
                <strong>{relatorio.variacaoDeLeads >= 0 ? "+" : ""}{Math.round(relatorio.variacaoDeLeads * 100)}%</strong> vs. semana anterior
              </span>
            ) : null}
            {/* Gasto e CPL só aparecem quando MEDIDOS. A ausência é dita lá
                embaixo, em "não medido", e não vira "R$ 0,00" aqui. */}
            {relatorio.total.gasto !== null ? <span>💰 <strong>{dinheiro(relatorio.total.gasto)}</strong></span> : null}
            {relatorio.total.cpl !== null ? <span>CPL <strong>{dinheiro(relatorio.total.cpl)}</strong></span> : null}
          </div>

          <div className="atlas-book-tabela-wrap">
            <table className="atlas-book-tabela">
              <thead>
                <tr>
                  <th scope="col">Empreendimento</th>
                  <th scope="col">Leads</th>
                  <th scope="col">Atendidas</th>
                  <th scope="col">Resposta</th>
                  <th scope="col">Visitas</th>
                  <th scope="col">Propostas</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.empreendimentos.map((e) => {
                  const taxa = e.leadsRecebidas ? e.leadsContatadas / e.leadsRecebidas : null;
                  const s = sinalDeAtendimento(taxa);
                  return (
                    <tr key={e.developmentId}>
                      <th scope="row">
                        <span title={s.rotulo}>{s.emoji}</span> {e.nome}
                        {e.campanhas.length ? (
                          <span className="atlas-book-campanhas">{e.campanhas.join(" · ")}</span>
                        ) : null}
                      </th>
                      <td className="cc23-num">{e.leadsRecebidas}</td>
                      <td className="cc23-num">
                        {e.leadsContatadas}
                        {/* Parênteses, e não só espaçamento por CSS: "0" seguido
                            de "0%" com margem visual vira "00%" quando alguém
                            copia a tabela para uma planilha ou lê por leitor de
                            tela. A tabela vai para dentro de um relatório de
                            parceiro — ambiguidade aqui vira erro lá. */}
                        {taxa !== null ? <span className="atlas-book-pct">({Math.round(taxa * 100)}%)</span> : null}
                      </td>
                      <td className="cc23-num">
                        {/* Traço, e não "0 min": zero minuto de resposta seria
                            atendimento instantâneo, o oposto do que houve. */}
                        {e.medianaDeRespostaMin !== null ? `${e.medianaDeRespostaMin} min` : "—"}
                      </td>
                      <td className="cc23-num">{e.visitasAgendadas}</td>
                      <td className="cc23-num">{e.propostas}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {relatorio.naoMedido.length ? (
        <div className="atlas-book-ressalva">
          <p>⚠️ O que não foi medido nesta semana</p>
          {relatorio.naoMedido.map((linha) => <p key={linha}>{linha}</p>)}
        </div>
      ) : null}

      <details className="atlas-book-texto">
        <summary>📄 Ver o book de envio</summary>
        <pre>{relatorio.book}</pre>
      </details>

      <div className="atlas-book-acoes">
        <button type="button" onClick={() => void copiarBook()}>📋 Copiar book</button>
        <button type="button" onClick={abrirEmail}>✉️ Abrir e-mail{email ? ` para ${email}` : ""}</button>
        <button type="button" onClick={abrirWhatsApp}>💬 Abrir WhatsApp</button>
        {aviso ? <span className="atlas-book-aviso">{aviso}</span> : null}
      </div>
      <p className="atlas-book-rodape">
        O Atlas prepara o envio; quem envia é você. Nada sai daqui para o parceiro sem uma pessoa apertar enviar.
      </p>
    </section>
  );
}

export default DeveloperWeeklyReport;
