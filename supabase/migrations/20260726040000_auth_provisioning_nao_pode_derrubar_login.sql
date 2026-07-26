-- =============================================================================
-- O provisionamento automático de perfil não pode mais derrubar a autenticação
-- =============================================================================
--
-- SINTOMA MEDIDO EM 2026-07-26
-- POST /auth/v1/verify respondia HTTP 500 `unexpected_failure` com
-- "Database error updating user". Isso atinge o caminho de magiclink e o de
-- RECUPERAÇÃO DE SENHA — o mesmo endpoint. Login por senha seguia funcionando,
-- então nada parecia quebrado por fora.
--
-- CADEIA REAL, reproduzida em transação revertida contra a base de homologação:
--
--   1. O gatilho on_auth_user_created dispara em `update of email,
--      raw_user_meta_data` de auth.users — o que o GoTrue faz ao confirmar.
--   2. handle_new_auth_user faz upsert do perfil com
--      `on conflict (id) do update set organization_id = excluded.organization_id`.
--      Para um usuário QUE JÁ EXISTE, isso o move para a organização
--      'atlas-default' — que é vazia e só existe porque este gatilho a cria.
--   3. O supervisor do usuário continua na organização real. O gatilho de RBAC
--      private.validate_commercial_hierarchy então levanta, corretamente,
--      `supervisor_outside_organization_or_inactive`.
--   4. O `exception when others` deveria absorver isso. Mas ele executa
--      `insert into user_provisioning_failures (...) values (..., pg_catalog.sqlerrm)`
--      e `sqlerrm` é VARIÁVEL de PL/pgSQL, não função: qualificar com schema faz
--      o Postgres lê-la como `tabela.coluna` e levantar
--      `42P01: missing FROM-clause entry for table "pg_catalog"`.
--      O erro dentro do tratador aborta o statement inteiro.
--   5. GoTrue recebe falha de banco e devolve 500.
--
-- O passo 4 é o mais grave dos dois: enquanto ele existir, QUALQUER erro dentro
-- do provisionamento vira queda de autenticação, e não um registro na tabela de
-- falhas. A tabela nunca recebeu uma linha sequer — não porque nada falhou, mas
-- porque falhar em registrar a falha derrubava tudo antes.
--
-- O QUE MUDA
--   a. Perfil que já existe NUNCA é reprovisionado. O gatilho preenche apenas
--      lacunas (e-mail e nome), e não toca em organização, papel ou ativação.
--      Mudar a organização de alguém é decisão administrativa, não efeito
--      colateral de confirmar um e-mail.
--   b. O tratador de exceção passa a registrar com `sqlerrm` sem qualificação e
--      dentro de bloco próprio: se até o registro falhar, o gatilho ainda
--      devolve `new`. Autenticação não cai por causa de log.
--   c. Usuário novo entra na organização operacional quando ela é identificável
--      — pelo claim organization_id do app_metadata, ou porque existe uma única
--      organização além da 'atlas-default'. Antes, todo usuário novo nascia numa
--      organização vazia, sem lead nenhuma, e o primeiro deles virava ADMIN dela.
--   d. A 'atlas-default' só é criada quando não há nenhuma outra opção. Deixa de
--      ser efeito colateral de cada cadastro.
--
-- O QUE NÃO MUDA
-- A doutrina de cadastro continua a mesma de 20260722070000: o primeiro perfil
-- de uma organização nasce admin e ativo, porque alguém precisa entrar e
-- configurar o resto; todos os demais nascem INATIVOS, aguardando um
-- administrador posicioná-los na hierarquia. Nada nasce ativo por conta própria.
--
-- Nenhum dado é reescrito por esta migration. Nenhum perfil existente foi
-- movido pela falha (a 'atlas-default' está com zero perfis), então não há o
-- que reparar — só o que impedir de acontecer.
-- =============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  perfil_existente public.profiles%rowtype;
  target_organization_id uuid;
  organizacao_reivindicada uuid;
  primeiro_perfil boolean;
  nome text;
begin
  -- ---------------------------------------------------------------------------
  -- Perfil já existente: completar lacuna, nunca reprovisionar.
  -- Este é o caminho de TODA confirmação de e-mail, magiclink e recuperação de
  -- senha. Era aqui que a organização do usuário era trocada por baixo dos panos.
  -- ---------------------------------------------------------------------------
  select * into perfil_existente from public.profiles where id = new.id;
  if perfil_existente.id is not null then
    update public.profiles
       set email = coalesce(email, new.email),
           full_name = coalesce(
             full_name,
             nullif(pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
           ),
           updated_at = pg_catalog.now()
     where id = new.id;
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('atlas_auth_profile_provisioning'));

  -- ---------------------------------------------------------------------------
  -- Onde este usuário nasce.
  -- 1º) organização declarada no app_metadata, se ela existir de fato;
  -- 2º) a única organização operacional, quando só há uma além da padrão;
  -- 3º) a 'atlas-default', criada só neste último caso.
  -- ---------------------------------------------------------------------------
  begin
    organizacao_reivindicada := nullif(new.raw_app_meta_data ->> 'organization_id', '')::uuid;
  exception when others then
    organizacao_reivindicada := null;
  end;

  if organizacao_reivindicada is not null then
    select id into target_organization_id
    from public.organizations where id = organizacao_reivindicada;
  end if;

  -- Só vale quando a resposta é inequívoca: com duas ou mais organizações
  -- operacionais não há como adivinhar qual é a certa, e adivinhar erraria calado.
  if target_organization_id is null then
    select o.id into target_organization_id
    from public.organizations o
    where o.slug is distinct from 'atlas-default'
      and (
        select pg_catalog.count(*) from public.organizations x
        where x.slug is distinct from 'atlas-default'
      ) = 1;
  end if;

  if target_organization_id is null then
    insert into public.organizations (name, slug, status)
    values ('Atlas AI', 'atlas-default', 'ACTIVE')
    on conflict (slug) do update set status = 'ACTIVE'
    returning id into target_organization_id;
  end if;

  if target_organization_id is null then
    select id into target_organization_id
    from public.organizations where slug = 'atlas-default' limit 1;
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
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- Registrar a falha não pode ser capaz de derrubar a autenticação: por isso
    -- o insert vive no próprio bloco, com saída silenciosa. `sqlerrm` é variável
    -- de PL/pgSQL e NÃO aceita qualificação de schema — foi exatamente esse
    -- detalhe que transformou todo erro de provisionamento em HTTP 500.
    begin
      insert into public.user_provisioning_failures (user_id, email, error_message)
      values (new.id, new.email, sqlerrm);
    exception when others then
      null;
    end;
    return new;
end;
$function$;

comment on function public.handle_new_auth_user() is
  'Provisiona perfil de usuário novo. Nunca reprovisiona perfil existente e nunca deixa uma falha própria derrubar a autenticação.';

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
grant execute on function public.handle_new_auth_user() to service_role;
