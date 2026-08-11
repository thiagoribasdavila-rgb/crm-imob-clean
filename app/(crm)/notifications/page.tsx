import {
  NotificationsFeedback,
  NotificationsGovernance,
  NotificationsMetrics,
  NotificationsPriority,
  NotificationsProvider,
  NotificationsRealtimeStatus,
  NotificationsRefreshAction,
  NotificationsWorkspace,
} from "@/components/atlas/notifications-v3000-surface";
import { V3000PageTemplate } from "@/components/atlas/v3000-page-template";

export default function NotificationsPage() {
  return (
    <NotificationsProvider>
      <V3000PageTemplate
        eyebrow="Caixa pessoal em tempo real"
        title="Antecipe o que precisa de ação"
        description="Alertas pessoais atualizados sem recarregar, sem mensagens automáticas ao cliente."
        decision="Resolva primeiro os prazos vencidos e proteja as oportunidades em andamento."
        action={{ href: "/tasks", label: "Abrir agenda de tarefas" }}
        feedback={<NotificationsFeedback />}
        metrics={{
          label: "Sinais da sua operação",
          primary: <NotificationsMetrics />,
        }}
        priority={{
          title: "Vencidas primeiro",
          description: "Lembretes que pedem decisão antes da próxima atividade.",
          content: <NotificationsPriority />,
        }}
        workspace={{
          eyebrow: "Caixa operacional",
          title: "Lembretes que pedem decisão",
          description: "Abra a oportunidade, registre a decisão e mantenha o próximo passo visível.",
          action: <NotificationsRefreshAction />,
          content: <NotificationsWorkspace />,
          density: "compact",
        }}
        aside={<NotificationsRealtimeStatus />}
        asideLabel="Estado da atualização da caixa"
        analysis={{
          label: "Como esta caixa protege a operação",
          group: "v3000-notifications-governance",
          content: <NotificationsGovernance />,
        }}
      />
    </NotificationsProvider>
  );
}
