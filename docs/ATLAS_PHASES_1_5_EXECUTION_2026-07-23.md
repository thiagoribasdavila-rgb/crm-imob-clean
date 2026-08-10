# Atlas One — execução das fases 1 a 5

**Data:** 23/07/2026  
**Escopo:** linha de base, recuperação, paridade de schema, identidade/RBAC e
provisionamento controlado do tenant.

## Decisão executiva

As cinco fases foram executadas localmente sem escrita remota e sem apagar
dados. O código ativo passou em todos os gates da linha de base, mas a promoção
para um novo ZIP operacional continua bloqueada até que as evidências vivas do
Supabase sejam atualizadas e o procedimento de restauração seja comprovado.

O usuário administrador criado após a última captura não foi revalidado por
esta execução porque o workspace atual não contém
`NEXT_PUBLIC_SUPABASE_URL` e uma chave secreta Supabase server-side. O snapshot
sanitizado anterior, portanto, não deve ser usado para afirmar que o tenant
continua vazio.

## Fase 1 — linha de base operacional

**Status:** aprovada.

- 11 de 11 verificações de código aprovadas;
- testes de contrato: 13 de 13;
- TypeScript: aprovado;
- ESLint: aprovado;
- contratos de pipeline, CRM, dashboards, IA e integrações aprovados;
- nenhuma credencial foi exposta;
- build e pacote permaneceram reservados ao gate final.

## Fase 2 — recuperação e rollback

**Status:** estrutura aprovada; evidência operacional pendente.

- estratégia de rollback aponta para uma versão anterior do V3;
- o V2 legado não é aceito como rollback;
- histórico e identidades devem ser preservados;
- faltam recibo de restauração de banco e Storage, artefato anterior imutável,
  smoke autenticado e aprovação do diretor.

## Fase 3 — paridade de ambientes e schema

**Status:** auditoria aprovada; paridade viva bloqueada.

- alvo definido: `atlas-v3-homologacao`;
- ambiente legado separado;
- 126 migrations locais e 123 versões únicas;
- três colisões históricas de timestamp foram detectadas;
- duas migrations locais ainda não aparecem no ledger remoto sanitizado;
- RLS está habilitado nas tabelas públicas observadas;
- o inventário e o ledger remoto precisam ser recapturados antes de qualquer
  DDL.

## Fase 4 — identidade, tenant e RBAC

**Status:** contrato aprovado; prova viva pendente.

- autorização é resolvida por `public.profiles` no servidor;
- metadados editáveis do usuário não são fonte de autorização;
- hierarquia comercial prevista: diretor, superintendente, gerente e corretor;
- o perfil precisa estar ativo e vinculado a uma organização ativa;
- faltam recaptura do administrador criado, matriz de acesso por papel,
  negação entre tenants e revisão dos grants de funções privilegiadas.

## Fase 5 — provisionamento controlado

**Status:** plano aprovado; execução remota corretamente bloqueada.

- sequência idempotente organização → Auth → profile → hierarquia;
- sem exclusão de usuário ou histórico;
- segredos permanecem somente no servidor;
- repetição resolve registros existentes antes de reconciliar;
- rollback desativa acesso sem destruir dados;
- criação de novos usuários permanece bloqueada até os gates das fases 2 a 4.

## Gates locais executados

- `npm test`: 13/13;
- `npm run typecheck`: aprovado;
- `npm run architecture:canonical`: 12 entidades canônicas;
- `npm run contracts:data`: 8 normalizadores e 9 etapas canônicas;
- `npm run consolidation:30:check`: aprovado;
- rotas ativas: 287 arquivos;
- páginas ativas: 137;
- rotas legadas isoladas: 137;
- contrato V30: 94/94;
- grants Supabase: 63/63;
- hardening Supabase: 17/17;
- contrato Next 16: aprovado.

## Bloqueadores para a próxima execução

1. configurar localmente, sem enviar ao chat:
   `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SECRET_KEY`;
2. atualizar os scripts de auditoria que ainda aceitam apenas
   `SUPABASE_SERVICE_ROLE_KEY`, mantendo compatibilidade temporária;
3. recapturar o schema, o usuário administrador, o profile e a organização;
4. provar backup e restauração do banco e do Storage;
5. reconciliar o ledger antes de aplicar qualquer migration;
6. executar a matriz real de login e visibilidade;
7. somente depois executar build único e gerar o ZIP.

## Próximo passo autorizado

Executar a fase 6 de hardening e, paralelamente, preparar a recaptura somente
leitura do ambiente real. Nenhum novo ZIP deve ser promovido como operacional
antes dessas evidências.
