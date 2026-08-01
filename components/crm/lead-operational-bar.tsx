import Link from "next/link";
import type { ReactNode } from "react";
import { caminhoDoGesto, type ProximaAcao } from "@/lib/crm/gesto-da-proxima-acao";

type LeadOperationalBarProps = {
  leadId: string;
  leadName: string;
  phone: string | null;
  /**
   * A instrução E o gesto que a executa, inteiros, vindos do módulo puro
   * `lib/crm/gesto-da-proxima-acao`. Esta barra desenha; não decide.
   *
   * Era `nextAction: string` — uma frase solta, sem nada para clicar.
   */
  proximaAcao: ProximaAcao;
  risk: string;
  openTasks: number;
  unreadMessages: number;
  /**
   * Registro de primeiro contato. Entra aqui, e não numa seção mais abaixo, por
   * um motivo operacional: esta barra é sticky. Se o registro sair de vista
   * quando o corretor rola a ficha, ele não é registrado — e é a única ação que
   * alimenta a métrica de tempo de resposta.
   */
  firstContactSlot?: ReactNode;
};

export function LeadOperationalBar({
  leadId,
  leadName,
  phone,
  proximaAcao,
  risk,
  openTasks,
  unreadMessages,
  firstContactSlot,
}: LeadOperationalBarProps) {
  

  const destinoDoGesto = caminhoDoGesto(leadId, proximaAcao);

  return (
    <aside className="atlas-lead-operational-bar" aria-label="Resumo operacional do lead">
      {/* ── A INSTRUÇÃO E O GESTO NO MESMO LUGAR ──────────────────────────
          Antes: três elementos de texto e ZERO botões. O corretor lia a frase,
          traduzia para um gesto e saía procurando onde executar — as ações
          existiam do outro lado desta mesma barra, sem ligação com a instrução.

          O gesto vem PRIMEIRO (é o que se faz); a frase fica abaixo explicando
          por quê. UM gesto só: dois devolveriam ao corretor a decisão que este
          bloco existe para tomar por ele. */}
      <div className="atlas-lead-next-action" data-urgente={proximaAcao.urgente ? "true" : undefined}>
        <span>Faça agora</span>
        {destinoDoGesto ? (
          <Link href={destinoDoGesto} className="atlas-lead-gesto">
            {proximaAcao.gesto.rotulo}
          </Link>
        ) : proximaAcao.gesto.tipo === "ligar" && phone ? (
          <a href={`tel:${phone}`} className="atlas-lead-gesto">
            {proximaAcao.gesto.rotulo}
          </a>
        ) : proximaAcao.gesto.tipo === "ligar" ? (
          /* Sem telefone não há para onde ligar. Botão desabilitado que DIZ o
             motivo, em vez de link morto que não reage ao clique. */
          <button type="button" className="atlas-lead-gesto" disabled>
            Sem telefone cadastrado
          </button>
        ) : (
          <button type="button" className="atlas-lead-gesto" onClick={() => window.location.reload()}>
            {proximaAcao.gesto.rotulo}
          </button>
        )}
        <strong>{proximaAcao.instrucao}</strong>
        <small>
          Risco {risk} · {openTasks} tarefa(s) · {unreadMessages} mensagem(ns)
        </small>
      </div>
      <nav className="atlas-lead-jump-nav" aria-label={`Navegar na ficha de ${leadName}`}>
        <a href="#qualificacao">Qualificação</a>
        <a href="#historico">Histórico</a>
        <a href="#matching">Imóveis</a>
      </nav>
      {/* ── O COMPOSITOR DE ATIVIDADES SAIU DAQUI ─────────────────────────
            MEDIDO: 44px e 6 links — Mensagem, Ligação, Tarefa, Visita, Nota,
            Proposta — repetindo o que o formulário "Acompanhamento do contato"
            faz logo abaixo, agora a uma tela de distância em vez de três.

            Duas portas para a mesma coisa, na mesma tela, não é conveniência: é
            o corretor tendo que escolher qual usar, e o produto tendo que manter
            as duas em pé. A barra fica com o que só ela tem — o gesto do momento
            e as ações de contato imediato. */}
      <div className="atlas-lead-operational-actions">
        {phone ? (
          <a href={`tel:${phone}`} className="atlas-button-secondary">
            Ligar
          </a>
        ) : null}
        <Link href={`/leads/${leadId}/messages`} className="atlas-button-primary">
          {unreadMessages ? `Responder (${unreadMessages})` : "Mensagem"}
        </Link>
      </div>
      {/* ── POR QUE ESTES BLOCOS FICAM NUMA FAIXA PRÓPRIA ──────────────────
          A barra é um grid de TRÊS colunas (minmax(0,1fr) auto auto). Slots
          soltos como filhos extras caem nas trilhas `auto`, que são estreitas
          — o resultado foi o aviso de primeiro contato espremido a uma palavra
          por linha, com o painel de consentimento por cima.
          `grid-column: 1 / -1` devolve a linha inteira a eles. */}
      <div className="atlas-lead-bar-faixa">{firstContactSlot}</div>
      {/* Consentimento fica JUNTO das ações, não numa aba de configuração:
          é o corretor que ouve a resposta do cliente, e é aqui que ele está. */}
      {/* ── O CONSENTIMENTO SAIU DAQUI ────────────────────────────────────
          MEDIDO na produção: a faixa ocupava 63px DENTRO desta barra, que é
          `position: sticky; top: 82px; z-index: 20`. Ou seja, ficava colada no
          topo da tela em toda lead que ainda não tinha resposta — e o próprio
          texto dizia "Enquanto você não responder…".

          Perguntar é certo: consentimento é LGPD e alimenta a CAPI. Perguntar
          NO TOPO GRUDENTO, para sempre, até alguém responder, é cobrar com o
          espaço de trabalho da pessoa.

          Ele desce para o fluxo da página, junto do resto do contexto da lead.
          Continua visível; para de bloquear. */}
    </aside>
  );
}
