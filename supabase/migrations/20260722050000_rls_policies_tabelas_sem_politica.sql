-- =====================================================================
-- RLS: policies para tabelas com RLS LIGADO e ZERO policy
-- =====================================================================
-- CONTEXTO
-- RLS habilitado sem nenhuma policy e fail-closed: nao vaza dado, mas
-- devolve ZERO LINHAS EM SILENCIO para qualquer sessao "authenticated".
-- Hoje isso esta mascarado porque a maior parte do backend usa
-- service_role (que ignora RLS); os poucos pontos que usam o cliente de
-- sessao mostram card/consulta zerada sem erro nenhum.
--
-- Esta migration cobre 15 tabelas que sao efetivamente chamadas pelo
-- codigo. Ela NAO altera dado (nenhum insert/update/delete) e e
-- reaplicavel: todo create e precedido de "drop policy if exists".
--
-- ESCOPO / CRITERIOS ADOTADOS
--  1. Padrao ja estabelecido no schema: <tabela>_org_access, role
--     "authenticated", escopo por organization_id resolvido via
--     (select public.current_organization_id()) -- funcao SECURITY
--     DEFINER que le o claim do JWT e cai para o profile ATIVO.
--  2. Tabela que o app so LE via sessao ganha policy FOR SELECT (e nao
--     FOR ALL). Escrita continua exclusiva do service_role. Isso e mais
--     restritivo que o padrao e nao quebra nada hoje.
--  3. Tabela em que o usuario tambem escreve ganha FOR ALL com USING e
--     WITH CHECK amarrados na mesma organizacao (sem WITH CHECK, um
--     upsert e barrado no insert).
--  4. Tres tabelas tem organization_id NULLABLE e sem FK
--     (lead_events, pipeline_history, followups). Para elas a policy
--     exige que NENHUM sinal de posse contradiga a organizacao atual e
--     que exista ao menos um sinal. Linha com org de uma empresa e lead
--     de outra fica invisivel para as duas: em caso de dado
--     inconsistente, o certo e sumir, nao aparecer para o lado errado.
--  5. Onde o escopo vem por join ate leads, o filtro NAO pode ser um
--     EXISTS direto em public.leads. Motivo medido em homologacao:
--     public.leads tem RLS cuja policy referencia public.profiles, e a
--     policy de profiles se auto-referencia -- qualquer select em leads
--     ou profiles como "authenticated" ja estoura hoje com
--     "42P17: infinite recursion detected in policy for relation
--     profiles", independente desta migration. Um EXISTS em leads dentro
--     da policy herdaria essa recursao e trocaria o zero silencioso por
--     um erro duro. Por isso o join passa por helper SECURITY DEFINER
--     (mesmo padrao dos private.can_* que ja existem no schema), que
--     resolve o dono sem reentrar no RLS de leads/profiles.
--     A recursao em profiles e um defeito PRE-EXISTENTE e continua em
--     aberto: precisa de correcao propria, fora do escopo desta migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- HELPER: private.lead_belongs_to_current_org(uuid)
-- Responde apenas SIM/NAO para "este lead e da minha organizacao?".
-- Deliberadamente booleano, e nao "qual a organizacao do lead": devolve o
-- minimo necessario, sem permitir descobrir a que empresa um lead
-- pertence. SECURITY DEFINER com search_path vazio, no schema private
-- (onde anon nao tem USAGE), seguindo private.can_view_lead/can_manage_*.
-- Retorna false -- nunca null -- para lead nulo, inexistente ou de outra
-- organizacao, e tambem quando nao ha organizacao na sessao: fail-closed
-- em todos os caminhos.
-- ---------------------------------------------------------------------
create or replace function private.lead_belongs_to_current_org(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and l.organization_id = private.current_organization_id()
  );
$$;

revoke execute on function private.lead_belongs_to_current_org(uuid) from public;
grant execute on function private.lead_belongs_to_current_org(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1) lead_events  (16 chamadas)
-- POR QUE: quebrada hoje. app/(crm)/atlas-v3/page.tsx (2 counts) e
-- app/(crm)/conversations/page.tsx leem via cliente de sessao e recebem
-- zero em silencio. Toda escrita e backend (service_role), por isso a
-- policy e so de leitura.
-- ESCOPO: organization_id direta (NULLABLE, sem FK) reforcada pelo dono
-- real, lead_events.lead_id -> leads.organization_id. Linha sem os dois
-- sinais e orfa e permanece invisivel.
-- ---------------------------------------------------------------------
drop policy if exists lead_events_org_access on public.lead_events;
create policy lead_events_org_access on public.lead_events
  for select to authenticated
  using (
    (organization_id is null or organization_id = (select public.current_organization_id()))
    and (lead_id is null or private.lead_belongs_to_current_org(lead_id))
    and (organization_id is not null or lead_id is not null)
  );

-- ---------------------------------------------------------------------
-- 2) marketing_campaigns  (7 chamadas)
-- POR QUE: quebrada hoje. app/(crm)/leads/page.tsx e
-- app/api/v1/launch-os/route.ts leem via cliente de sessao (identity.supabase).
-- O codigo inteiro so faz select nesta tabela: leitura basta.
-- ESCOPO: organization_id direta (NOT NULL, FK -> organizations.id).
-- ---------------------------------------------------------------------
drop policy if exists marketing_campaigns_org_access on public.marketing_campaigns;
create policy marketing_campaigns_org_access on public.marketing_campaigns
  for select to authenticated
  using (organization_id = (select public.current_organization_id()));

-- ---------------------------------------------------------------------
-- 3) messaging_suppressions  (7 chamadas)
-- POR QUE: hoje 100% backend; a policy e defesa em profundidade. Dado
-- sensivel (opt-out e destinatario), entao o isolamento por empresa tem
-- de existir antes de qualquer fluxo migrar para sessao.
-- ESCOPO: organization_id direta (NOT NULL, FK -> organizations.id).
-- Somente leitura: supressao e decisao de compliance, escrita segue
-- restrita ao service_role.
-- ---------------------------------------------------------------------
drop policy if exists messaging_suppressions_org_access on public.messaging_suppressions;
create policy messaging_suppressions_org_access on public.messaging_suppressions
  for select to authenticated
  using (organization_id = (select public.current_organization_id()));

-- ---------------------------------------------------------------------
-- 4) kaizen_ideas  (5 chamadas)
-- POR QUE: o usuario le, cria ideia e atualiza decisao/status
-- (app/api/v1/kaizen/route.ts e app/api/v1/kaizen/[id]/route.ts). Hoje
-- passa por service_role, mas a policy precisa cobrir escrita para o dia
-- em que o fluxo usar a sessao. Alem disso kaizen_votes depende dela: o
-- EXISTS da policy de voto so funciona se kaizen_ideas for legivel.
-- ESCOPO: organization_id direta (NOT NULL, FK -> organizations.id).
-- ---------------------------------------------------------------------
drop policy if exists kaizen_ideas_org_access on public.kaizen_ideas;
create policy kaizen_ideas_org_access on public.kaizen_ideas
  for all to authenticated
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

-- ---------------------------------------------------------------------
-- 5) kaizen_votes  (4 chamadas)
-- POR QUE: o usuario vota e desvota (insert + delete). Unica excecao a
-- regra de "uma policy por tabela": leitura precisa ser da organizacao
-- inteira (contagem de votos), mas escrita e ato pessoal e fica presa a
-- auth.uid() -- ninguem vota nem apaga voto no lugar de outro.
-- ESCOPO: nao ha coluna de organizacao. Unico caminho real e
-- idea_id -> kaizen_ideas.organization_id.
-- ---------------------------------------------------------------------
drop policy if exists kaizen_votes_org_access on public.kaizen_votes;
create policy kaizen_votes_org_access on public.kaizen_votes
  for select to authenticated
  using (
    exists (
      select 1 from public.kaizen_ideas k
      where k.id = kaizen_votes.idea_id
        and k.organization_id = (select public.current_organization_id())
    )
  );

drop policy if exists kaizen_votes_self_insert on public.kaizen_votes;
create policy kaizen_votes_self_insert on public.kaizen_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.kaizen_ideas k
      where k.id = kaizen_votes.idea_id
        and k.organization_id = (select public.current_organization_id())
    )
  );

drop policy if exists kaizen_votes_self_delete on public.kaizen_votes;
create policy kaizen_votes_self_delete on public.kaizen_votes
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.kaizen_ideas k
      where k.id = kaizen_votes.idea_id
        and k.organization_id = (select public.current_organization_id())
    )
  );

-- ---------------------------------------------------------------------
-- 6) lead_objections  (4 chamadas)
-- POR QUE: o usuario registra e atualiza objecao
-- (app/api/v1/leads/[id]/objections/route.ts), alem da leitura em
-- lib/atlas/attention-signals.ts. Precisa cobrir escrita.
-- ESCOPO: organization_id direta (NOT NULL) e, melhor ainda, FK COMPOSTO
-- (organization_id, lead_id) -> leads(organization_id, id): o proprio
-- banco garante que a organizacao da objecao bate com a do lead. Por
-- isso nao ha join aqui -- ele seria redundante com a constraint.
-- ---------------------------------------------------------------------
drop policy if exists lead_objections_org_access on public.lead_objections;
create policy lead_objections_org_access on public.lead_objections
  for all to authenticated
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

-- ---------------------------------------------------------------------
-- 7) import_batches  (4 chamadas)
-- POR QUE: o progresso da importacao e escrito pelo backend
-- (app/api/v1/leads/import/route.ts) e lido pelo command-center. Sem
-- policy, qualquer tela de sessao que passe a mostrar o historico de
-- importacao vem vazia.
-- ESCOPO: organization_id direta (NOT NULL, FK -> organizations.id).
-- Somente leitura: quem cria lote e o backend.
-- ---------------------------------------------------------------------
drop policy if exists import_batches_org_access on public.import_batches;
create policy import_batches_org_access on public.import_batches
  for select to authenticated
  using (organization_id = (select public.current_organization_id()));

-- ---------------------------------------------------------------------
-- 8) marketing_spend  (4 chamadas)
-- POR QUE: dado financeiro (investimento e CAC). Somente leitura no
-- codigo, mas o isolamento por empresa e obrigatorio: custo de midia de
-- um cliente jamais pode aparecer para outro.
-- ESCOPO: organization_id direta (NOT NULL, FK -> organizations.id),
-- reforcada por FK COMPOSTO (organization_id, campaign_id) ->
-- marketing_campaigns(organization_id, id).
-- ---------------------------------------------------------------------
drop policy if exists marketing_spend_org_access on public.marketing_spend;
create policy marketing_spend_org_access on public.marketing_spend
  for select to authenticated
  using (organization_id = (select public.current_organization_id()));

-- ---------------------------------------------------------------------
-- 9) pipeline_history  (4 chamadas)
-- POR QUE: historico de movimentacao de funil, lido por discard-report e
-- attention-signals. Escrita e backend, entao leitura basta.
-- ESCOPO: mesmo caso do lead_events -- organization_id NULLABLE e sem
-- FK. A policy exige coerencia com o dono real via
-- lead_id -> leads.organization_id e descarta linha totalmente orfa.
-- ---------------------------------------------------------------------
drop policy if exists pipeline_history_org_access on public.pipeline_history;
create policy pipeline_history_org_access on public.pipeline_history
  for select to authenticated
  using (
    (organization_id is null or organization_id = (select public.current_organization_id()))
    and (lead_id is null or private.lead_belongs_to_current_org(lead_id))
    and (organization_id is not null or lead_id is not null)
  );

-- ---------------------------------------------------------------------
-- 10) product_budgets  (4 chamadas)
-- POR QUE: app/api/v1/marketing/cost-report/route.ts faz UPSERT de
-- orcamento. Policy so de select barraria o insert do upsert, por isso
-- USING e WITH CHECK. Dado financeiro (weekly_budget, target_cac).
-- ESCOPO: organization_id direta (NOT NULL, FK -> organizations.id).
-- ---------------------------------------------------------------------
drop policy if exists product_budgets_org_access on public.product_budgets;
create policy product_budgets_org_access on public.product_budgets
  for all to authenticated
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

-- ---------------------------------------------------------------------
-- 11) lead_distribution_history  (3 chamadas)
-- POR QUE: trilha de auditoria de quem recebeu qual lead. Escrita e 100%
-- backend (distribution/route.ts e hierarchical-cascade.ts); leitura
-- basta para a sessao.
-- ESCOPO: organization_id direta (NOT NULL, FK -> organizations.id).
-- ---------------------------------------------------------------------
drop policy if exists lead_distribution_history_org_access on public.lead_distribution_history;
create policy lead_distribution_history_org_access on public.lead_distribution_history
  for select to authenticated
  using (organization_id = (select public.current_organization_id()));

-- ---------------------------------------------------------------------
-- 12) inventory_units  (2 chamadas)
-- POR QUE: quebrada hoje em duas frentes de sessao --
-- app/(crm)/atlas-v3/page.tsx (count exact) e app/api/v1/launch-os/route.ts
-- via identity.supabase. E a causa do card de estoque zerado no dashboard.
-- Poucas chamadas, alto impacto visivel.
-- ESCOPO: organization_id direta (NOT NULL, FK -> organizations.id),
-- reforcada por FK COMPOSTO (organization_id, project_id) -> crm_projects.
-- ---------------------------------------------------------------------
drop policy if exists inventory_units_org_access on public.inventory_units;
create policy inventory_units_org_access on public.inventory_units
  for select to authenticated
  using (organization_id = (select public.current_organization_id()));

-- ---------------------------------------------------------------------
-- 13) followups  (2 chamadas)
-- POR QUE: agenda de retorno lida por lib/atlas/attention-signals.ts e
-- escrita pelo fluxo de aprovacoes (backend). Leitura basta.
-- ESCOPO: organization_id NULLABLE e sem FK, mesmo risco do lead_events;
-- por isso a checagem cruzada com lead_id -> leads.organization_id.
-- OBS: existe user_id -> profiles.id. Se no futuro o corretor precisar
-- ver apenas os proprios followups, endurecer aqui com
-- "and user_id = (select auth.uid())" -- deliberadamente NAO feito agora
-- porque gerente e coordenador precisam enxergar a equipe.
-- ---------------------------------------------------------------------
drop policy if exists followups_org_access on public.followups;
create policy followups_org_access on public.followups
  for select to authenticated
  using (
    (organization_id is null or organization_id = (select public.current_organization_id()))
    and (lead_id is null or private.lead_belongs_to_current_org(lead_id))
    and (organization_id is not null or lead_id is not null)
  );

-- ---------------------------------------------------------------------
-- 14) knowledge_documents  (1 chamada)
-- POR QUE: quebrada hoje apesar da chamada unica --
-- app/api/v1/launch-os/route.ts le via cliente de sessao e recebe zero.
-- Somente leitura no codigo.
-- ESCOPO: organization_id direta (NOT NULL, FK -> organizations.id).
-- OBS: knowledge_chunks (a filha) tambem esta sem policy, mas nenhum
-- ponto do codigo a acessa por sessao -- fica fail-closed de proposito.
-- ---------------------------------------------------------------------
drop policy if exists knowledge_documents_org_access on public.knowledge_documents;
create policy knowledge_documents_org_access on public.knowledge_documents
  for select to authenticated
  using (organization_id = (select public.current_organization_id()));

-- ---------------------------------------------------------------------
-- 15) ai_scores  (1 chamada)
-- POR QUE: quebrada hoje. app/(crm)/atlas-v3/page.tsx faz count exact do
-- card de scores via sessao e mostra zero. Nenhuma escrita pelo app.
-- ESCOPO: nao ha coluna de organizacao; colunas reais sao id, lead_id,
-- score, classification, recommendation, created_at. Unico caminho e
-- lead_id -> leads.organization_id. lead_id e NULLABLE: score sem lead e
-- orfao e continua invisivel para todo mundo, o que e o comportamento
-- correto (nao ha como provar de quem e).
-- ---------------------------------------------------------------------
drop policy if exists ai_scores_org_access on public.ai_scores;
create policy ai_scores_org_access on public.ai_scores
  for select to authenticated
  using (private.lead_belongs_to_current_org(lead_id));

-- ---------------------------------------------------------------------
-- 16) projects  --  DELIBERADAMENTE SEM POLICY
-- Colunas reais: id, name, company, status, created_at. Zero FK saindo,
-- zero FK apontando para ela, zero linhas. NAO EXISTE caminho ate uma
-- organizacao: escrever policy aqui seria inventar escopo, e o unico
-- escopo possivel ("true") vazaria dado entre empresas caso a tabela
-- volte a ser populada. A tabela canonica e crm_projects, que ja tem
-- policy. projects e legado lido apenas como fallback em
-- app/(crm)/atlas-v3/developer/page.tsx e app/api/v1/crm/reactivation.
-- DECISAO: mantida fail-closed (RLS ligado, nenhuma policy = so
-- service_role le). Encaminhamento correto e remover os dois fallbacks e
-- dropar a tabela, nao afrouxar o RLS.
-- ---------------------------------------------------------------------

-- =====================================================================
-- VERIFICACAO (mesma consulta do levantamento)
--   select c.relname, count(p.polname)
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   left join pg_policy p on p.polrelid = c.oid
--   where n.nspname='public' and c.relkind='r' and c.relrowsecurity
--   group by c.relname having count(p.polname) = 0;
-- Antes: 27 tabelas com RLS e zero policy.  Depois: 12.
-- 15 tabelas cobertas por 17 policies, todas restritas a "authenticated".
--
-- PENDENCIAS ENCONTRADAS AO APLICAR (nao corrigidas aqui de proposito)
--  a) RECURSAO EM profiles: a policy profiles_select_org referencia a
--     propria tabela profiles, e leads_org_access referencia profiles.
--     Resultado medido: qualquer "select ... from public.profiles" ou
--     "from public.leads" como authenticated retorna
--     "42P17: infinite recursion detected in policy for relation profiles".
--     Ou seja, o cliente de sessao esta quebrado tambem em leads/profiles,
--     por motivo diferente e anterior a esta migration. Precisa de
--     correcao propria (trocar o auto-select por private.current_organization_id()).
--  b) GRANTS PARA anon: 14 das 15 tabelas acima concedem
--     select/insert/update/delete tanto para authenticated quanto para
--     anon. Com RLS sem policy isso nao vazava; agora que ha policies,
--     e o fato de todas serem "to authenticated" que mantem anon fora.
--     Revisar e revogar os grants de anon e o passo seguinte recomendado.
--  c) messaging_suppressions nao tem grant nenhum para authenticated, entao
--     a policy criada e inerte hoje (a tabela responde 42501 antes do RLS).
--     Mantida assim de proposito: quando o grant existir, o isolamento por
--     organizacao ja estara no lugar.
-- =====================================================================
