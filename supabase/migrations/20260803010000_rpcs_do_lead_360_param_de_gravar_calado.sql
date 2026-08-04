-- AS RPCs DO LEAD 360 QUE NUNCA GRAVARAM UMA LINHA.
--
-- ── Medido em 02/08/2026, no banco de produção (pozbrcsfthnhmnebfoxv) ───────
--
-- `activities` tem 481 linhas. TODAS de um único `type`:
--
--   select type, count(*) from activities group by type;
--   → pipeline_stage_changed | 481
--
-- `move_pipeline_lead` é a única função que já foi corrigida para NÃO mandar
-- `title` (a coluna nunca existiu). É também a única que gravou alguma coisa.
-- As outras nove funções que escrevem em `activities` mandam `title` até hoje,
-- e por isso somam ZERO linhas — não porque ninguém as usou, mas porque toda
-- chamada estoura em 42703 e derruba a transação inteira.
--
-- Varredura que encontrou a classe (só SELECT, sobre pg_proc + information_schema):
--
--   insert into public.<tabela>(<colunas>) onde a coluna NÃO existe
--   → accept_lead_assignment            activities.title
--   → transfer_single_lead              activities.title  +  tasks.assigned_to
--   → transition_commercial_proposal    activities.title
--   (e mais 6 funções fora do Lead 360, listadas no relatório da frente A)
--
-- ── O QUE ISSO QUEBRA, DA TELA PARA TRÁS ───────────────────────────────────
--
-- `transfer_single_lead`  → POST /api/v1/leads/[id]/transfer
--     Duas colunas inexistentes na MESMA função. `tasks` tem `user_id`, não
--     `assigned_to` (o mesmo par que a migration 20260801200000 já consertou em
--     `generate_smart_task_reminders`). A rota traduz o 42703 como HTTP 403
--     "Transferência não permitida." — mandando a liderança conferir permissão
--     quando o problema é esquema. Beco: a permissão está certa e continua
--     recusando. PROVA: `lead_transfer_batches` tem 1 linha, criada por uma
--     redistribuição manual de 279 leads; nenhuma transferência individual
--     jamais criou um lote.
--
-- `accept_lead_assignment` → POST /api/v1/leads/[id] {action:"accept_assignment"}
--     O 42703 não casa com nenhum dos códigos que a rota trata como "banco sem
--     a fase 58" (42883 / PGRST202), então ela cai no 409 genérico "Não foi
--     possível aceitar a lead agora". O corretor não consegue assumir a lead.
--
-- `transition_commercial_proposal` → POST /api/v1/leads/[id]/commercial-simulation
--     {action:"proposal_lifecycle"}. Enviar, aceitar, recusar e vencer proposta:
--     os quatro desfechos comerciais do ciclo, todos abortando na trilha.
--
-- ── ONDE A MANCHETE PASSA A MORAR ──────────────────────────────────────────
--
-- Igual ao que `move_pipeline_lead` já faz e ao que `lib/crm/registro-de-atividade.ts`
-- padronizou no lado TypeScript: a manchete vai em `metadata.title` e a frase
-- humana continua em `description`. Nenhuma coluna nova, nenhuma tabela nova.
--
-- ── ESTADO DESTA MIGRATION ─────────────────────────────────────────────────
--
-- NÃO APLICADA. A auditoria que a produziu tinha autorização de leitura apenas
-- (somente SELECT em produção). Até alguém aplicá-la, as três rotas acima
-- continuam recusando 100% das chamadas. Aplicar é `create or replace` puro:
-- não cria, não apaga e não altera tabela; não toca RLS; não move dado; os
-- GRANTs sobrevivem ao replace (por isso não há DROP aqui).
--
-- ROLLBACK: reaplicar a versão anterior (com `title` e `tasks.assigned_to`). O
-- efeito é as três rotas voltarem a reprovar com 42703 — o estado anterior é o
-- defeito. Não há dado a restaurar, porque nunca houve dado.

begin;

create or replace function public.accept_lead_assignment(p_actor_id uuid,p_organization_id uuid,p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare reservation record;
begin select * into reservation from public.lead_assignment_reservations where organization_id=p_organization_id and lead_id=p_lead_id and broker_id=p_actor_id and status='pending' order by created_at desc for update limit 1;if reservation.id is null then raise exception 'reservation_not_found';end if;if reservation.expires_at<=now() then raise exception 'reservation_expired';end if;if not exists(select 1 from public.leads where id=p_lead_id and organization_id=p_organization_id and assigned_to=p_actor_id) then raise exception 'reservation_owner_changed';end if;update public.lead_assignment_reservations set status='accepted',accepted_at=now() where id=reservation.id;
-- SEM `title`: a tabela nao tem essa coluna. A manchete vai em metadata.title.
insert into public.activities(organization_id,lead_id,user_id,type,description,metadata,occurred_at)values(p_organization_id,p_lead_id,p_actor_id,'system','Aceite registrado dentro do prazo da distribuição.',jsonb_build_object('title','Lead aceita pelo corretor'),now());
return jsonb_build_object('reservationId',reservation.id,'leadId',p_lead_id,'accepted',true,'acceptedAt',now(),'singleOwnerPreserved',true);end $$;

create or replace function public.transfer_single_lead(p_actor_id uuid,p_organization_id uuid,p_lead_id uuid,p_expected_owner_id uuid,p_target_owner_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text;target_role text;lead_row public.leads%rowtype;batch_id uuid;
begin
 if char_length(trim(coalesce(p_reason,'')))<10 or char_length(trim(p_reason))>500 then raise exception 'transfer_reason_invalid';end if;
 select coalesce(commercial_role,case role when 'admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
 select coalesce(commercial_role,role) into target_role from public.profiles where id=p_target_owner_id and organization_id=p_organization_id and active=true;
 if actor_role not in('director','superintendent','manager') or target_role<>'broker' then raise exception 'transfer_role_forbidden';end if;
 select * into lead_row from public.leads where id=p_lead_id and organization_id=p_organization_id for update;if lead_row.id is null then raise exception 'transfer_lead_not_found';end if;
 if lead_row.assigned_to is distinct from p_expected_owner_id then raise exception 'transfer_owner_conflict';end if;if lead_row.assigned_to=p_target_owner_id then raise exception 'transfer_same_owner';end if;
 if actor_role<>'director' and not exists(with recursive descendants as(select id from public.profiles where id=p_actor_id and organization_id=p_organization_id union all select p.id from public.profiles p join descendants d on p.reports_to=d.id where p.organization_id=p_organization_id and p.active=true)select 1 where p_target_owner_id in(select id from descendants) and lead_row.assigned_to in(select id from descendants)) then raise exception 'transfer_hierarchy_forbidden';end if;
 if actor_role='manager' and not exists(select 1 from public.profiles where id=p_target_owner_id and organization_id=p_organization_id and reports_to=p_actor_id and active=true) then raise exception 'transfer_direct_team_required';end if;
 insert into public.lead_transfer_batches(organization_id,actor_id,target_owner_id,lead_count,reason)values(p_organization_id,p_actor_id,p_target_owner_id,1,trim(p_reason))returning id into batch_id;
 insert into public.lead_transfer_items(batch_id,lead_id,previous_owner_id,target_owner_id)values(batch_id,p_lead_id,lead_row.assigned_to,p_target_owner_id);
 update public.leads set assigned_to=p_target_owner_id,updated_at=now() where id=p_lead_id and organization_id=p_organization_id and assigned_to is not distinct from p_expected_owner_id;
 -- `tasks` NAO tem `assigned_to`: a coluna de dono e `user_id`.
 update public.tasks set user_id=p_target_owner_id where organization_id=p_organization_id and lead_id=p_lead_id and status not in('concluida','completed','cancelado','cancelled');
 -- SEM `title`: a tabela nao tem essa coluna. A manchete vai em metadata.title.
 insert into public.activities(organization_id,lead_id,user_id,type,description,metadata,occurred_at)values(p_organization_id,p_lead_id,p_actor_id,'system',left(trim(p_reason),500),jsonb_build_object('title','Responsável transferido','previousOwnerId',lead_row.assigned_to,'targetOwnerId',p_target_owner_id,'batchId',batch_id),now());
 return jsonb_build_object('batchId',batch_id,'leadId',p_lead_id,'previousOwnerId',lead_row.assigned_to,'targetOwnerId',p_target_owner_id,'singleOwnerPreserved',true,'openTasksRealigned',true,'auditable',true);
end $$;

create or replace function public.transition_commercial_proposal(p_actor_id uuid,p_organization_id uuid,p_lead_id uuid,p_simulation_id uuid,p_status text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sim public.commercial_simulations%rowtype; lead_owner uuid; actor_allowed boolean; previous_status text;
begin
  if p_status not in ('sent','accepted','declined','expired') then raise exception 'proposal_transition_invalid'; end if;
  if p_status='declined' and char_length(trim(coalesce(p_note,'')))<5 then raise exception 'proposal_decline_reason_required'; end if;
  select * into sim from public.commercial_simulations where id=p_simulation_id and organization_id=p_organization_id and lead_id=p_lead_id for update;
  if sim.id is null then raise exception 'proposal_not_found'; end if;
  previous_status := sim.status;
  select assigned_to into lead_owner from public.leads where id=p_lead_id and organization_id=p_organization_id;
  with recursive team as (select id from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true union all select p.id from public.profiles p join team t on p.reports_to=t.id where p.organization_id=p_organization_id and p.active=true)
  select exists(select 1 from team where id=lead_owner) into actor_allowed;
  if not actor_allowed then raise exception 'proposal_out_of_scope'; end if;
  if p_status='sent' and (sim.status<>'approved' or sim.valid_until<now()) then raise exception 'proposal_not_sendable'; end if;
  if p_status in ('accepted','declined') and sim.status<>'sent' then raise exception 'proposal_response_invalid'; end if;
  if p_status='expired' and (sim.status not in ('approved','sent') or sim.valid_until>=now()) then raise exception 'proposal_not_expired'; end if;
  update public.commercial_simulations set status=p_status,response_note=case when p_status in ('accepted','declined') then nullif(left(trim(coalesce(p_note,'')),1000),'') else response_note end where id=sim.id;
  -- SEM `title`: a tabela nao tem essa coluna. A manchete vai em metadata.title.
  insert into public.activities(organization_id,lead_id,user_id,type,description,metadata,occurred_at)
  values(p_organization_id,p_lead_id,p_actor_id,'commercial_proposal_lifecycle',coalesce(nullif(left(trim(coalesce(p_note,'')),1000),''),'Ciclo comercial atualizado com rastreabilidade.'),jsonb_build_object('simulationId',sim.id,'from',previous_status,'to',p_status,'title',case p_status when 'sent' then 'Proposta enviada ao cliente' when 'accepted' then 'Proposta aceita pelo cliente' when 'declined' then 'Proposta recusada pelo cliente' else 'Proposta vencida' end),now());
  if p_status='sent' then update public.leads set next_action_at=least(sim.valid_until,now()+interval '24 hours'),updated_at=now() where id=p_lead_id and organization_id=p_organization_id;
  elsif p_status in ('accepted','declined','expired') then update public.leads set next_action_at=null,updated_at=now() where id=p_lead_id and organization_id=p_organization_id; end if;
  return jsonb_build_object('id',sim.id,'previousStatus',previous_status,'status',p_status,'validUntil',sim.valid_until,'occurredAt',now());
end $$;

commit;
