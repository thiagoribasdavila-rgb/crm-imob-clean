-- private.can_view_lead(uuid) — a função fantasma da cadeia de migrations.
--
-- ONZE migrations do repositório invocam private.can_view_lead(lead_id) nas suas
-- policies de RLS (fases 71, 72, 73, 74, 75, 76, 78, 83, 86, 87 e a de contrato de
-- dado canônico), somando 15 pontos de chamada — e NENHUMA a define. Verificado por
-- `git grep -l "create .*function private.can_view_lead"` = zero resultados.
--
-- Não é problema de ordem de aplicação: a função não existe em lugar algum do repo.
-- O efeito é uma cascata que trava o cluster inteiro de qualificação, memória
-- comercial, atribuição, comportamento e todo o pipeline preditivo — porque
-- conversion_dataset_versions nasce na fase 76, que depende dela, e as fases 77 e 80
-- dependem da 76. Um único objeto ausente derruba 10 migrations, 8 tabelas e 5 RPCs.
--
-- SEMÂNTICA. A irmã que existe, private.can_access_commercial_lead(organization_id,
-- owner_id), definida em 20260716212459, já responde "o usuário atual pode ver um
-- lead desta organização pertencente a este responsável?" — cobrindo diretor, dono do
-- lead, cadeia hierárquica (can_view_commercial_profile) e o caso do lead sem dono
-- para superintendente. can_view_lead recebe apenas o id, então a única coisa que
-- falta é buscar organização e responsável do lead e delegar. É um wrapper, não uma
-- regra de acesso nova: nenhuma permissão é criada aqui.
--
-- COLUNA DE RESPONSÁVEL. A tabela leads convive com duas: assigned_to (canônica —
-- 203 usos nas migrations, 127 no código, e é a que TODAS as policies existentes
-- passam para can_access_commercial_lead) e assigned_user_id (legada, herdada do
-- schema de produção). O coalesce preserva o comportamento para linhas antigas que só
-- têm a legada preenchida, sem alargar acesso: se ambas forem nulas, o parâmetro vai
-- nulo e a função irmã só libera para superintendente, exatamente como já fazia.
--
-- LINGUAGEM. plpgsql, não sql, de propósito: com `language sql` o Postgres valida o
-- corpo no momento do CREATE, e o corpo referencia leads.assigned_to, coluna que
-- nasce numa migration posterior a esta. plpgsql valida em execução. É a mesma lição
-- que a fundação já registrou em private.current_organization_id().

create or replace function private.can_view_lead(target_lead_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  permitido boolean;
begin
  if target_lead_id is null then
    return false;
  end if;

  select private.can_access_commercial_lead(
           l.organization_id,
           coalesce(l.assigned_to, l.assigned_user_id)
         )
    into permitido
    from public.leads l
   where l.id = target_lead_id;

  -- Lead inexistente devolve false, nunca null: uma policy com null não filtra,
  -- ela simplesmente não libera a linha — mas ser explícito evita que um USING
  -- combinado com `or` interprete o null de forma surpreendente.
  return coalesce(permitido, false);
end;
$$;

revoke all on function private.can_view_lead(uuid) from public, anon;
grant execute on function private.can_view_lead(uuid) to authenticated, service_role;
