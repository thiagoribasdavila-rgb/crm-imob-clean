# ATLAS 10X — Fase 4/24

## Identidade de ambiente, tenant e RBAC remoto

### Resultado executivo

A arquitetura de autenticação do aplicativo está correta na parte mais
importante: a sessão é validada pelo Supabase Auth, mas a autorização é
resolvida no servidor a partir de `public.profiles`. O cliente não escolhe
papel nem organização.

A homologação ainda não pode ser liberada. O snapshot remoto histórico não
possuía usuários Auth, organizações ou perfis; entretanto, ele precede a
criação validada do primeiro administrador e da organização Atlas One. A
auditoria encontrou três grupos de risco ainda relevantes: dois modelos locais
de hierarquia, fallback de organização e grants privilegiados não comprovados.

### O que já está sólido

- `getUser` valida a sessão no servidor;
- `profiles.id` é procurado pelo ID do usuário autenticado;
- perfil e organização precisam estar ativos;
- `user_metadata` não participa da autorização;
- redirecionamento pós-login bloqueia destino externo e loop de autenticação;
- recuperação usa cookie HTTP-only, SameSite estrito e senha forte;
- todas as 177 tabelas públicas observadas têm RLS habilitado.

### Divergência 1 — dois modelos de hierarquia

O Atlas possui duas definições concorrentes:

1. cadeia comercial completa:
   `director → superintendent → manager → broker`;
2. cadeia compacta oficial:
   `director_decisor → director/manager → broker`.

A cadeia completa corresponde ao produto desejado: diretoria enxerga a
operação, superintendência enxerga gerentes, gerência enxerga corretores e cada
corretor enxerga sua carteira. A Fase 4 torna esse modelo o contrato canônico,
mantendo `access_role` como pacote de acesso e `commercial_role` como escopo
hierárquico.

### Divergência 2 — mudança isolada de `access_role`

O trigger criado antes da migration oficial reage a:

`organization_id, commercial_role, reports_to, active`

A migration posterior passou a validar `access_role`, mas não recriou o
trigger incluindo essa coluna. Uma alteração feita somente em `access_role`
pode, portanto, escapar da revalidação da hierarquia.

A proposta
`scripts/sql/phase-004-canonical-rbac-hardening-proposal.sql` corrige a lista
de colunas e restaura a cadeia completa. Ela termina em `rollback` e não foi
aplicada.

### Divergência 3 — fallback de tenant

Existem dois resolvers de identidade com fallback por
`ATLAS_DEFAULT_ORGANIZATION_ID` em homologação. O mecanismo foi útil durante
o diagnóstico antigo, mas pode colocar um perfil ativo sem vínculo explícito
dentro do tenant padrão.

O gate passa a exigir `profiles.organization_id`. O fallback precisa ser
removido ou convertido em provisionamento explícito antes de usuários reais.

### Evidência remota histórica

| Item | Observado |
|---|---:|
| Usuários Auth | 0 |
| Sessões Auth | 0 |
| Organizações | 0 |
| Perfis | 0 |
| Roles | 7 |
| Permissions | 39 |
| Role permissions | 99 |
| Tabelas públicas com RLS | 177/177 |
| Tabelas com RLS e sem policy | 12 |
| Funções security-definer executáveis por anon | 3 |
| Funções security-definer executáveis por authenticated | 10 |

RLS habilitado não prova autorização por tenant: policies, grants e funções
privilegiadas precisam ser revisados em conjunto.

O snapshot é de **23/07/2026**. O gate agora exige evidência de no máximo um
dia e não pode declarar ausência do administrador atual enquanto não houver uma
nova leitura somente leitura, sanitizada e sem credenciais expostas.

### Contrato canônico

| Papel comercial | Supervisor | Visibilidade |
|---|---|---|
| Diretor | nenhum | organização |
| Superintendente | diretor | gerentes e corretores abaixo |
| Gerente | superintendente | corretores abaixo |
| Corretor | gerente | leads próprios |

### Ordem segura para a próxima etapa

1. reconciliar o histórico de migrations da Fase 3;
2. ensaiar a proposta RBAC em banco descartável;
3. revisar policies, grants e funções security-definer;
4. remover o fallback implícito de tenant;
5. confirmar a organização e o administrador já criados por leitura atual;
6. provisionar usuários reais adicionais por Auth com perfis explícitos;
7. testar diretor, superintendente, gerente e corretor;
8. provar bloqueio entre dois tenants;
9. só então promover a identidade do ambiente.

Nenhuma conta, policy, migration ou organização remota foi alterada.
