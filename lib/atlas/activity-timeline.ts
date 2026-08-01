export type ActivityCategory =
  | "change"
  | "contact"
  | "transfer"
  | "ai"
  | "proposal"
  | "external";

const proposalTypes = new Set([
  "commercial_simulation",
  "commercial_proposal_decision",
  "commercial_proposal_lifecycle",
  "property_presentation",
  "property_feedback",
  "proposal",
]);

const aiTypes = new Set([
  "ai",
  "ai_qualification",
  "experience_alert",
  "qualification",
  "score_recalibrated",
]);

const contactTypes = new Set([
  "call",
  "email",
  "message",
  "note",
  "meeting",
  "visit",
  "whatsapp_opt_out",
  "nightly_journey_reply",
]);

const transferTypes = new Set([
  "lead_transfer",
  "owner_changed",
  "assignment_changed",
  "broker_changed",
]);

const externalTypes = new Set([
  "campaign_event",
  "external_sale",
  "webhook",
  "lead_imported",
]);

export function activityCategoryForType(value: unknown): ActivityCategory {
  const type = String(value || "system").trim().toLowerCase();
  if (proposalTypes.has(type) || type.includes("proposal") || type.includes("simulation")) return "proposal";
  if (aiTypes.has(type) || type.startsWith("ai_")) return "ai";
  if (contactTypes.has(type) || type.includes("message") || type.includes("contact")) return "contact";
  if (transferTypes.has(type) || type.includes("transfer") || type.includes("assignment")) return "transfer";
  if (externalTypes.has(type) || type.startsWith("campaign_") || type.startsWith("external_")) return "external";
  return "change";
}

export const activityCategoryLabels: Record<ActivityCategory, string> = {
  change: "Movimentação",
  contact: "Contato",
  transfer: "Transferência",
  ai: "Inteligência",
  proposal: "Proposta",
  external: "Integração",
};
