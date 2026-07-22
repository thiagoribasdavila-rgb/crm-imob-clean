-- Conserta o provisionamento automático de perfil no cadastro de usuário.
--
-- A função public.handle_new_auth_user, de 20260711224500, falha em TODOS os três
-- passos contra o schema real. Descoberto ao montar um teste de isolamento, não por
-- relato: cada tentativa de inserir organização ou perfil batia num erro diferente.
--
--   1. `insert into organizations (name, slug, plan, active)` — a coluna `plan` não
--      existe, e `active` é GERADA a partir de (status = 'ACTIVE'), então não aceita
--      valor. Duas falhas na mesma linha.
--   2. `on conflict (slug) do update set active = true, updated_at = now()` — mesmo
--      problema em `active`, e `organizations` sequer tem `updated_at`.
--   3. `insert into profiles (...)` sem `access_role`, que é NOT NULL sem default, e
--      sem `commercial_role`, que o gatilho private.validate_commercial_hierarchy()
--      exige explicitamente (`raise exception 'rbac_role_required'`).
--
-- O efeito era invisível e por isso perigoso: a função tem `exception when others` que
-- apenas registra em user_provisioning_failures e devolve `new`. Ou seja, o usuário
-- nascia no Auth, o perfil NÃO era criado, e ninguém via erro — o mesmo padrão de falha
-- silenciosa que já apareceu no `catch` mudo do TypeScript e na RLS sem policy.
--
-- DECISÃO DE PRODUTO, e ela não é acidental: quem é o segundo usuário?
--
-- O gatilho de RBAC só dispensa supervisor no caminho executivo (access_role 'admin' ou
-- 'director_decisor', com commercial_role 'director' e reports_to nulo). Qualquer outro
-- papel exige um supervisor válido e ativo — que o cadastro automático não tem como
-- adivinhar. Mas o gatilho também tem uma saída explícita: perfil inativo retorna cedo,
-- sem validar cadeia comercial.
--
-- Então: o PRIMEIRO perfil da organização nasce admin/director e ativo, porque alguém
-- precisa conseguir entrar e configurar o resto. Todos os seguintes nascem
-- INATIVOS, aguardando um administrador colocá-los na hierarquia e ativar. Isso
-- satisfaz o gatilho de RBAC sem inventar um supervisor, e é a doutrina do produto
-- aplicada ao cadastro: nada nasce ativo por conta própria.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  primeiro_perfil boolean;
  nome text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('atlas_auth_profile_provisioning'));

  insert into public.organizations (name, slug, status)
  values ('Atlas AI', 'atlas-default', 'ACTIVE')
  on conflict (slug) do update set status = 'ACTIVE'
  returning id into target_organization_id;

  if target_organization_id is null then
    select id into target_organization_id
    from public.organizations
    where slug = 'atlas-default'
    limit 1;
  end if;

  select not exists (
    select 1 from public.profiles where organization_id = target_organization_id
  ) into primeiro_perfil;

  nome := coalesce(
    nullif(pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(pg_catalog.split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuário Atlas'
  );

  insert into public.profiles (
    id, organization_id, full_name, email,
    role, access_role, commercial_role, reports_to, active
  ) values (
    new.id,
    target_organization_id,
    nome,
    new.email,
    case when primeiro_perfil then 'admin' else 'broker' end,
    case when primeiro_perfil then 'admin' else 'broker' end,
    case when primeiro_perfil then 'director' else 'broker' end,
    null,
    -- Só o primeiro nasce ativo. Os demais aguardam um administrador posicioná-los
    -- na hierarquia — o gatilho de RBAC dispensa a validação de cadeia enquanto
    -- inativo, e assim ninguém entra sem alguém ter decidido.
    primeiro_perfil
  )
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        email = coalesce(excluded.email, public.profiles.email),
        updated_at = pg_catalog.now();

  return new;
exception
  when others then
    -- O registro da falha continua, mas agora ele é a exceção e não a regra.
    insert into public.user_provisioning_failures (user_id, email, error_message)
    values (new.id, new.email, pg_catalog.sqlerrm);
    return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
grant execute on function public.handle_new_auth_user() to service_role;

-- A reconciliação sofria dos mesmos defeitos e por isso nunca recuperou ninguém.
create or replace function public.reconcile_auth_profiles()
returns table (processed integer, remaining_failures integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  processed_count integer := 0;
begin
  insert into public.organizations (name, slug, status)
  values ('Atlas AI', 'atlas-default', 'ACTIVE')
  on conflict (slug) do update set status = 'ACTIVE'
  returning id into target_organization_id;

  -- Reconciliação nunca ativa ninguém: ela só devolve a existência do perfil. Ativar
  -- é ato de administrador, e misturar as duas coisas transformaria um conserto de
  -- consistência numa concessão silenciosa de acesso.
  insert into public.profiles (
    id, organization_id, full_name, email,
    role, access_role, commercial_role, reports_to, active
  )
  select
    u.id,
    target_organization_id,
    coalesce(
      nullif(pg_catalog.btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
      nullif(pg_catalog.split_part(coalesce(u.email, ''), '@', 1), ''),
      'Usuário Atlas'
    ),
    u.email,
    'broker', 'broker', 'broker', null, false
  from auth.users u
  left join public.profiles p on p.id = u.id
  where p.id is null
  on conflict (id) do nothing;

  get diagnostics processed_count = row_count;

  update public.user_provisioning_failures f
  set resolved_at = pg_catalog.now()
  where resolved_at is null
    and exists (select 1 from public.profiles p where p.id = f.user_id);

  return query
  select processed_count, count(*)::integer
  from public.user_provisioning_failures
  where resolved_at is null;
end;
$$;

revoke all on function public.reconcile_auth_profiles() from public, anon, authenticated;
grant execute on function public.reconcile_auth_profiles() to service_role;
