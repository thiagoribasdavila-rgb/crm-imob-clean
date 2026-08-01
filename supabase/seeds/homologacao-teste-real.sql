-- =============================================================================
-- SEED DE TESTE REAL — ambiente de HOMOLOGAÇÃO apenas
-- =============================================================================
-- Projeto alvo: atlas-v3-homologacao (pozbrcsfthnhmnebfoxv)
-- NUNCA rodar em base com dado de cliente.
--
-- Por que este arquivo existe: a base de homologação tem o schema completo
-- (176 migrations) mas ZERO dado comercial. Quem loga vê todas as telas em
-- branco e não consegue julgar se o produto funciona. Este seed cria o mínimo
-- para exercitar os estados que o produto REALMENTE mede — não só "linhas na
-- tabela":
--
--   * SLA de primeiro contato VENCIDO  -> aciona o estado crítico do Kanban
--   * lead SEM próxima ação            -> aciona o estado de atenção
--   * leads QUENTES com score alto     -> aciona o estado de oportunidade
--   * funil inteiro povoado            -> o Kanban tem colunas com conteúdo
--   * ganhos e perdidos                -> relatórios e taxa de conversão
--
-- Todo registro é sintético e fica marcado com metadata->>'seed'.
-- Remoção completa no fim do arquivo.
-- =============================================================================

do $$
declare
  v_org   uuid := '7c8c71c1-e963-464c-be5c-ff8c7936f51a';  -- Atlas One
  v_b1    uuid := 'aa077aa4-28a7-49cb-98ea-dac8b2908a97';  -- corretor 1
  v_b2    uuid := 'ce402fcc-a668-4f83-96f2-975460151871';  -- corretor 2
  v_b3    uuid := '8bbdcc25-b410-4832-9f86-5277402ead86';  -- corretor 3
  v_seed  jsonb := '{"seed":"homologacao-teste-real"}'::jsonb;
begin
  -- Idempotente: limpa o seed anterior antes de recriar.
  delete from public.leads where organization_id = v_org and metadata->>'seed' = 'homologacao-teste-real';

  insert into public.leads (
    organization_id, name, email, phone, source, status, temperature,
    score, score_ia, budget_max, assigned_user_id, assigned_to,
    first_contact_due_at, next_action_at, created_at,
    data_quality_status, data_quality_percent, preferred_neighborhoods, metadata
  ) values
  -- ---------------------------------------------------------------- CRÍTICO:
  -- SLA de primeiro contato vencido. Sem próxima ação. É o pior estado
  -- possível e precisa aparecer em vermelho no bloco de prontidão.
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Marina Alencar','marina.alencar@exemplo.test','+5511970000001','meta_ads','novo','quente',
   82, 78, 850000, v_b1, v_b1, now() - interval '6 hours', null, now() - interval '2 days',
   'usable', 70, array['Vila Nova Conceição','Itaim Bibi'], v_seed),
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Rodrigo Nakamura','rodrigo.nakamura@exemplo.test','+5511970000002','portal_zap','novo','morno',
   61, 58, 620000, v_b2, v_b2, now() - interval '30 hours', null, now() - interval '3 days',
   'usable', 65, array['Pinheiros'], v_seed),
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Beatriz Salgado','beatriz.salgado@exemplo.test','+5511970000003','indicacao','novo','quente',
   88, 84, 1200000, v_b3, v_b3, now() - interval '3 hours', null, now() - interval '1 day',
   'complete', 92, array['Jardins'], v_seed),

  -- ------------------------------------------------------------- ATENÇÃO:
  -- Em atendimento, mas sem próxima ação marcada. Trava silenciosa do funil.
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Caio Ferrarezi','caio.ferrarezi@exemplo.test','+5511970000004','meta_ads','contato','morno',
   54, 51, 480000, v_b1, v_b1, now() - interval '4 days', null, now() - interval '8 days',
   'usable', 68, array['Moema'], v_seed),
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Larissa Bombonato','larissa.bombonato@exemplo.test','+5511970000005','google_ads','qualificacao','morno',
   57, 55, 540000, v_b2, v_b2, now() - interval '6 days', null, now() - interval '11 days',
   'usable', 72, array['Perdizes'], v_seed),

  -- --------------------------------------------------------- OPORTUNIDADE:
  -- Quentes, com ação marcada. É onde o corretor deve gastar o dia.
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Henrique Vasquez','henrique.vasquez@exemplo.test','+5511970000006','indicacao','qualificacao','quente',
   91, 89, 1450000, v_b3, v_b3, now() - interval '5 days', now() + interval '4 hours', now() - interval '9 days',
   'complete', 95, array['Vila Olímpia','Itaim Bibi'], v_seed),
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Priscila Damasceno','priscila.damasceno@exemplo.test','+5511970000007','meta_ads','visita','quente',
   86, 83, 980000, v_b1, v_b1, now() - interval '9 days', now() + interval '1 day', now() - interval '14 days',
   'complete', 90, array['Brooklin'], v_seed),
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Otávio Mendonça','otavio.mendonca@exemplo.test','+5511970000008','portal_vivareal','visita','morno',
   64, 62, 700000, v_b2, v_b2, now() - interval '12 days', now() + interval '2 days', now() - interval '17 days',
   'usable', 74, array['Santana'], v_seed),

  -- ------------------------------------------------------- FUNIL AVANÇADO:
  -- Proposta e contrato: alimentam forecast, comissão e SLA de proposta.
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Fernanda Quirino','fernanda.quirino@exemplo.test','+5511970000009','indicacao','proposta','quente',
   93, 90, 1650000, v_b3, v_b3, now() - interval '20 days', now() + interval '6 hours', now() - interval '26 days',
   'complete', 97, array['Alto de Pinheiros'], v_seed),
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Gustavo Aparício','gustavo.aparicio@exemplo.test','+5511970000010','meta_ads','proposta','morno',
   72, 70, 890000, v_b1, v_b1, now() - interval '24 days', now() + interval '3 days', now() - interval '30 days',
   'complete', 88, array['Campo Belo'], v_seed),
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Juliana Sarmento','juliana.sarmento@exemplo.test','+5511970000011','portal_zap','contrato','quente',
   95, 92, 2100000, v_b2, v_b2, now() - interval '31 days', now() + interval '2 days', now() - interval '38 days',
   'complete', 98, array['Jardim Paulista'], v_seed),

  -- ------------------------------------------------------------- FECHADOS:
  -- Ganho e perdido: sem eles, conversão e motivo de descarte ficam vazios.
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Ricardo Bittencourt','ricardo.bittencourt@exemplo.test','+5511970000012','indicacao','ganho','quente',
   97, 94, 1750000, v_b3, v_b3, now() - interval '48 days', null, now() - interval '55 days',
   'complete', 99, array['Higienópolis'], v_seed),
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Camila Peçanha','camila.pecanha@exemplo.test','+5511970000013','meta_ads','ganho','quente',
   94, 91, 1320000, v_b1, v_b1, now() - interval '60 days', null, now() - interval '68 days',
   'complete', 96, array['Vila Mariana'], v_seed),
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Vinícius Arruda','vinicius.arruda@exemplo.test','+5511970000014','google_ads','perdido','frio',
   28, 25, 350000, v_b2, v_b2, now() - interval '40 days', null, now() - interval '47 days',
   'incomplete', 42, array['Tatuapé'], v_seed),
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Estela Grinberg','estela.grinberg@exemplo.test','+5511970000015','portal_olx','perdido','frio',
   22, 19, 300000, v_b3, v_b3, now() - interval '52 days', null, now() - interval '59 days',
   'incomplete', 38, array['Mooca'], v_seed),

  -- --------------------------------------------------------- SEM DONO:
  -- Fila de distribuição: precisa existir para a tela de distribuição
  -- ter o que mostrar e para o gerente exercitar a atribuição.
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Anderson Kimura','anderson.kimura@exemplo.test','+5511970000016','meta_ads','novo','morno',
   49, 47, 560000, null, null, now() + interval '4 hours', null, now() - interval '3 hours',
   'usable', 60, array['Ipiranga'], v_seed),
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Sabrina Yoshida','sabrina.yoshida@exemplo.test','+5511970000017','portal_zap','novo','quente',
   79, 76, 910000, null, null, now() + interval '2 hours', null, now() - interval '1 hour',
   'usable', 66, array['Saúde'], v_seed),
  ('7c8c71c1-e963-464c-be5c-ff8c7936f51a','Teste · Leonardo Tanaka','leonardo.tanaka@exemplo.test','+5511970000018','indicacao','novo','morno',
   52, 50, 470000, null, null, now() + interval '7 hours', null, now() - interval '25 minutes',
   'usable', 58, array['Butantã'], v_seed);

  raise notice 'Seed aplicado: % leads sintéticos.', (
    select count(*) from public.leads
    where organization_id = v_org and metadata->>'seed' = 'homologacao-teste-real'
  );
end $$;

-- =============================================================================
-- REMOÇÃO COMPLETA (rollback) — apaga só o que este seed criou:
--
--   delete from public.leads
--   where organization_id = '7c8c71c1-e963-464c-be5c-ff8c7936f51a'
--     and metadata->>'seed' = 'homologacao-teste-real';
--
-- =============================================================================
