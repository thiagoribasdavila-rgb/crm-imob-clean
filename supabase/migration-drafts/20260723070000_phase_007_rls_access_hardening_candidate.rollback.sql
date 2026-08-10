-- ATLAS 10X - Fase 7/24
-- Runbook de rollback para uma futura migration aprovada.
--
-- O candidato principal já termina em ROLLBACK. Este arquivo não inventa os
-- privilégios anteriores: a restauração real só pode ser gerada a partir do
-- snapshot de ACL capturado no clone isolado imediatamente antes do ensaio.

do $phase_007_rollback_guard$
begin
  if current_setting('app.atlas_rls_rehearsal_environment', true) is distinct from 'isolated_clone' then
    raise exception 'phase_007_isolated_clone_required';
  end if;

  if current_setting('app.atlas_phase_007_acl_snapshot_id', true) is null then
    raise exception 'phase_007_acl_snapshot_required';
  end if;

  raise exception 'phase_007_generate_rollback_from_approved_acl_snapshot';
end
$phase_007_rollback_guard$;
