# ATLAS V30 — auditoria somente leitura do Supabase

**Data:** 23/07/2026  
**Ambiente selecionado:** `atlas-v3-homologacao`  
**Modo:** somente leitura, sem consulta a leads, usuários ou outros dados pessoais

## Resultado

O projeto correto de homologação foi localizado e aparece como saudável na
conexão do Supabase. A auditoria foi concluída com ferramentas específicas e
consultas estritamente de leitura. Nenhum dado foi alterado.

## O que está provado

- existem dois projetos Supabase, e o alvo correto é
  `atlas-v3-homologacao`;
- o alvo aparece como `ACTIVE_HEALTHY`;
- o PostgreSQL do alvo está na versão principal 17;
- a fonte local possui **126 migrations SQL** após o endurecimento preparado;
- as duas últimas migrations locais são
  `20260723090000_explicit_data_api_grants.sql` e
  `20260723143000_harden_internal_trigger_functions.sql`;
- o contrato local de grants explícitos passou em 63 de 63 controles;
- o contrato de endurecimento passou em 17 de 17 controles;
- a reconciliação local do ledger passou em 23 de 23 controles;
- todas as tabelas públicas retornadas pela auditoria estão com RLS ativo;
- o ledger remoto termina em `20260722044340` e ainda não contém as duas
  migrations locais de 23/07;
- o schema possui as estruturas V3, mas a base operacional está vazia:
  organizações, perfis, leads, tarefas, projetos, oportunidades, insights,
  eventos e integrações têm zero registros;
- somente as sementes de RBAC estão presentes: 7 papéis, 39 permissões e 99
  vínculos papel-permissão.

## Advisors e logs

O advisor de segurança retornou 25 itens:

- 12 informativos de tabelas com RLS sem política;
- 3 avisos críticos de funções internas `SECURITY DEFINER` executáveis por
  `anon`;
- 10 avisos de funções `SECURITY DEFINER` executáveis por `authenticated`.

As três funções expostas anonimamente são implementações de trigger, não RPCs
de produto:

- `apply_opportunity_commission_sla`;
- `refresh_commission_status`;
- `scaffold_project_intelligence`.

A migration `20260723143000_harden_internal_trigger_functions.sql` remove essa
superfície e fixa `search_path` vazio. Ela também remove três índices
comprovadamente duplicados, preservando os equivalentes canônicos.

O advisor de desempenho retornou 381 itens:

- 288 chaves estrangeiras sem índice;
- 20 políticas RLS com inicialização por linha;
- 51 índices ainda sem uso observado;
- 19 conjuntos de políticas permissivas sobrepostas;
- 3 índices duplicados.

Os logs PostgreSQL mostram erro recorrente
`column "subscription_id" does not exist`. O código V3 atual, incluindo os
workers, não contém referência a `subscription_id`. A origem é compatível com
uma versão implantada antiga, job externo ou cliente direto ainda conectado.
Não será criada coluna sem identificar a consulta e a tabela de origem.

## Última linha de base viva disponível

O relatório da fase 94 registrou, naquele momento:

- 23 tabelas públicas;
- 33 migrations aplicadas;
- todas as 23 tabelas públicas com RLS;
- base comercial presente;
- vários aliases legados ainda necessários;
- sete domínios físicos ausentes.

Essa linha de base é útil para comparação, mas está desatualizada diante das 126
migrations hoje existentes no workspace. Ela não autoriza aplicar a diferença
em lote.

## Validação local após a auditoria

- consolidação V30: aprovada;
- contratos Node 24/Next 16: aprovados;
- testes de contrato: 9/9;
- TypeScript: zero erro;
- ESLint: zero erro e zero warning;
- cadeia técnica F02–F16: 42/42;
- cadeia humana F17–F21: 32/32;
- inventário das 126 migrations reconciliado por SHA-256;
- auditoria atual de dependências: não executada, porque o ambiente de execução
  não conseguiu acessar o registry npm e a elevação solicitada foi recusada
  pela própria ferramenta. Isso é um bloqueio de evidência, não prova de
  vulnerabilidade nem aprovação das dependências.

## Pendências para mutação e teste real

1. produzir backup restaurável ou ensaio de restauração isolado;
2. reconciliar e aplicar as duas migrations locais pendentes;
3. identificar e desativar o consumidor antigo que consulta
   `subscription_id`;
4. provisionar a organização de homologação e os usuários via Auth Admin API;
5. importar dados reais somente com lote, deduplicação, consentimento e
   relatório de reconciliação;
6. fornecer no arquivo local, nunca no chat, a chave `service_role`, a conexão
   de banco e as credenciais dos quatro perfis E2E;
7. executar o fluxo completo navegador → API → banco → RBAC → Meta/CAPI.

## Decisão

O schema vivo permanece **não aprovado para mutation e release** até existir
backup/restauração comprovados. As correções estão prontas localmente, mas não
serão aplicadas no banco sem essa evidência.

O bloqueio não reduz a aprovação do código local; ele mantém corretamente abertas
as fases 27 e 28 e impede um ZIP sem prova operacional.
