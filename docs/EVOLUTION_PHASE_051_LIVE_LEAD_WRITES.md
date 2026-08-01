# ATLAS AI OS — Fase 51/3000

## Objetivo

Restabelecer o ciclo operacional de criação, edição e histórico de leads usando exclusivamente o contrato presente no banco de homologação.

## Problema resolvido

A aplicação tentava chamar `create_lead_atomic`, gravar em `atlas_events`, escrever colunas V3 ausentes em `leads` e ler projetos de `developments`. Essas dependências não existem no banco ativo e faziam o cadastro ou o Lead 360 falhar depois de a interface abrir.

## Alterações realizadas

- cadastro passou a escrever nas colunas reais de `leads`;
- projeto passou a ser validado em `crm_projects`;
- score, temperatura, responsável, regiões e dormitórios são traduzidos para o contrato legado;
- duplicidade é verificada dentro da organização antes da gravação;
- timeline passou a usar `lead_events`, existente e vinculada à lead;
- Lead 360 consulta somente lead, eventos, tarefas, perfil e projeto existentes;
- edição atualiza o contrato real e registra o antes/depois no histórico;
- ações ainda sem infraestrutura respondem de forma explícita sem executar chamadas quebradas.

## Impacto operacional

O corretor volta a conseguir criar uma lead, abrir sua visão 360, editar o perfil e registrar uma interação sem gerar 404 de tabela ou função. A lead permanece com um único responsável e todo acesso continua limitado à organização autenticada.

## Risco identificado

O banco legado ainda não possui uma restrição única normalizada de telefone/e-mail. A verificação por aplicação reduz duplicidades, mas duas criações exatamente simultâneas ainda precisam de uma migration aditiva e homologada para garantia transacional.

## Checklist de validação

- [x] lint dos arquivos alterados;
- [x] TypeScript sem emissão e sem cache incremental;
- [x] nenhuma chamada a `create_lead_atomic` na rota ativa;
- [x] nenhuma escrita em `atlas_events` na rota ativa;
- [x] projeto conectado a `crm_projects`;
- [x] histórico conectado a `lead_events`;
- [x] nenhum build ou ZIP antecipado.

## Próxima etapa

Fase 52: resolver hierarquia comercial, papéis, escopo de equipe e presença sem consultar colunas ou funções ausentes.
