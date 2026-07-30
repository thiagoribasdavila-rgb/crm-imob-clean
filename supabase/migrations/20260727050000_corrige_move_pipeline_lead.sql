-- ════════════════════════════════════════════════════════════════════════════
-- O KANBAN NÃO MOVIA LEAD NENHUMA
--
-- `move_pipeline_lead` gravava em `public.activities` uma coluna `title` que a
-- tabela NUNCA teve. Toda movimentação falhava com 42703, e a rota traduzia
-- isso como 409 "recusada pela regra do funil" — mensagem que manda o corretor
-- conferir a etapa quando o problema era esquema.
--
-- Colunas reais de activities: id, lead_id, type, description, created_at,
-- organization_id, user_id, metadata, occurred_at.
--
-- O título que se perdia passa a viver dentro de `description`, junto da
-- transição. Nada de informação se perde — só muda de lugar.
--
-- ── POR QUE ESTE ARQUIVO FOI REESCRITO EM 2026-07-29 ────────────────────────
--
-- Até hoje ele tinha ZERO linhas de SQL: só o comentário acima e a frase "Ver a
-- função completa no banco". Isso é pior que migration ausente. Migration
-- ausente falha alto na primeira reconstrução; migration VAZIA finge que o
-- conserto está versionado — e o que o repositório reconstruía era a versão
-- QUEBRADA, a de 20260717190000_phase_33_atomic_pipeline_moves.sql, que insere
-- `title`. Recriar o banco a partir daqui devolvia o defeito inteiro.
--
-- O corpo abaixo é TRANSCRIÇÃO LITERAL do banco de homologação, extraída com
--   select pg_get_functiondef('public.move_pipeline_lead(uuid,uuid,uuid,text,text,text,uuid)'::regprocedure);
-- em 2026-07-29. md5 do texto devolvido pelo banco: f74259cea71c0633a45b5f6bb9ab4e08
-- Nada foi "melhorado" na passagem: melhorar sem medir é como o defeito nasceu.
--
-- ── DEPENDÊNCIAS, CONFERIDAS UMA A UMA ─────────────────────────────────────
--
-- Tudo o que o corpo toca é criado por migration ANTERIOR a esta:
--   public.activities            → 20260711030000 (base) + 20260716210000
--                                  (organization_id, user_id, metadata, occurred_at)
--   public.atlas_events          → 20260711150000
--   public.pipeline_stage_moves  → 20260717190000
--   public.leads.assigned_to/updated_at → 20260717213001 (bridge)
--   public.profiles.commercial_role/reports_to → 20260716212459
-- Nenhuma outra função é chamada. Nenhum tipo customizado é usado.
--
-- `security definer` + `search_path` vazio são do vivo, não enfeite: com
-- search_path vazio todo nome PRECISA de esquema, e é por isso que cada
-- referência abaixo vem qualificada.
--
-- O revoke/grant no fim reproduz o ACL medido no vivo
-- ({postgres=X/postgres,service_role=X/postgres}). `create or replace` preserva
-- ACL existente, mas numa reconstrução a função nasce com execute para public —
-- sem estas duas linhas, o rebuild abre a RPC para `anon`.
-- ════════════════════════════════════════════════════════════════════════════

begin;

CREATE OR REPLACE FUNCTION public.move_pipeline_lead(p_actor_id uuid, p_organization_id uuid, p_lead_id uuid, p_to_stage text, p_expected_from_stage text, p_reason text DEFAULT NULL::text, p_reversal_of uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare lead_row public.leads%rowtype; actor_role text; allowed boolean:=false; move_id uuid; original public.pipeline_stage_moves%rowtype; latest_id uuid; now_at timestamptz:=now();
begin
  if p_to_stage not in ('novo','contato','qualificacao','visita','proposta','contrato','ganho','perdido','comprou_outro') then raise exception 'pipeline_stage_invalid'; end if;
  select coalesce(commercial_role,case when role='admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
  select * into lead_row from public.leads where id=p_lead_id and organization_id=p_organization_id for update;
  if lead_row.id is null or actor_role is null then raise exception 'pipeline_lead_not_found'; end if;
  if actor_role='director' or lead_row.assigned_to=p_actor_id then allowed:=true; else with recursive team as (select id from public.profiles where reports_to=p_actor_id and organization_id=p_organization_id and active=true union all select p.id from public.profiles p join team t on p.reports_to=t.id where p.organization_id=p_organization_id and p.active=true) select exists(select 1 from team where id=lead_row.assigned_to) into allowed; end if;
  if actor_role='manager' then select exists(select 1 from public.profiles where id=lead_row.assigned_to and reports_to=p_actor_id and organization_id=p_organization_id and active=true) into allowed; end if;
  if not allowed then raise exception 'pipeline_move_out_of_scope'; end if;
  if coalesce(lead_row.status,'novo')<>p_expected_from_stage then raise exception 'pipeline_stage_conflict'; end if;
  if p_to_stage='comprou_outro' and char_length(trim(coalesce(p_reason,'')))<10 then raise exception 'pipeline_buyer_reason_required'; end if;
  if p_reversal_of is not null then
    select * into original from public.pipeline_stage_moves where id=p_reversal_of and organization_id=p_organization_id and lead_id=p_lead_id;
    if original.id is null or original.reversal_of is not null or original.to_stage<>p_expected_from_stage or original.from_stage<>p_to_stage then raise exception 'pipeline_undo_invalid'; end if;
    if exists(select 1 from public.pipeline_stage_moves where reversal_of=original.id) then raise exception 'pipeline_already_reversed'; end if;
    select id into latest_id from public.pipeline_stage_moves where organization_id=p_organization_id and lead_id=p_lead_id order by occurred_at desc,id desc limit 1;
    if latest_id is distinct from original.id then raise exception 'pipeline_undo_stale'; end if;
  end if;
  insert into public.pipeline_stage_moves(organization_id,lead_id,actor_id,from_stage,to_stage,reason,reversal_of,occurred_at) values(p_organization_id,p_lead_id,p_actor_id,p_expected_from_stage,p_to_stage,nullif(left(trim(coalesce(p_reason,'')),4000),''),p_reversal_of,now_at) returning id into move_id;
  update public.leads set status=p_to_stage,updated_at=now_at where id=p_lead_id and organization_id=p_organization_id;
  -- SEM `title`: a tabela nao tem essa coluna. O texto vai para description.
  insert into public.activities(organization_id,lead_id,user_id,type,description,metadata,occurred_at)
  values(p_organization_id,p_lead_id,p_actor_id,
    case when p_reversal_of is null then 'pipeline_stage_changed' else 'pipeline_stage_reverted' end,
    case when p_reversal_of is not null then 'Movimentacao desfeita: '||p_expected_from_stage||' → '||p_to_stage
         when p_to_stage='comprou_outro' then 'Comprou em outro lugar. '||trim(coalesce(p_reason,''))
         else 'Etapa alterada: '||p_expected_from_stage||' → '||p_to_stage end,
    jsonb_build_object('moveId',move_id,'fromStage',p_expected_from_stage,'toStage',p_to_stage,'reversalOf',p_reversal_of),
    now_at);
  insert into public.atlas_events(organization_id,event_type,source,aggregate_type,aggregate_id,payload,correlation_id,causation_id,occurred_at) values(p_organization_id,case when p_reversal_of is null then 'lead.stage_changed' else 'lead.stage_reverted' end,'atlas-v1','lead',p_lead_id,jsonb_build_object('moveId',move_id,'previousStage',p_expected_from_stage,'stage',p_to_stage,'userId',p_actor_id),move_id::text,p_reversal_of,now_at);
  return jsonb_build_object('moveId',move_id,'leadId',p_lead_id,'previousStage',p_expected_from_stage,'stage',p_to_stage,'occurredAt',now_at,'reversalOf',p_reversal_of);
end $function$;

revoke all on function public.move_pipeline_lead(uuid,uuid,uuid,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.move_pipeline_lead(uuid,uuid,uuid,text,text,text,uuid) to service_role;

commit;
