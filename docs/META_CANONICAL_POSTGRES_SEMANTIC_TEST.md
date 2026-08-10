# ATLAS AI OS — Fase 12/100

## Semântica PostgreSQL efêmera e gate de staging

Esta fase executa o rascunho canônico da Fase 11 em um PostgreSQL 17.5 efêmero, com dados totalmente sintéticos. O objetivo é comprovar a lógica real do SQL sem conectar ao Supabase remoto, sem ler clientes e sem alterar produção.

## Resultado comprovado

O teste passou em **6 cenários** e **41 verificações**:

- backfill de nomes e papéis;
- preservação do responsável, projeto e score;
- correção do score legado quando o zero canônico mascarava um valor válido;
- sincronização legado → canônico em insert e update;
- sincronização canônico → legado em insert e update;
- rejeição de conflito de responsável, projeto e score;
- rejeição de score fora de 0–100;
- RLS habilitado nas tabelas protegidas;
- privilégios explícitos para `authenticated`, bloqueio de `anon` e proteção do papel do usuário;
- função de compatibilidade como `security invoker`;
- trava obrigatória de staging;
- rollback integral para papel desconhecido e divergências de dados.

Cada cenário usa um banco novo em memória. Nenhum nome, telefone, e-mail, lead, campanha ou identificador real participa dos testes.

## O que este teste significa

O SQL deixou de ser apenas uma simulação JavaScript ou auditoria textual. A migration foi interpretada e executada por um motor PostgreSQL real em WASM, inclusive com PL/pgSQL, triggers, constraints, grants, políticas e transações.

Isso comprova a semântica central da reconciliação e reduz fortemente o risco técnico do rascunho.

## O que este teste não significa

Este resultado **não libera** a migration para staging ou produção. O ambiente não contém o stack completo do Supabase e, portanto, ainda faltam:

1. Supabase Auth com JWT real de diretor, gerente e corretor;
2. isolamento RLS entre duas organizações;
3. validação de `anon`, `authenticated` e `service_role` pela Data API;
4. `supabase db lint` e suíte pgTAP;
5. fingerprint do schema remoto isolado;
6. backup, restauração e rollback no clone de staging;
7. aprovação humana do mapa de hierarquia;
8. aprovação do diretor e da revisão de segurança.

RLS estar habilitado é diferente de provar o isolamento de tenant com uma sessão autenticada. Essa fronteira permanece explícita e bloqueada.

## Por que o stack completo não foi iniciado

O Supabase CLI está fixado na versão 2.109.1, porém o computador desta execução não possui Docker, OrbStack, Colima ou Podman disponível. A documentação oficial do Supabase exige um runtime compatível com Docker para iniciar o stack local completo.

Não foi criado um `config.toml` improvisado e a fila histórica de migrations não foi executada às cegas. Isso evita falsa segurança e alterações fora do escopo.

## Gate fail-closed

O novo preflight somente aprova staging se todas as evidências existirem ao mesmo tempo:

- execução efêmera aprovada;
- stack Supabase isolado;
- seed sanitizado;
- backup e restauração;
- fingerprint conferido;
- migration promovida somente após revisão;
- lint e pgTAP;
- RLS/JWT e isolamento entre tenants;
- fronteiras de privilégios;
- Data API;
- rollback;
- aprovações humana e de segurança.

Ausência de qualquer item bloqueia o gate. Mesmo uma evidência completa de staging nunca autoriza produção automaticamente.

## Governança preservada

- Nenhum banco remoto foi acessado ou alterado.
- Nenhuma migration foi aplicada ou promovida para `supabase/migrations/`.
- Nenhum segredo foi lido.
- Nenhum evento real foi enviado à Meta.
- Nenhuma campanha, orçamento ou público foi alterado.
- Nenhum build foi executado.

## Referências oficiais

- [Desenvolvimento local com Supabase](https://supabase.com/docs/guides/local-development)
- [Testes e lint pelo Supabase CLI](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Testes de banco com pgTAP](https://supabase.com/docs/guides/database/testing)
- [Grants explícitos para a Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

## Fase 13/100

Executar a homologação de RLS/JWT no stack Supabase isolado, com duas organizações e usuários sintéticos. Somente essa fase poderá provar o isolamento real necessário antes de qualquer staging remoto.
