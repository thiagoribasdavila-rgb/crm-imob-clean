export type WhatsAppConversationContinuityRow = {
  id: string;
  lead_id: string | null;
  assigned_to: string | null;
  status: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  created_at: string | null;
};

export type WhatsAppLeadOwnershipRow = {
  id: string;
  assigned_to: string | null;
};

const percent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1_000) / 10 : 0;

const validDate = (value: string | null) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export function buildWhatsAppConversationContinuity(input: {
  conversations: WhatsAppConversationContinuityRow[];
  leads: WhatsAppLeadOwnershipRow[];
  sourceTotal?: number;
  observedLimit?: number;
  now?: string;
  recentDays?: number;
  staleDays?: number;
}) {
  const conversations = input.conversations ?? [];
  const leads = new Map((input.leads ?? []).map((lead) => [lead.id, lead]));
  const now = validDate(input.now ?? new Date().toISOString()) ?? Date.now();
  const recentDays = Math.max(1, Math.trunc(input.recentDays ?? 7));
  const staleDays = Math.max(recentDays, Math.trunc(input.staleDays ?? 30));
  const recentThreshold = recentDays * 86_400_000;
  const staleThreshold = staleDays * 86_400_000;

  let linked = 0;
  let unlinked = 0;
  let alignedOwner = 0;
  let ownerMismatch = 0;
  let conversationOwnerMissing = 0;
  let leadOwnerMissing = 0;
  let bothUnassigned = 0;
  let missingLeadRecord = 0;
  let ownershipComparable = 0;
  let activeWithinRecentWindow = 0;
  let withoutRecentActivity = 0;
  let stale = 0;
  let noActivityDate = 0;
  let unread = 0;
  let open = 0;
  const conversationsByLead = new Map<string, number>();

  for (const conversation of conversations) {
    if (conversation.unread_count && conversation.unread_count > 0) unread += 1;
    if (conversation.status === "open" || conversation.status === "pending") open += 1;

    const activityAt = validDate(
      conversation.last_message_at ?? conversation.created_at,
    );
    if (activityAt === null) {
      noActivityDate += 1;
    } else {
      const age = Math.max(0, now - activityAt);
      if (age <= recentThreshold) activeWithinRecentWindow += 1;
      else withoutRecentActivity += 1;
      if (age > staleThreshold) stale += 1;
    }

    if (!conversation.lead_id) {
      unlinked += 1;
      continue;
    }

    linked += 1;
    conversationsByLead.set(
      conversation.lead_id,
      (conversationsByLead.get(conversation.lead_id) ?? 0) + 1,
    );
    const lead = leads.get(conversation.lead_id);
    if (!lead) {
      missingLeadRecord += 1;
      continue;
    }
    if (conversation.assigned_to && lead.assigned_to) {
      ownershipComparable += 1;
      if (conversation.assigned_to === lead.assigned_to) alignedOwner += 1;
      else ownerMismatch += 1;
    } else if (!conversation.assigned_to && lead.assigned_to) {
      conversationOwnerMissing += 1;
    } else if (conversation.assigned_to && !lead.assigned_to) {
      leadOwnerMissing += 1;
    } else {
      bothUnassigned += 1;
    }
  }

  const leadsWithMultipleConversations = [...conversationsByLead.values()].filter(
    (total) => total > 1,
  ).length;
  const extraConversations = [...conversationsByLead.values()].reduce(
    (total, amount) => total + Math.max(0, amount - 1),
    0,
  );
  const sourceTotal = Math.max(
    conversations.length,
    Math.trunc(input.sourceTotal ?? conversations.length),
  );

  return {
    scope: "authenticated_organization" as const,
    containsPii: false,
    evidenceState: "measured" as const,
    source: {
      total: sourceTotal,
      observed: conversations.length,
      observedLimit: Math.max(
        conversations.length,
        Math.trunc(input.observedLimit ?? conversations.length),
      ),
      truncated: sourceTotal > conversations.length,
    },
    ownership: {
      linked,
      unlinked,
      ownershipComparable,
      alignedOwner,
      ownerMismatch,
      conversationOwnerMissing,
      leadOwnerMissing,
      bothUnassigned,
      missingLeadRecord,
      alignmentRate: percent(alignedOwner, ownershipComparable),
    },
    continuity: {
      recentDays,
      staleDays,
      activeWithinRecentWindow,
      withoutRecentActivity,
      stale,
      noActivityDate,
      unread,
      open,
    },
    fragmentation: {
      uniqueLinkedLeads: conversationsByLead.size,
      leadsWithMultipleConversations,
      extraConversations,
    },
    measuredAt: new Date(now).toISOString(),
    limitations: [
      "A medição compara identificadores internos, sem retornar nomes, telefones ou conteúdo.",
      "Divergência de responsável é evidência para revisão humana e não provoca redistribuição automática.",
      "Atividade recente usa a última mensagem registrada ou, na ausência dela, a criação da conversa.",
    ],
  };
}
