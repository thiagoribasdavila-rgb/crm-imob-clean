# ATLAS 10X — Fase 5/24

## Provisionamento controlado do tenant de homologação

### Resultado desejado

Preparar um único caminho seguro para criar a organização de homologação,
convidar os acessos oficiais, vincular `auth.users` a `public.profiles` e montar
a hierarquia:

`director → superintendent → manager → broker`

Esta fase **não cria** tenant, usuário, profile ou migration. Ela transforma o
provisionamento em um pacote verificável e bloqueado por padrão.

## O que a auditoria encontrou

Há três comportamentos concorrentes:

1. `reset-official-auth-rbac.mjs` é reversível e começa em dry-run, mas ainda
   usa a cadeia compacta diretor → gerente → corretor;
2. `bootstrap-admin.mjs` cria um administrador e usa exclusão compensatória do
   usuário Auth se o profile falhar;
3. migrations históricas criavam automaticamente o tenant `atlas-default`,
   enquanto uma migration posterior remove esse gatilho.

O Supabase remoto ainda contém `user_provisioning_failures`, portanto o estado
real do gatilho de Auth precisa ser comprovado antes de qualquer convite.

## Contrato seguro

### Identidade

- `auth.users.id` é a chave primária do profile;
- autorização vem de `public.profiles`, resolvida no servidor;
- `user_metadata` não decide tenant, acesso ou papel;
- o segredo administrativo fica somente no servidor;
- nenhum nome, e-mail, senha ou segredo entra no manifesto versionado.

### Sequência

1. fixar o projeto remoto e o fingerprint da URL;
2. provar a paridade das migrations da Fase 3;
3. provar identidade, RBAC e isolamento da Fase 4;
4. revisar policies, grants e funções privilegiadas;
5. registrar backup e restauração testada;
6. criar ou resolver uma organização de homologação;
7. convidar ou resolver usuários Auth no servidor;
8. criar profiles usando os IDs do Auth;
9. vincular a hierarquia do pai para o filho;
10. testar paridade, papéis, tenant, login e recuperação;
11. registrar receipt sanitizado;
12. revogar permit e segredo temporário.

### Falha e rollback

- interromper no primeiro erro;
- revogar sessões antes de bloquear acesso;
- desativar profiles, sem apagar leads, tarefas, eventos ou histórico;
- não excluir usuário Auth;
- não excluir organização;
- exigir ensaio de rollback antes da operação real.

## Supabase 2026

A documentação atual confirma três pontos relevantes:

- convites administrativos devem ocorrer em ambiente confiável com secret key;
- `user_metadata` não é fonte segura de autorização;
- trigger de criação de profile pode bloquear o cadastro e precisa ser testado;
- tabelas novas podem não ser expostas automaticamente à Data API, e grants
  continuam separados de RLS.

Referências oficiais:

- https://supabase.com/docs/guides/auth/users
- https://supabase.com/docs/guides/auth/managing-user-data
- https://supabase.com/changelog?tags=breaking-change

## Por que permanece bloqueado

- a Fase 3 ainda não reproduz o histórico remoto;
- a Fase 4 ainda não tem organização, usuários ou profiles reais;
- há 12 tabelas com RLS sem policy;
- há 3 funções `security definer` executáveis por `anon`;
- o modelo local de hierarquia ainda é duplo;
- o reset oficial ainda não representa superintendent e manager separadamente;
- há dois entrypoints capazes de criar Auth;
- não existe binding local do projeto;
- não há backup/restauração, ensaio isolado, teste entre tenants ou aprovação
  humana.

## Saída desta fase

O arquivo
`config/atlas-10x-phase-005-tenant-provisioning.json` é o contrato canônico.
O comando `npm run atlas:tenant-provisioning:plan` apenas calcula o estado e
lista blockers. Ele não possui código de escrita remota.
