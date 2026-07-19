# ATLAS V3 — prontidão operacional sobre a base atual

Data da auditoria: 17/07/2026  
Organização operacional: `8523bec1-1bef-4395-92ee-7458becc9b3f`

## Diagnóstico confirmado

O produto e o banco estão ativos. Os números zerados observados na homologação não significavam ausência de dados: algumas telas ainda consultavam diretamente relações e colunas do modelo canônico V3 que não existem no schema legado atualmente publicado.

Base real reconciliada:

- 417 leads operacionais;
- 16.733 leads frias protegidas com status `arquivado`;
- 3 projetos no cadastro legado `projects`;
- 2 tarefas no cadastro legado `tasks`;
- 4 perfis vinculados à organização operacional;
- administrador ativo e organização com status `ACTIVE`.

## Correções aplicadas

- O contexto autenticado resolve perfil e organização no servidor depois de validar o token, evitando que uma política RLS incompleta interrompa o pós-login.
- A autorização continua vinculada exclusivamente ao `auth.user.id`; não usa metadados editáveis do usuário.
- Clientes 360 usa leads como fonte compatível quando a tabela `customers` existe, mas possui colunas legadas.
- Vendas usa leads como oportunidades somente quando `opportunities` não existe, sem duplicar registros.
- O Command Center V3 usa contagens de leads e projetos legados quando as relações canônicas estão ausentes.
- Tarefas aplica fallback tanto para `due_at → due_date` quanto para `updated_at → created_at`.
- Qualidade de dados e gêmeo digital usam `score_ia → score` pelo adapter.
- Portal da incorporadora usa `projects → developments` pelo adapter.
- Mensagens técnicas de relações ausentes foram removidas das telas corrigidas.

## Contrato de compatibilidade

```text
profiles + organizations
          ↓
resolver autenticado no servidor
          ↓
leads / projects / tasks (base atual)
          ↓
adapters safe-v2-v3
          ↓
Pipeline / Clientes / Projetos / Tarefas / Vendas / Relatórios
```

Os adapters são somente de leitura e tradução, exceto nos fluxos que já possuem fallback explícito de gravação. Nenhuma tabela foi apagada, renomeada ou recriada.

## Situação dos módulos

| Módulo | Base atual | Situação |
| --- | --- | --- |
| Login e contexto | `profiles` + `organizations` | Operacional |
| Leads e pipeline | `leads` + adapter de score/responsável | Operacional |
| Clientes 360 | `customers` ou fallback `leads` | Operacional |
| Projetos | `projects` como `developments` | Operacional em compatibilidade |
| Tarefas e agenda | `tasks.due_date` como `due_at` | Operacional em compatibilidade |
| Vendas | leads como oportunidades | Leitura operacional; comissão avançada depende do modelo canônico |
| Inteligência | cálculo local quando `ai_insights` não existe | Operacional sem custo externo |
| Distribuição avançada | funções e tabelas V3 | Pendente da migração canônica |

## Pendências que não devem ser mascaradas

As tabelas `developments`, `opportunities` e `ai_insights` ainda não existem no banco publicado. A compatibilidade permite operar e homologar os dados atuais, mas não substitui a migração canônica necessária para:

- comissão e recebimentos completos por oportunidade;
- estoque, reserva e VGV por unidade;
- distribuição ponderada por projeto;
- persistência e histórico de insights de IA;
- recursos avançados que dependem de funções SQL V3.

Essas estruturas devem entrar por migrations versionadas, com backup e homologação, nunca por alteração destrutiva ou criação manual improvisada.

## Validações executadas

- `npm run typecheck`
- `npm run lint`
- consulta real de totais por organização;
- confirmação de isolamento das 16.733 leads arquivadas;
- confirmação do vínculo do administrador com a organização ativa.

## Próxima promoção

1. Publicar o pacote desta correção em homologação.
2. Testar login, Command Center, Pipeline, Clientes, Projetos, Tarefas, Agenda, Vendas e Relatórios.
3. Executar backup do banco.
4. Aplicar somente as migrations canônicas ainda ausentes.
5. Repetir smoke test e liberar funcionalidades avançadas uma a uma.
