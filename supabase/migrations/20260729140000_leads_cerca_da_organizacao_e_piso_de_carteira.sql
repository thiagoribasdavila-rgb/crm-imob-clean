-- ── A ORGANIZAÇÃO VIRA CERCA; A CARTEIRA VIRA A CONCESSÃO ───────────────────
--
-- `public.leads` tinha CINCO policies, TODAS PERMISSIVE. Policies permissivas
-- se somam por OR, então `leads_org_access` (cmd=ALL, organização inteira)
-- ENGOLIA as quatro comerciais: elas eram código morto.
--
-- MEDIDO EXECUTANDO em 2026-07-29 (banco de homologação), com a chave
-- publishable e o token do próprio usuário, indo direto ao PostgREST, sem
-- passar pela aplicação:
--   corretor de carteira VAZIA → SELECT /rest/v1/leads = 206, content-range
--   */470: a organização INTEIRA. UPDATE em lead de outro dono = 200 e a coluna
--   mudou. DELETE na mesma = 200 e a linha SUMIU. Cada escrita foi confirmada
--   por RELEITURA com service_role, nunca pelo status HTTP (o DELETE devolve
--   204 tanto quando apaga quanto quando o RLS filtra tudo).
--   CONTROLE: a MESMA chave sem sessão → 0 linhas. Não é falso positivo.
--
-- A camada de APLICAÇÃO já foi fechada (commit 722ed660: `requireLeadAccess`
-- aplica o piso de carteira, 13 verbos → 403 provados). Esta migration fecha o
-- banco, que é o caminho que ignora a aplicação.
--
-- ── POR QUE RESTRICTIVE, E NÃO "DROP na org_access" ─────────────────────────
--
-- Três saídas foram consideradas. A escolhida é a (C).
--
-- (A) Apagar `leads_org_access` e ficar só com as comerciais.
--     Funciona — `private.can_access_commercial_lead` já testa
--     `v.organization_id = lead_organization_id` por dentro. Mas então a
--     fronteira de organização passa a existir em UM lugar só, dentro do corpo
--     de uma função que 8 outras tabelas também usam. Quem editar a função no
--     futuro derruba o isolamento multi-tenant de `leads` sem tocar em `leads`.
--     A fronteira mediu 0 vazamentos entre organizações nas três varreduras de
--     hoje; ela é a única coisa aqui que NUNCA falhou, e não se aposta o que
--     não falhou para economizar uma policy.
--
-- (B) Estreitar `leads_org_access` juntando os dois testes numa policy só.
--     Volta a ter uma verdade calculada em dois lugares (a org na policy e a
--     org dentro da função), que é a classe de defeito dominante deste repo.
--
-- (C) `leads_org_access` vira RESTRICTIVE e muda de nome para `leads_org_fence`.
--     Policies restritivas se combinam por AND com o OR das permissivas:
--         (comercial_select OR comercial_update OR ...) AND (cerca da org)
--     A organização vira CERCA — ela só pode TIRAR acesso, nunca dar. As quatro
--     comerciais voltam a ser a CONCESSÃO de verdade, que é o que elas sempre
--     quiseram ser. As duas checagens ficam independentes: para vazar entre
--     empresas agora é preciso quebrar as DUAS.
--     O nome muda junto porque `..._access` passou a mentir: ela não concede
--     mais nada.
--
-- ── A ARMADILHA: A LEAD ÓRFÃ (esta é a parte que quebra o produto se errar) ──
--
-- No BANCO, `can_access_commercial_lead` só concede lead sem dono ao papel
-- `superintendent`. Na APLICAÇÃO, `filtroDaMinhaCarteira`
-- (lib/crm/escopo-de-leitura.ts) concede lead órfã A TODOS, DE PROPÓSITO — é
-- assim que uma lead sem dono é ADOTADA, e o comentário no arquivo diz isso com
-- todas as letras: "escondê-la a deixaria parada para sempre".
--
-- Hoje ninguém sente a divergência porque a org-wide cobre tudo. Estreitar sem
-- alinhar isso DESLIGA A ADOÇÃO — e a adoção é a única porta de auto-atendimento
-- do corretor (`bulk-transfer` exige papel de liderança).
--
-- MEDIDO, e é o que decide a direção:
--   · superintendentes ATIVOS no banco ....................... 0
--   · o papel é INALCANÇÁVEL: 4 tentativas, 4 recusas de
--     `private.validate_commercial_hierarchy`. Perfil inativo aceita o papel,
--     mas a função filtra `active = true`.
--   => a cláusula `(owner is null and commercial_role = 'superintendent')` é
--      código morto dentro de código morto. Ninguém, hoje, alcança lead órfã
--      pela cláusula que existe exatamente para isso.
--
-- Então a divergência se resolve na direção da APLICAÇÃO: lead sem dono é de
-- todo mundo da organização, porque ela precisa ser vista para ser adotada.
--
-- ── AS DUAS COLUNAS DE DONO (e por que não é `coalesce`) ────────────────────
--
-- A base tem dono em `assigned_to` E em `assigned_user_id`, e cada porta de
-- escrita escolheu uma:
--   app/api/v1/leads/route.ts:162 (criação manual) .... só assigned_user_id
--   app/api/v1/leads/[id]/route.ts:615 (ADOÇÃO) ....... só assigned_user_id
--   app/api/v1/crm/distribution/route.ts:346 .......... só assigned_user_id
--   lib/distribution/hierarchical-cascade.ts:260 ...... só assigned_user_id
--   app/api/v2/outbox/process/route.ts:750 (portais) .. só assigned_to
--   app/api/v1/crm/reactivation/route.ts:155 .......... só assigned_to
--   app/api/v2/approvals/[id]/route.ts:97 ............. AS DUAS
--
-- A policy antiga lia SÓ `assigned_to`. Resultado medido: das 470 leads, 1 é
-- classificada DIFERENTE pelo banco e pela aplicação — tem `assigned_to` nulo e
-- `assigned_user_id` cheio, ou seja, TEM DONO e o banco a tratava como órfã.
-- Pior: a adoção grava só `assigned_user_id`, então a lead adotada continuava
-- órfã aos olhos do banco. A divergência não era um evento, era um ACÚMULO.
--
-- Esta migration adota a régua da aplicação, `estaNaMinhaCarteira`, ao pé da
-- letra — QUALQUER das duas colunas serve como dono, órfã é quando AS DUAS são
-- nulas. Não é `coalesce(assigned_to, assigned_user_id)`: com `coalesce`, uma
-- lead com pessoas DIFERENTES nas duas colunas seria alcançada só por uma
-- delas, enquanto a aplicação alcança pelas duas — duas verdades de novo.
-- Sobre os dados de hoje as duas réguas dão o MESMO resultado (leads com donos
-- conflitantes = 0, medido), mas a régua "qualquer das duas" concorda com a
-- aplicação POR CONSTRUÇÃO, e não por coincidência do estoque atual.
--
-- Efeito medido da troca: leads classificadas diferente pelas duas camadas
-- cai de 1 para 0, em 470.
--
-- ── POR QUE UMA FUNÇÃO NOVA, E NÃO EDITAR A EXISTENTE ───────────────────────
--
-- `private.can_access_commercial_lead` recebe UM dono. A regra de `leads` tem
-- DUAS colunas: não cabe na assinatura. E a função é usada por outras 8 tabelas
-- (activities, tasks, opportunities, conversations, messages, lead_visits,
-- lead_copilots, follow_up_sla_events, pipeline_stage_moves,
-- lead_experience_signals). Mexer nela mudaria todas elas de uma vez, e nenhuma
-- foi medida com a regra nova.
--
-- Por isso: função NOVA, usada SÓ pelas policies de `leads`.
-- `can_access_commercial_lead` fica BYTE-IDÊNTICA. As outras tabelas não mudam,
-- e isso é conferível: os controles medidos (pipeline_stage_moves corretor 0 /
-- diretor 104; lead_copilots corretor 0 / diretor ~490; commercial_presence
-- corretor 0 / diretor 2) têm de continuar exatamente iguais.
--
-- O padrão obrigatório está mantido: a lógica vive numa função helper que
-- devolve BOOLEANO, SECURITY DEFINER com search_path vazio. `EXISTS` direto
-- sobre leads/profiles dentro de POLICY estoura 42P17 (recursão infinita). E a
-- função nunca devolve a organization_id — devolver deixaria descobrir a que
-- empresa uma lead pertence.
--
-- ── O QUE ESTA MIGRATION *NÃO* CONSERTA (dito de propósito) ─────────────────
--
-- `activities` tem a MESMA doença e GRANT completo: medido hoje, um corretor de
-- carteira vazia LEU, ALTEROU e APAGOU a activity de outra pessoa.
-- `customers` idem (DELETE consumado). `profiles` expõe email/telefone/creci de
-- 40 terceiros. `opportunities` só não vaza escrita porque falta GRANT — sorte,
-- não desenho. Nada disso é tocado aqui: cada uma precisa da sua própria
-- linha de base medida antes e depois. Esta migration é só `leads`.
--
-- ── ANTES DE APLICAR: CONFIRA ESTE NÚMERO ──────────────────────────────────
--
-- A cerca revela um problema de DADO que ela não criou. Medido hoje, por perfil
-- ativo, quantas leads cada um passa a alcançar:
--   9 diretores ......... 469 → 469  (nada muda)
--   corretor 8bbdcc25 ... 469 → 272
--   corretor aa077aa4 ... 469 → 195
--   corretor ce402fcc ... 469 →   1
--   9 corretores ........ 469 →   0  (carteira vazia; é o correto)
--   gerente  240a6bc5 ... 469 → 468  (12 subordinados diretos)
--   gerente  865ee50a ... 469 →   0  (ZERO subordinados e ZERO leads próprias)
--
-- O último caso é real e visível: essa pessoa abre o CRM e vê lista vazia. Não
-- é defeito da policy — é um perfil marcado como gerente sem ninguém abaixo
-- dele. Resolva no DADO antes de aplicar (dar subordinados via `reports_to`, ou
-- reclassificar o `commercial_role`), não afrouxando a policy. Reexecute para
-- conferir:
--
--   select p.id, p.full_name,
--          (select count(*) from public.profiles c where c.reports_to = p.id and c.active) as subordinados,
--          (select count(*) from public.leads l
--             where l.organization_id = p.organization_id
--               and (l.assigned_to = p.id or l.assigned_user_id = p.id)) as carteira
--   from public.profiles p
--   where p.active
--     and coalesce(p.commercial_role, case p.role when 'admin' then 'director'
--         when 'manager' then 'manager' when 'broker' then 'broker' end) = 'manager';
--
-- ── ROLLBACK (devolve EXATAMENTE ao estado de agora) ────────────────────────
--
-- Escrito a partir do que foi lido de pg_policy/pg_get_functiondef hoje, não de
-- memória. `pg_get_expr` renderiza `public.profiles` como `profiles` (o schema
-- está no search_path), então o texto restaurado sai idêntico ao de agora.
-- Está também no irmão .down.sql.
--
--   begin;
--
--   drop policy if exists leads_commercial_select on public.leads;
--   drop policy if exists leads_commercial_insert on public.leads;
--   drop policy if exists leads_commercial_update on public.leads;
--   drop policy if exists leads_commercial_delete on public.leads;
--   drop policy if exists leads_org_fence      on public.leads;
--
--   create policy leads_org_access on public.leads
--     for all to authenticated
--     using (organization_id = (select profiles.organization_id from public.profiles
--                                where profiles.id = (select auth.uid())))
--     with check (organization_id = (select profiles.organization_id from public.profiles
--                                     where profiles.id = (select auth.uid())));
--
--   create policy leads_commercial_select on public.leads
--     for select to authenticated
--     using ((select private.can_access_commercial_lead(leads.organization_id, leads.assigned_to)));
--
--   create policy leads_commercial_insert on public.leads
--     for insert to authenticated
--     with check ((select private.can_access_commercial_lead(leads.organization_id, leads.assigned_to)));
--
--   create policy leads_commercial_update on public.leads
--     for update to authenticated
--     using ((select private.can_access_commercial_lead(leads.organization_id, leads.assigned_to)))
--     with check ((select private.can_access_commercial_lead(leads.organization_id, leads.assigned_to)));
--
--   create policy leads_commercial_delete on public.leads
--     for delete to authenticated
--     using ((select private.can_access_commercial_lead(leads.organization_id, leads.assigned_to)));
--
--   drop function if exists private.can_access_lead_row(uuid, uuid, uuid);
--
--   commit;
--
-- Nenhum DROP de dado, nenhum TRUNCATE, nenhum reset: só policy e função nova.
-- `private.can_access_commercial_lead` e
-- `private.validate_commercial_hierarchy` não são tocadas.

begin;

-- ── 1. A REGRA DE ALCANCE DE UMA LINHA DE `leads` ───────────────────────────
--
-- Espelha `estaNaMinhaCarteira` + `leLiderancaInteira` de
-- lib/crm/escopo-de-leitura.ts. Se um dia divergirem, é aqui e lá que se olha.
--
-- A ordem dos OR não é estética: os três testes baratos (liderança, dono,
-- órfã) vêm antes do único caro (`can_view_commercial_profile`, que abre CTE
-- recursiva). Para diretor a função decide na primeira linha, sem tocar na
-- hierarquia.
create or replace function private.can_access_lead_row(
  lead_organization_id uuid,
  lead_assigned_to uuid,
  lead_assigned_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  with viewer as (
    select
      id,
      organization_id,
      coalesce(
        commercial_role,
        case role
          when 'admin' then 'director'
          when 'manager' then 'manager'
          when 'broker' then 'broker'
        end
      ) as commercial_role,
      role as papel_bruto
    from public.profiles
    where id = (select auth.uid())
      and active = true
  )
  select exists (
    select 1
    from viewer v
    where v.organization_id = lead_organization_id
      and (
        -- Liderança lê o funil inteiro da própria organização.
        --
        -- ── ESTA LISTA É CÓPIA DE VE_O_FUNIL_INTEIRO, E JÁ DIVERGIU UMA VEZ ──
        --
        -- A primeira versão desta migration escreveu só ('director',
        -- 'superintendent') e OMITIU 'manager' e 'admin'. Aplicada, o efeito
        -- foi medido impersonando os perfis reais: o dono da conta
        -- (thiagoribasdavila@gmail.com, commercial_role='manager') caiu de
        -- 469 leads visíveis para ZERO. Ele abriria o CRM numa tela vazia.
        --
        -- A migration que existia para ACABAR com "duas verdades para o mesmo
        -- fato" tinha criado mais uma, no mesmo arquivo em que dizia espelhar
        -- lib/crm/escopo-de-leitura.ts. Espelhar é copiar a lista INTEIRA:
        -- VE_O_FUNIL_INTEIRO = {director, superintendent, manager, admin}.
        --
        -- `papel_bruto = 'admin'` existe pelo mesmo motivo: `leLiderancaInteira`
        -- termina com `|| input.role === "admin"`, para o admin sem papel
        -- comercial definido. Omitir isso seria a mesma falha em menor escala.
        --
        -- 'superintendent' é inerte hoje (0 ativos; o gatilho de hierarquia
        -- recusa o papel nas 4 formas testadas) — fica pela paridade.
        v.commercial_role in ('director', 'superintendent', 'manager', 'admin')
        or v.papel_bruto = 'admin'
        -- Dono por QUALQUER das duas colunas — as portas de escrita usam as
        -- duas, e nenhuma lead tem pessoas diferentes nelas (medido: 0).
        or lead_assigned_to = v.id
        or lead_assigned_user_id = v.id
        -- Lead sem dono NENHUM é de todo mundo da organização: é assim que ela
        -- é adotada. Mesma régua da aplicação (as DUAS colunas nulas).
        or (lead_assigned_to is null and lead_assigned_user_id is null)
        -- Equipe: quem responde pela pessoa alcança a lead dela.
        or (lead_assigned_to is not null
            and private.can_view_commercial_profile(lead_assigned_to))
        or (lead_assigned_user_id is not null
            and private.can_view_commercial_profile(lead_assigned_user_id))
      )
  );
$function$;

-- Espelha exatamente o ACL da função irmã (`postgres=X | authenticated=X`).
-- Sem o grant, TODA consulta a leads morre com "permission denied for
-- function"; com o default do Postgres (EXECUTE para PUBLIC) a função ficaria
-- mais aberta que a vizinha.
revoke all on function private.can_access_lead_row(uuid, uuid, uuid) from public;
grant execute on function private.can_access_lead_row(uuid, uuid, uuid) to authenticated;

comment on function private.can_access_lead_row(uuid, uuid, uuid) is
  'Quem alcança UMA linha de leads: liderança na organização inteira, dono por qualquer das duas colunas de posse, lead sem dono nenhum (para poder ser adotada) e a equipe abaixo de quem responde. É o espelho no banco de estaNaMinhaCarteira/leLiderancaInteira (lib/crm/escopo-de-leitura.ts) — as duas têm de concordar. Devolve booleano de propósito: EXISTS direto sobre leads/profiles dentro de policy estoura 42P17, e devolver a organização deixaria descobrir de que empresa é a lead.';

-- ── 2. A CERCA DA ORGANIZAÇÃO ──────────────────────────────────────────────
--
-- Era PERMISSIVE e cmd=ALL, então concedia a organização inteira por OR e
-- engolia as comerciais. Vira RESTRICTIVE: combina por AND, só TIRA acesso.
--
-- Continua `to authenticated`, igual à policy que substitui. `to public`
-- pegaria também o anon — mas o anon já mede 0 linhas hoje (não existe policy
-- permissiva para ele em leads; medido, com controle), e mudar o alcance da
-- cerca trocaria um controle MEDIDO por um comportamento que eu não teria como
-- medir antes de aplicar. Fica como está.
--
-- `organization_id` é nullable na tabela (0 linhas nulas hoje). Se um dia
-- entrar uma, a comparação dá NULL, a cerca nega e a lead fica invisível para
-- `authenticated` — falha fechada, que é a direção certa do erro. service_role
-- (rolbypassrls = true, verificado) continua enxergando: as ~61 rotas que usam
-- service_role não são afetadas por nada deste arquivo.
drop policy if exists leads_org_access on public.leads;

create policy leads_org_fence on public.leads
  as restrictive
  for all
  to authenticated
  using (
    organization_id = (
      select p.organization_id from public.profiles p where p.id = (select auth.uid())
    )
  )
  with check (
    organization_id = (
      select p.organization_id from public.profiles p where p.id = (select auth.uid())
    )
  );

-- ── 3. AS CONCESSÕES, AGORA COM AS DUAS COLUNAS DE DONO ────────────────────
--
-- Recriadas uma a uma (não dá para trocar a expressão de uma policy sem
-- recriá-la). Mesmos nomes, mesmos comandos, mesmos papéis — muda só a função
-- chamada e o terceiro argumento.
--
-- O INSERT importa mais do que parece: com a regra ANTIGA, um corretor criando
-- lead com `assigned_user_id` = ele e `assigned_to` nulo era REJEITADO pelo
-- CHECK comercial (dono nulo → só superintendent), e só passava porque a
-- org-wide permissiva cobria. Com a cerca virando restritiva, manter o CHECK
-- antigo quebraria a criação de lead pelo navegador. Com a regra nova ele
-- passa: `assigned_user_id = v.id`.
drop policy if exists leads_commercial_select on public.leads;
create policy leads_commercial_select on public.leads
  for select
  to authenticated
  using (
    (select private.can_access_lead_row(
       leads.organization_id, leads.assigned_to, leads.assigned_user_id))
  );

drop policy if exists leads_commercial_insert on public.leads;
create policy leads_commercial_insert on public.leads
  for insert
  to authenticated
  with check (
    (select private.can_access_lead_row(
       leads.organization_id, leads.assigned_to, leads.assigned_user_id))
  );

drop policy if exists leads_commercial_update on public.leads;
create policy leads_commercial_update on public.leads
  for update
  to authenticated
  using (
    (select private.can_access_lead_row(
       leads.organization_id, leads.assigned_to, leads.assigned_user_id))
  )
  -- WITH CHECK na linha DEPOIS da alteração: impede empurrar uma lead para
  -- fora do próprio alcance (ou puxar a de outro para si) num UPDATE só.
  with check (
    (select private.can_access_lead_row(
       leads.organization_id, leads.assigned_to, leads.assigned_user_id))
  );

-- ── 4. APAGAR É DIFERENTE DE ADOTAR ────────────────────────────────────────
--
-- A cláusula "as duas colunas nulas ⇒ é de todo mundo da organização" foi
-- desenhada para a ADOÇÃO: a lead sem dono precisa ser VISTA e ATUALIZADA por
-- alguém, senão fica parada para sempre. Mas as quatro policies chamavam a
-- MESMA função, então a mesma cláusula também autorizava DELETE.
--
-- MEDIDO com a primeira versão desta migration já aplicada: um corretor de
-- fora da subárvore fez DELETE numa lead órfã pelo PostgREST e a linha SUMIU
-- (confirmado por releitura com service_role). Hoje há 0 leads órfãs, então
-- não há dano feito — mas a fila de entrada NASCE órfã (a ingestão da Meta
-- grava lead sem dono), e apagar a fila de entrada inteira seria um fetch.
--
-- Adoção precisa de SELECT e UPDATE. Nunca precisou de DELETE. A regra do
-- apagar é a mesma, MENOS a cláusula órfã.
--
-- PROVADO EXECUTANDO, os dois lados, com impersonação real:
--   corretor SELECT órfã ... 1 linha  (enxerga, para poder adotar)
--   corretor UPDATE órfã ... 1 linha  (a adoção continua funcionando)
--   corretor DELETE órfã ... 0 linhas (não apaga mais)
--   diretor  DELETE órfã ... 1 linha  (a liderança continua podendo)
create or replace function private.pode_apagar_lead(
  lead_organization_id uuid,
  lead_assigned_to uuid,
  lead_assigned_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  with viewer as (
    select
      id,
      organization_id,
      coalesce(
        commercial_role,
        case role
          when 'admin' then 'director'
          when 'manager' then 'manager'
          when 'broker' then 'broker'
        end
      ) as commercial_role,
      role as papel_bruto
    from public.profiles
    where id = (select auth.uid())
      and active = true
  )
  select exists (
    select 1
    from viewer v
    where v.organization_id = lead_organization_id
      and (
        v.commercial_role in ('director', 'superintendent', 'manager', 'admin')
        or v.papel_bruto = 'admin'
        or lead_assigned_to = v.id
        or lead_assigned_user_id = v.id
        -- SEM a cláusula órfã. É a única diferença, e é o ponto do arquivo.
        or (lead_assigned_to is not null
            and private.can_view_commercial_profile(lead_assigned_to))
        or (lead_assigned_user_id is not null
            and private.can_view_commercial_profile(lead_assigned_user_id))
      )
  );
$function$;

revoke all on function private.pode_apagar_lead(uuid, uuid, uuid) from public;
grant execute on function private.pode_apagar_lead(uuid, uuid, uuid) to authenticated;

comment on function private.pode_apagar_lead(uuid, uuid, uuid) is
  'Quem pode APAGAR uma linha de leads: igual a can_access_lead_row, menos a cláusula de lead órfã. Ver e atualizar lead sem dono é o que permite adotá-la; apagá-la nunca foi necessário, e deixaria qualquer corretor destruir a fila de entrada não distribuída pelo caminho que ignora a aplicação.';

drop policy if exists leads_commercial_delete on public.leads;
create policy leads_commercial_delete on public.leads
  for delete
  to authenticated
  using (
    (select private.pode_apagar_lead(
       leads.organization_id, leads.assigned_to, leads.assigned_user_id))
  );

commit;

-- ── DEPOIS DE APLICAR: O QUE MEDIR (as duas direções, sempre) ──────────────
--
--   node base-papeis.mjs tudo   → as 18 linhas VAZAMENTO viram OK e NENHUMA
--                                 vira BLOQUEIO_INDEVIDO. Se `d_orfa` do
--                                 corretor ou do gerente virar BLOQUEIO_INDEVIDO,
--                                 a adoção de lead sem dono foi quebrada.
--   node base-rotas.mjs ...     → corretor/seed_do_outro_corretor 6 → 0 (barra
--                                 quem deve) E corretor/seed_do_corretor
--                                 continua 10, diretor/seed_do_outro continua 6,
--                                 corretor/orfas_do_seed continua 2 (deixa
--                                 passar quem deve).
--   node base-orfas.mjs         → fase 0 "classificadas DIFERENTE" 1 → 0;
--                                 fase 3 corretor de carteira 0 deixa de
--                                 devolver 470. A fase 2 (lead_visits) tem de
--                                 continuar IDÊNTICA: ela mede
--                                 can_access_commercial_lead, que não foi tocada.
--   node base-outras-tabelas.mjs → leads do corretor despenca; e os controles
--                                 do diretor (pipeline_stage_moves 104,
--                                 lead_copilots ~490, commercial_presence 2)
--                                 continuam iguais. Se o diretor cair para 0
--                                 junto, a correção quebrou o produto.
--
-- CUSTO: a policy de SELECT passa a chamar a função por LINHA, e nos casos que
-- não são liderança/dono/órfã ela abre CTE recursiva sobre profiles. Meça o
-- tempo de `select count(*) from leads` como corretor ANTES de dar por
-- encerrado. Se regredir, a saída conhecida é trocar as duas chamadas de
-- `can_view_commercial_profile` por um `= any((select private.<ids da minha
-- subárvore>()))` — função SEM argumento, que o Postgres avalia UMA vez por
-- consulta (InitPlan) em vez de uma vez por linha.
