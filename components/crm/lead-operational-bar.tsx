import Link from "next/link";
import type { ReactNode } from "react";

type LeadOperationalBarProps = {
  leadId: string;
  leadName: string;
  phone: string | null;
  nextAction: string;
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
  /** Registrar consentimento Meta — o único campo que faltava em 217 leads. */
  metaConsentSlot?: React.ReactNode;
};

export function LeadOperationalBar({
  leadId,
  leadName,
  phone,
  nextAction,
  risk,
  openTasks,
  unreadMessages,
  firstContactSlot,
  metaConsentSlot,
}: LeadOperationalBarProps) {
  const activities = [
    { label: "Mensagem", href: `/leads/${leadId}/messages`, icon: "↗" },
    { label: "Ligação", href: `/leads/${leadId}/calls`, icon: "◌" },
    { label: "Tarefa", href: `/leads/${leadId}/tasks`, icon: "✓" },
    { label: "Visita", href: `/leads/${leadId}/schedule`, icon: "□" },
    { label: "Nota", href: `/leads/${leadId}/notes`, icon: "+" },
    { label: "Proposta", href: `/leads/${leadId}/simulation`, icon: "◇" },
  ] as const;

  return (
    <aside className="atlas-lead-operational-bar" aria-label="Resumo operacional do lead">
      <div className="atlas-lead-next-action">
        <span>Faça agora</span>
        <strong>{nextAction}</strong>
        <small>
          Risco {risk} · {openTasks} tarefa(s) · {unreadMessages} mensagem(ns)
        </small>
      </div>
      <nav className="atlas-lead-jump-nav" aria-label={`Navegar na ficha de ${leadName}`}>
        <a href="#qualificacao">Qualificação</a>
        <a href="#historico">Histórico</a>
        <a href="#matching">Imóveis</a>
      </nav>
      <nav className="atlas-lead-activity-composer" aria-label={`Registrar atividade para ${leadName}`}>
        <span className="atlas-lead-activity-label">Registrar</span>
        {activities.map((activity) => (
          <Link key={activity.href} href={activity.href} title={`Registrar ${activity.label.toLowerCase()}`}>
            <span aria-hidden="true">{activity.icon}</span>
            {activity.label}
          </Link>
        ))}
      </nav>
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
      <div className="atlas-lead-bar-faixa">{metaConsentSlot}</div>
    </aside>
  );
}
