# Fase 018 — Validação por perfil

## Resultado

A experiência de navegação agora é validada para seis personas que cobrem os quatro papéis comerciais e os quatro perfis oficiais de acesso: administrador, diretor decisor, diretor comercial, superintendente, gerente e corretor.

## Correção encontrada

O menu lateral já filtrava módulos por perfil, mas a busca global montava o catálogo completo. Isso permitia que um corretor visse atalhos de gestão e diretoria, embora as APIs continuassem protegidas.

A regra foi centralizada e aplicada a:

- menu lateral;
- busca global;
- atalhos de contexto;
- dock móvel.

## Matriz comprovada

| Persona | Navegação | Comandos de contexto | Limite principal |
| --- | ---: | ---: | --- |
| Administrador | 20 | 6 | Administração integral |
| Diretor decisor | 18 | 6 | Estratégia sem gestão de usuários |
| Diretor comercial | 15 | 5 | Operação comercial |
| Superintendente | 15 | 5 | Estrutura comercial abaixo do seu escopo |
| Gerente | 15 | 5 | Próprio time |
| Corretor | 10 | 3 | Própria carteira |

## Segurança

- A navegação começa no perfil seguro de corretor até a confirmação do perfil oficial.
- O cache local preserva apenas dados de apresentação e não eleva permissões.
- Perfis legados sem `commercial_role` são normalizados para a hierarquia canônica, inclusive diretor decisor e administrador.
- A autorização continua no servidor por `requireAccessContext`, usando o usuário confirmado pelo Supabase e o perfil protegido por RLS.
- O teste desta fase não cria usuários, não altera dados reais e não executa ações comerciais.

## Limite de evidência

A matriz determinística prova a experiência e o contrato de autorização. Sessões humanas completas permanecem parte do roteiro de homologação operacional; esta fase não inventa evidência de login real nem altera contas para simulá-la.

A auditoria somente leitura do banco foi executada e bloqueada pelo código `42703`: a tabela `profiles` conectada ainda não possui todo o contrato V3 esperado. Nenhuma mutação foi realizada. Depois da aprovação e aplicação das migrations, devem ser executados `audit:runtime-schema` e `audit:auth-hierarchy` antes da homologação humana final.
