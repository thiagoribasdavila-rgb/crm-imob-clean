# ATLAS Meta — Fase 8/100

## Matriz de isolamento por perfil e gate de staging

Esta fase auditou, em modo somente leitura, as policies das quatro fontes canônicas do bridge Meta, as colunas necessárias à hierarquia comercial e os alertas atuais do Supabase Security Advisor. Nenhuma linha de lead, perfil, campanha ou projeto foi consultada. Nenhum usuário foi criado e nenhuma alteração foi aplicada ao banco.

O resultado é **verificado com bloqueios**: a fronteira por organização aparece nas policies, mas a hierarquia Diretor → Gerente → Corretor ainda não está representada nem comprovada no ambiente remoto atual.

## Resultado executivo

| Evidência | Resultado |
|---|---:|
| Projetos Supabase detectados | 1 |
| Projeto separado de staging | não detectado |
| Policies canônicas auditadas | 11 |
| Policies com helper e coluna de organização | 11 de 11 |
| Policies com helper de visibilidade de lead | 0 de 11 |
| Policies com `reports_to` | 0 de 11 |
| Policies com responsável/assignee | 0 de 11 |
| Cenários de isolamento executados | 0 de 11 |
| Alertas do Security Advisor | 3 |
| Isolamento runtime aprovado | não |
| Deploy liberado | não |

As onze policies usam `private.current_organization_id()` e `organization_id`. Isso é uma boa evidência estrutural da fronteira de tenant, mas não substitui teste com sessões reais. A ausência de `auth.uid()` diretamente nas policies não significa ausência de autenticação: o helper de organização já possui guarda de usuário. O problema é que as policies observadas não carregam predicados de hierarquia, subordinado ou responsável.

## Matriz obrigatória de acesso

| Perfil | Deve enxergar | Deve permanecer invisível | Situação atual |
|---|---|---|---|
| Anônimo | nada das fontes canônicas | todos os tenants e busca de conhecimento | não testado em runtime |
| Corretor | leads atribuídos a ele na própria organização | outros corretores e outros tenants | não codificado nas policies observadas |
| Gerente | leads da sua equipe na própria organização | outras equipes e outros tenants | não codificado nas policies observadas |
| Diretor | escopo comercial autorizado da própria organização | qualquer outro tenant | tenant observado; papel não comprovado |
| Serviço aprovado | gravações server-only necessárias | acesso pelo navegador e escrita direta autenticada | não testado em staging |

O template sanitizado contém onze cenários, incluindo leituras permitidas, leituras negadas, escrita Meta direta negada e chamadas à busca de conhecimento. O validador rejeita automaticamente evidência de produção, cenário ausente, linhas de outro tenant, leitura anônima, gravação direta, duplicidade ou artefato não sanitizado.

## Bloqueios encontrados

1. **Não existe um projeto separado de staging.** Apenas um projeto foi detectado. A matriz não será executada contra o único ambiente conhecido, pois os testes precisam de identidades e registros sintéticos isolados.
2. **A hierarquia remota está incompleta.** `public.profiles` expõe hoje apenas `active`, `name`, `organization_id` e `role` entre os campos relevantes. `commercial_role` e `reports_to` não foram encontrados.
3. **O helper `private.can_view_lead(uuid)` continua ausente.** Assim, as policies canônicas não demonstram a regra “corretor vê somente suas leads” nem a cadeia gerencial.
4. **O isolamento entre tenants não foi executado.** Uma policy correta no catálogo ainda pode falhar por grants, função privilegiada, configuração de sessão ou comportamento da Data API.

## Alertas adicionais do Security Advisor

O Advisor retornou três alertas atuais:

- `public.search_knowledge_chunks` é `SECURITY DEFINER` e possui execução para `anon`;
- a mesma função possui execução para `authenticated`;
- a proteção contra senhas vazadas está desabilitada.

A função usa `search_path` igual a `public, private`, não apresentou guarda explícita de `auth.uid()` nos metadados auditados e não foi localizada nas migrations versionadas do repositório. Há predicado de organização, mas isso sozinho não elimina a possibilidade de bypass criada por uma função privilegiada.

Este diagnóstico **não comprova vazamento** nem exploração. Ele comprova que existe uma superfície privilegiada que precisa de revisão, versionamento, revogação por menor privilégio e teste de isolamento antes da homologação. A correção deve ser proposta em migration reversível, revisada e aplicada primeiro no clone de staging.

O alerta de senhas vazadas também não impede o login atual, mas reduz a proteção contra reutilização de credenciais comprometidas. A configuração deve ser habilitada no Supabase Auth quando o plano contratado oferecer o recurso.

## Evidências reproduzíveis

Auditar o baseline sanitizado:

```bash
npm run meta:phase-008:audit
```

Executar os testes negativos do gate, sem conexão remota:

```bash
npm run meta:phase-008:preflight
```

Validar toda a fase:

```bash
npm run meta:phase-008:check
```

Quando existir um clone isolado, uma evidência sanitizada poderá ser validada de forma estrita:

```bash
node scripts/validate-meta-rls-staging-evidence.mjs --evidence caminho/da/evidencia.json --strict-ready
```

O modo estrito reprova enquanto qualquer cenário estiver ausente ou falhar.

## O que esta fase não fez

- não criou projeto, tenant, usuário ou lead de teste;
- não leu registros de negócio ou dados pessoais;
- não alterou grants, policies, funções ou tabelas;
- não criou nem aplicou migration;
- não utilizou credenciais no navegador;
- não enviou evento para a Meta;
- não alterou campanha, orçamento ou público;
- não executou build.

## Decisão

**A fronteira organizacional está presente em 11 de 11 policies, mas o isolamento por hierarquia está em 0 de 11 e não foi testado em runtime.** A produção permanece bloqueada para o bridge Meta e para qualquer alegação de isolamento completo.

## Próxima etapa — Fase 9/100

Preparar, sem aplicar, um plano SQL reversível para:

1. versionar e endurecer os helpers privados;
2. adicionar o contrato de hierarquia necessário ao ambiente remoto;
3. revogar execução anônima/autenticada desnecessária de funções privilegiadas;
4. endurecer `search_path` e exigir sessão/tenant válidos;
5. provisionar o roteiro do clone de staging e sua restauração;
6. manter migration, deploy e eventos reais como decisões separadas.

## Referências oficiais

- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase — Password security e leaked password protection](https://supabase.com/docs/guides/auth/password-security)
