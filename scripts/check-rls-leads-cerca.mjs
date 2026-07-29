#!/usr/bin/env node
/**
 * check-rls-leads-cerca.mjs — GUARDA CONTRA A REINCIDÊNCIA.
 *
 * A doença: `public.leads` tinha CINCO policies, todas PERMISSIVE, e uma delas
 * (`leads_org_access`, cmd=ALL) concedia a ORGANIZAÇÃO INTEIRA. Policies
 * permissivas somam por OR, então essa engolia as quatro comerciais e um
 * corretor de carteira vazia lia, alterava e apagava lead de qualquer colega.
 *
 * Este script CONSULTA pg_policy NO BANCO — não grepa o .sql. Isso é
 * deliberado: neste projeto o repositório e o banco divergem (127 migrations
 * para 23 tabelas vivas), e um grep no arquivo aprova um banco doente.
 *
 * REPROVA se, em `public.leads`:
 *   1. existir QUALQUER policy PERMISSIVE com cmd=ALL;
 *   2. existir policy PERMISSIVE que compare organization_id sem passar pelo
 *      piso de carteira (`private.can_access_lead_row`);
 *   3. NÃO existir a cerca RESTRICTIVE de organização;
 *   4. existir policy PERMISSIVE que não chame `can_access_lead_row`.
 *
 * OS DOIS LADOS, verificados por execução em 2026-07-29 no banco de
 * homologação: sobre `leads` (já corrigida) os quatro contadores dão
 * 0/0/1/0 → APROVA; sobre `activities`, `customers` e `opportunities` (que
 * continuam doentes) o contador 1 dá 1 → REPROVARIA. A guarda distingue.
 *
 * COMO EXECUTAR: precisa de uma connection string de Postgres, porque
 * pg_catalog não é alcançável pelo PostgREST.
 *   DATABASE_URL=postgres://... node scripts/check-rls-leads-cerca.mjs
 * (aceita também ATLAS_PG_URL). SEM ela o script NÃO EXECUTA: imprime o SQL
 * exato e sai com 2 — ausência declarada, nunca um "aprovado" inventado.
 */
import postgres from "postgres";

const SQL_CENSO = `
with p as (
  select pol.polname,
         pol.polpermissive,
         pol.polcmd,
         coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
         coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as expr
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'leads'
)
select
  (select count(*) from p where polpermissive and polcmd = '*')                       as permissiva_cmd_all,
  -- SEM a escapatória "...e que não cite can_access_lead_row". Ela deixava
  -- passar, medido numa tabela de mentira, a forma mais natural de reintroduzir
  -- o vazamento: using ( can_access_lead_row(...) OR organization_id = <a minha
  -- org> ). A policy CITA o piso, então escapava dos quatro crivos — e
  -- devolvia as 11 linhas da tabela onde a curada devolvia 1.
  -- (Sem crase em lugar nenhum daqui: este SQL vive dentro de um template
  -- literal de JavaScript, e uma crase o fecha no meio.)
  -- Numa policy PERMISSIVE, a comparação de organization_id só ALARGA
  -- (permissivas somam por OR). O único lugar legítimo dessa comparação é a
  -- cerca RESTRICTIVE, contada logo abaixo.
  (select count(*) from p where polpermissive and expr like '%organization_id =%')      as permissiva_org_wide,
  (select count(*) from p where not polpermissive and polcmd = '*'
                                             and expr like '%organization_id =%')     as cerca_restritiva,
  -- pode_apagar_lead é a regra do DELETE: igual à de alcance, menos a cláusula
  -- de lead órfã. Aceitar as duas é obrigatório — exigir só can_access_lead_row
  -- reprovaria justamente o estado CORRETO.
  (select count(*) from p where polpermissive
                            and expr not like '%can_access_lead_row%'
                            and expr not like '%pode_apagar_lead%')                    as permissiva_sem_piso,
  (select count(*) from p)                                                            as total_policies;
`;

const url = process.env.DATABASE_URL || process.env.ATLAS_PG_URL || "";
if (!url) {
  console.error("RLS leads/cerca: NÃO EXECUTADO — falta DATABASE_URL (ou ATLAS_PG_URL).");
  console.error("pg_catalog não é alcançável pelo PostgREST; sem connection string não há como medir.");
  console.error("O SQL que este script roda:\n" + SQL_CENSO);
  process.exit(2);
}

const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10, prepare: false });
try {
  const [c] = await sql.unsafe(SQL_CENSO);
  const falhas = [];
  if (Number(c.permissiva_cmd_all) > 0)
    falhas.push(`${c.permissiva_cmd_all} policy PERMISSIVE com cmd=ALL — ela soma por OR e engole as comerciais`);
  if (Number(c.permissiva_org_wide) > 0)
    falhas.push(`${c.permissiva_org_wide} policy PERMISSIVE compara organization_id sem o piso de carteira`);
  if (Number(c.cerca_restritiva) !== 1)
    falhas.push(`cerca RESTRICTIVE de organização ausente (encontrei ${c.cerca_restritiva}, esperava 1)`);
  if (Number(c.permissiva_sem_piso) > 0)
    falhas.push(`${c.permissiva_sem_piso} policy PERMISSIVE não chama private.can_access_lead_row`);

  if (falhas.length) {
    console.error(`RLS leads/cerca: REPROVADO (${c.total_policies} policies em public.leads)\n- ${falhas.join("\n- ")}`);
    process.exit(1);
  }
  console.log(
    `RLS leads/cerca: aprovado — ${c.total_policies} policies em public.leads, ` +
    "1 cerca RESTRICTIVE de organização, 0 permissivas org-wide, todas as permissivas com piso de carteira.",
  );
} finally {
  await sql.end({ timeout: 5 });
}
