begin;

-- Supabase stopped implicitly exposing newly-created public tables through the
-- Data API. Keep the Atlas contract explicit: browser sessions receive only
-- the read privileges required by active RLS-protected screens, while internal
-- orchestration, audit and reliability tables remain server-only.

revoke all on table
  public.idempotency_keys,
  public.integration_outbox,
  public.dead_letter_events,
  public.feature_flags,
  public.integrations,
  public.automation_rules,
  public.message_templates,
  public.conversations,
  public.messages,
  public.creative_assets,
  public.campaign_events,
  public.approval_requests,
  public.atlas_decisions,
  public.atlas_agent_runs,
  public.digital_twin_snapshots,
  public.atlas_events,
  public.atlas_entities,
  public.atlas_relationships,
  public.atlas_memories,
  public.atlas_simulations,
  public.atlas_recommendations,
  public.atlas_data_products,
  public.atlas_api_clients,
  public.atlas_launch_rooms,
  public.atlas_inventory_reservations,
  public.ai_conversations,
  public.ai_messages,
  public.ai_tool_calls,
  public.ai_usage
from anon, authenticated;

-- These tables are queried through the authenticated tenant client. Their RLS
-- policies continue to define the rows visible to each organization.
grant select on table
  public.integrations,
  public.automation_rules,
  public.message_templates,
  public.conversations,
  public.messages,
  public.creative_assets,
  public.campaign_events,
  public.approval_requests
to authenticated;

-- All writes and all access to operational internals happen on the server
-- after authenticated, role-aware and organization-aware authorization.
grant all on table
  public.idempotency_keys,
  public.integration_outbox,
  public.dead_letter_events,
  public.feature_flags,
  public.integrations,
  public.automation_rules,
  public.message_templates,
  public.conversations,
  public.messages,
  public.creative_assets,
  public.campaign_events,
  public.approval_requests,
  public.atlas_decisions,
  public.atlas_agent_runs,
  public.digital_twin_snapshots,
  public.atlas_events,
  public.atlas_entities,
  public.atlas_relationships,
  public.atlas_memories,
  public.atlas_simulations,
  public.atlas_recommendations,
  public.atlas_data_products,
  public.atlas_api_clients,
  public.atlas_launch_rooms,
  public.atlas_inventory_reservations,
  public.ai_conversations,
  public.ai_messages,
  public.ai_tool_calls,
  public.ai_usage
to service_role;

commit;
