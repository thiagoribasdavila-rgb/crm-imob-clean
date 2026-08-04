-- UMA UNICA NORMALIZACAO DE TELEFONE
--
-- DEFEITO MEDIDO EM PRODUCAO (pozbrcsfthnhmnebfoxv, 2026-08-02):
--
-- Existiam DOIS normalizadores de telefone que discordavam entre si:
--
--   1. private.apply_canonical_lead_contract  (BEFORE INSERT/UPDATE, fase 71)
--        digits := regexp_replace(phone,'\D','','g');
--        if length(digits) in (10,11) then digits := '55'||digits; end if;
--        new.phone_normalized := digits;          -- ex.: 11973364099 -> 5511973364099
--
--   2. private.enforce_unique_lead_identity    (AFTER INSERT/UPDATE OF phone)
--        normalized := regexp_replace(phone,'\D','','g');   -- SEM o prefixo 55
--        ... consulta lead_identity_registry por esse valor
--
-- A guarda de unicidade gravava DIGITOS CRUS; o produto (a tela de
-- duplicidades e a RPC de fusao) le phone_normalized, que tem o 55 na frente.
--
-- Consequencia medida: 18 de 488 leads ja estavam no registry sob um valor
-- diferente do que o produto le. E, por ENSAIO A SECO, 467 de 467 leads
-- testaveis aceitavam um SEGUNDO cadastro da MESMA pessoa: basta digitar o
-- mesmo numero no outro formato. A guarda procurava a chave no formato
-- digitado, nao achava, e liberava a insercao — enquanto phone_normalized
-- das duas leads ficava IDENTICO. Dois corretores, a mesma pessoa.
--
-- A CORRECAO NAO REPETE A FORMULA. Repetir a formula foi a causa do defeito.
-- A guarda passa a LER new.phone_normalized, que o contrato canonico ja
-- calculou no mesmo comando (o trigger do contrato e BEFORE e cobre a coluna
-- phone). Passa a existir UM unico normalizador no sistema.

-- ---------------------------------------------------------------------------
-- 1. Acorda o estado morto 'suspected'.
--    duplicate_state so tinha dois escritores reais: o DEFAULT da coluna
--    ('canonical') e a RPC de fusao ('merged'). NADA nunca escreveu
--    'suspected', embora o CHECK o permita desde a fase 72. Toda lead que
--    divide contato normalizado com uma lead mais ANTIGA passa a ser marcada,
--    e com isso aparece na tela /leads/deduplication, que ja esta montada.
-- ---------------------------------------------------------------------------
with mais_antiga as (
  select distinct on (organization_id, phone_normalized)
         organization_id, phone_normalized, id
    from public.leads
   where phone_normalized is not null and duplicate_state <> 'merged'
   order by organization_id, phone_normalized, created_at, id
),
repetidas_por_telefone as (
  select l.id
    from public.leads l
    join mais_antiga m
      on m.organization_id = l.organization_id
     and m.phone_normalized = l.phone_normalized
   where l.phone_normalized is not null
     and l.duplicate_state <> 'merged'
     and l.id <> m.id
),
mais_antiga_email as (
  select distinct on (organization_id, email_normalized)
         organization_id, email_normalized, id
    from public.leads
   where email_normalized is not null and duplicate_state <> 'merged'
   order by organization_id, email_normalized, created_at, id
),
repetidas_por_email as (
  select l.id
    from public.leads l
    join mais_antiga_email m
      on m.organization_id = l.organization_id
     and m.email_normalized = l.email_normalized
   where l.email_normalized is not null
     and l.duplicate_state <> 'merged'
     and l.id <> m.id
)
update public.leads set duplicate_state = 'suspected'
 where id in (select id from repetidas_por_telefone
              union
              select id from repetidas_por_email)
   and duplicate_state = 'canonical';

-- ---------------------------------------------------------------------------
-- 2. Reconstroi o registry de telefone na MESMA forma que o produto le.
--    Delete + insert (e nao update) porque a unicidade e verificada linha a
--    linha durante um UPDATE, e a reescrita em massa poderia colidir de forma
--    transitoria mesmo com o conjunto final valido.
--    A lead mais ANTIGA de cada chave fica dona do registro: assim a guarda
--    bloqueia as PROXIMAS, nao a original.
-- ---------------------------------------------------------------------------
delete from public.lead_identity_registry where identity_type = 'phone';

insert into public.lead_identity_registry (organization_id, identity_type, identity_value, lead_id)
select distinct on (l.organization_id, l.phone_normalized)
       l.organization_id, 'phone', l.phone_normalized, l.id
  from public.leads l
 where l.phone_normalized is not null
   and l.duplicate_state <> 'merged'
 order by l.organization_id, l.phone_normalized, l.created_at, l.id;

-- ---------------------------------------------------------------------------
-- 3. A guarda passa a ler o valor ja normalizado pelo contrato canonico.
--    MUDANCA DE COMPORTAMENTO DECLARADA: antes a guarda registrava qualquer
--    telefone com 10 digitos ou mais (inclusive lixo de 20 digitos). Agora
--    registra exatamente o que o contrato aceita como telefone (10 a 15
--    digitos apos normalizar), porque phone_normalized e nulo fora disso.
-- ---------------------------------------------------------------------------
create or replace function private.enforce_unique_lead_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare existing_lead uuid;
begin
  -- Fonte unica: quem normaliza telefone e private.apply_canonical_lead_contract,
  -- trigger BEFORE que cobre a coluna phone e ja rodou neste mesmo comando.
  -- Recalcular aqui foi exatamente o que abriu a porta para a duplicata.
  if new.phone_normalized is null then
    delete from public.lead_identity_registry
     where lead_id = new.id and identity_type = 'phone';
    return new;
  end if;

  select lead_id into existing_lead
    from public.lead_identity_registry
   where organization_id = new.organization_id
     and identity_type = 'phone'
     and identity_value = new.phone_normalized;

  if existing_lead is not null and existing_lead <> new.id then
    raise exception 'Este contato já pertence a uma lead única no CRM.'
      using errcode = 'P0001';
  end if;

  delete from public.lead_identity_registry
   where lead_id = new.id
     and identity_type = 'phone'
     and identity_value <> new.phone_normalized;

  insert into public.lead_identity_registry (organization_id, identity_type, identity_value, lead_id)
  values (new.organization_id, 'phone', new.phone_normalized, new.id)
  on conflict (organization_id, identity_type, identity_value) do update
     set lead_id = excluded.lead_id;

  return new;
end;
$$;

comment on function private.enforce_unique_lead_identity() is
  'Guarda de identidade unica por telefone. LE new.phone_normalized; nao normaliza por conta propria. Ate 2026-08-02 mantinha uma segunda formula que ignorava o prefixo 55, e por isso a mesma pessoa entrava duas vezes trocando o formato do numero.';
