import Link from "next/link";

type LeadOperationalBarProps = {
  leadId: string;
  leadName: string;
  phone: string | null;
  nextAction: string;
  risk: string;
  openTasks: number;
  unreadMessages: number;
};

export function LeadOperationalBar({
  leadId,
  leadName,
  phone,
  nextAction,
  risk,
  openTasks,
  unreadMessages,
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
    </aside>
  );
}
