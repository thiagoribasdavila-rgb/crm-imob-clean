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
