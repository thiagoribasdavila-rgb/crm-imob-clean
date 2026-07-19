# Fase 024 — Eliminação segura de duplicidade na navegação

## Resultado

Sete conceitos que possuíam duas telas concorrentes agora têm um único destino principal. As URLs antigas continuam válidas como compatibilidade e encaminham o usuário para a experiência canônica, sem apagar rota, favorito ou link externo.

O encaminhamento usa `redirect` temporário do App Router, resultando em HTTP 307. A escolha é intencional: ainda não existe telemetria comportamental suficiente para declarar esses aliases permanentemente obsoletos.

## Consolidação aplicada

| Conceito | URL compatível | Destino principal |
| --- | --- | --- |
| Automações | `/automation` | `/automations` |
| Pipeline e Kanban | `/kanban` | `/pipeline` |
| Inteligência de criativos | `/creatives` | `/marketing/creatives` |
| Agentes especializados | `/agents` | `/atlas-v3/agents` |
| Inteligência operacional | `/ai-insights` | `/intelligence` |
| Analytics e relatórios | `/analytics` | `/reports` |
| Conversas | `/chat` | `/conversations` |

Cada alias agora contém somente a responsabilidade de compatibilidade. Consultas, estados e componentes paralelos foram retirados dessas páginas, evitando que o mesmo conceito apresente dados ou capacidades diferentes conforme o endereço acessado.

## Referências internas

Três referências ativas foram migradas para o destino oficial:

- o atalho de criativos da sidebar legada;
- o módulo de criativos na visão histórica V2;
- o teste autenticado de agentes.

O registro `lib/atlas/navigation-aliases.ts` passa a documentar a relação entre todos os aliases e seus destinos. Novas superfícies devem sempre apontar diretamente para a rota canônica.

## Jornada de integração

A lacuna identificada na Fase 023 foi corrigida. A página `/integrations` agora possui acesso contextual direto para `/integrations/health`, permitindo sair do catálogo de conexões para o diagnóstico operacional sem depender de busca ou conhecimento prévio da rota.

## Compatibilidade de build

As rotas CRM `/analytics` e `/kanban` deixaram a quarentena de build porque agora são páginas mínimas e seguras de redirecionamento. A antiga superfície conflitante `app/analytics` continua isolada, preservando a resolução única do App Router.

## Limite comportamental

Esta fase elimina duplicidade estrutural; ela não comprova adoção, taxa de clique, conclusão ou abandono. Os aliases somente poderão ser removidos em uma fase futura após telemetria real autorizada, auditoria de consumidores externos e plano de comunicação.

## Segurança e preservação

- Nenhum dado de aplicação foi lido ou alterado.
- Nenhuma variável de ambiente foi consultada.
- Nenhuma informação pessoal foi capturada.
- Nenhuma rota foi apagada.
- Nenhum redirecionamento permanente foi criado.
- Nenhuma decisão automática sobre pessoas foi executada.
- O bloqueio de staging da Fase 020 permanece ativo.

## Próxima fase

Fase 025 — **Arquitetura de navegação · Compactar informação**.

O próximo avanço deve reduzir repetição e densidade desnecessária nas superfícies de navegação, preservando as ações comerciais, a acessibilidade e a descoberta contextual comprovada nesta fase.
