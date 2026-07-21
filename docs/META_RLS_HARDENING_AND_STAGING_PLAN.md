# ATLAS Meta — Fase 9/100

## Plano reversível de hardening RLS e staging isolado

Esta fase transforma os achados da auditoria em uma sequência executável **somente depois** da criação de um ambiente de staging isolado. Nenhuma alteração foi aplicada ao Supabase, nenhuma migration foi criada ou executada e a produção continua bloqueada.

O objetivo é corrigir segurança e hierarquia sem interromper o CRM e sem duplicar a estrutura existente.

## Resultado executivo

| Verificação | Resultado |
|---|---:|
| Plano ordenado | 10 ações |
| Ações com rollback | 10 de 10 |
| SQL de diagnóstico | catalog-only, `READ ONLY` e `ROLLBACK` |
| Migration de hierarquia existente localmente | sim |
| Hierarquia observada no remoto | não |
| Replay da migration antiga | proibido |
| Staging separado | ainda não disponível |
| Migration liberada | não |
| Produção liberada | não |

## Achado central: há drift, não ausência de trabalho

O repositório já contém uma base consistente para a hierarquia comercial:

- `commercial_role` e `reports_to` em `public.profiles`;
- helpers privados para escopo de perfis e leads;
- triggers de integridade da hierarquia;
- proteção dos campos de autorização;
- restrição de execução das funções server-only.

Porém, o snapshot remoto sanitizado da Fase 8 encontrou apenas `active`, `name`, `organization_id` e `role` em `public.profiles`. Também encontrou `assigned_user_id` em `public.leads`, enquanto a migration local de hierarquia usa `assigned_to`.

Portanto, **a migration antiga não é reaplicável com segurança**. A ação correta é gerar uma migration nova pelo Supabase CLI, baseada no fingerprint remoto e portando a regra validada para `assigned_user_id`.

## Sequência aprovada para staging

1. Criar um Supabase Branch ou projeto de staging separado, com credenciais próprias e seed sanitizado.
2. Capturar fingerprint de schema, policies, grants e assinaturas; confirmar backup restaurável.
3. Reconciliar o drift e gerar uma migration nova pelo Supabase CLI.
4. Instalar helpers no schema `private`, com `auth.uid()` explícito, referências qualificadas e `search_path` vazio.
5. Trocar as policies de `profiles` e `leads` por regras que combinem organização e hierarquia comercial.
6. Remover grants CRUD desnecessários de `anon` em mudança revisável separada.
7. Versionar a assinatura e o corpo exatos de `public.search_knowledge_chunks` antes de reduzir seu escopo.
8. Ativar proteção contra senhas vazadas na configuração do Supabase Auth e testar login/recuperação.
9. Executar os onze cenários RLS da Fase 8 e o rollback dry-run.
10. Submeter evidências ao Diretor e à revisão de segurança; só então preparar uma proposta separada para produção.

## Rollback seguro

| Mudança futura | Retorno previsto |
|---|---|
| Staging isolado | excluir o ambiente após preservar evidência sanitizada |
| Migration de hierarquia | rollback transacional antes do commit; depois do commit, restaurar policies e manter colunas aditivas dormentes quando removê-las puder perder dados |
| Helpers privados | restaurar policies anteriores antes de revogar/remover os helpers novos |
| Policies | recriar exatamente o snapshot pré-mudança dentro de transação |
| Grants | restaurar somente os grants anteriores, nunca um conjunto mais amplo |
| `search_knowledge_chunks` | restaurar definição e grants versionados anteriores |
| Proteção de senha | reverter a configuração apenas se login/recuperação regredir em staging, registrando a exceção |

Não haverá rollback destrutivo de dados comerciais.

## Função privilegiada de conhecimento

`public.search_knowledge_chunks` continua bloqueando a promoção porque:

- usa `SECURITY DEFINER`;
- está executável por `anon` e `authenticated`;
- não apresentou guarda explícita de `auth.uid()` no catálogo observado;
- usa `search_path` igual a `public, private`;
- sua assinatura e definição exatas ainda não estão versionadas no repositório.

O Security Advisor sinaliza que funções `SECURITY DEFINER` expostas a `anon` ou `authenticated` podem contornar a RLS. A correção não será inventada: primeiro será preservada a definição exata e confirmado o caminho de chamada do Copilot no servidor. Depois, a função poderá usar `search_path` seguro e execução limitada ao fluxo realmente necessário.

## SQL de auditoria, não de implantação

O arquivo `scripts/sql/meta-rls-hardening-proposal.sql` consulta apenas catálogos do PostgreSQL e:

- abre uma transação `READ ONLY`;
- não consulta linhas de `profiles`, `leads`, projetos ou campanhas;
- não cria, altera, remove ou concede objetos;
- termina em `ROLLBACK`;
- coleta as informações necessárias para a futura migration revisada.

Ele também não deve ser executado em produção. O preflight exige `staging_clone` e reprova qualquer evidência incompleta.

## Gates fail-closed

O comando abaixo testa o validador com cenários negativos, sem acessar o banco:

```bash
npm run meta:phase-009:preflight
```

O preflight rejeita:

- alvo de produção;
- staging não isolado ou com seed não sanitizado;
- backup ou fingerprint ausente;
- replay da migration antiga;
- assinatura desconhecida da função privilegiada;
- rollback não testado;
- proteção contra senhas vazadas desativada;
- evidência RLS ou aprovações ausentes;
- qualquer envio real à Meta ou alteração de campanha, orçamento e público.

Para visualizar o diagnóstico offline:

```bash
npm run meta:phase-009:audit
```

Para validar a integridade completa da fase:

```bash
npm run meta:phase-009:check
```

## Decisão

**Estado: plano concluído com bloqueios operacionais.** A Fase 9 reduz o risco e define a ordem correta, mas não autoriza migration, deploy ou evento real. O ambiente atual foi preservado.

## Próxima etapa — Fase 10/100

Criar o manifesto de reconciliação entre migrations locais e o schema remoto:

- identificar a última migration efetivamente refletida no remoto;
- separar migrations compatíveis, portáveis e obsoletas;
- resolver `assigned_to` × `assigned_user_id` sem duplicidade;
- consolidar o modelo Diretor → Superintendente → Gerente → Corretor;
- definir o conteúdo exato da futura migration gerada pelo CLI, ainda sem aplicá-la.

## Referências oficiais

- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Database Functions](https://supabase.com/docs/guides/database/functions)
- [Supabase — Security Definer executável por anon](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0028_anon_security_definer_function_executable)
- [Supabase — Security Definer executável por authenticated](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable)
- [Supabase — Branching](https://supabase.com/docs/guides/deployment/branching)
- [Supabase — Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)
- [Supabase — Password Security](https://supabase.com/docs/guides/auth/password-security)
