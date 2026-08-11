# V3000 limpo — Fase 2/16: inventário canônico de rotas

Finalidade: separar a superfície publicada da quarentena legada e registrar,
com evidência reproduzível, quais rotas devem ser mantidas, redirecionadas ou
ocultadas antes da consolidação física.

## Resultado executivo

| Medida | Resultado |
|---|---:|
| Arquivos de rota rastreados | 449 |
| Páginas | 275 |
| Rotas de API | 174 |
| Arquivos ativos no build | 268 |
| Páginas ativas | 95 |
| APIs ativas | 173 |
| Arquivos isolados pela quarentena | 181 |
| Destinos usados pela navegação | 29/29 ativos |
| Destinos canônicos do menu | 19/19 ativos |
| Colisões de URL ativas | **0** |
| Colisões existentes apenas no código isolado | 17 |
| Redirects ativos | 2 |
| Aliases governados | 7 |

O contrato publicado está coerente: nenhuma URL ativa possui duas páginas e
nenhuma ação visível aponta para uma página inativa. A dispersão está no código
histórico isolado, não na superfície que o Next.js recebe durante o build.

O inventário integral está em
`docs/evidence/V3000_PHASE_02_ROUTE_INVENTORY.json`. Ele registra arquivo, URL,
tipo, estado ativo, quarentena, navegação, redirect, métodos HTTP, colisões e
decisão proposta para todos os 449 arquivos.

## Método compatível com Next.js 16

O inventário segue as convenções do App Router da versão instalada:

- `page.*` publica página e `route.*` publica endpoint;
- route groups, como `(crm)`, não entram na URL;
- slots `@...` não entram na URL;
- segmentos privados `_...` não são públicos;
- segmentos interceptados são normalizados sem alterar a URL pública;
- `proxy.ts` é a fronteira de sessão atual;
- `next.config.ts` não contém redirects nem rewrites ocultos.

O script usa apenas arquivos rastreados pelo Git. Não acessa Supabase, variáveis
de ambiente, segredos ou dados de clientes.

## Navegação canônica preservada

| Domínio | Rotas publicadas |
|---|---|
| Operação | `/dashboard`, `/leads`, `/pipeline`, `/tasks`, `/calendar`, `/activity` |
| Comercial | `/customers`, `/developments`, `/leads/import`, `/ai-dashboard` |
| Gestão | `/brokers`, `/distribution`, `/sales`, `/reports`, `/revenue-engine` |
| Diretoria | `/users`, `/external-sales`, `/integrations`, `/settings` |

Todos os 19 destinos possuem uma única página ativa.

## Rotas de apoio preservadas

As rotas abaixo não são duplicatas do menu. Elas são destinos contextuais ou
etapas de fluxos reais e permanecem ativas:

| Uso | Rotas |
|---|---|
| Criação e contexto comercial | `/leads/new`, `/properties`, `/marketing`, `/conversations`, `/decision-center` |
| Ações especializadas | `/developments/materials`, `/leads/deduplication`, `/integrations/health`, `/settings/ai`, `/settings/team` |

## Redirects ativos

| Origem | Destino | Decisão |
|---|---|---|
| `/leads/filters` | `/leads` | manter redirect compatível |
| `/marketing` | `/marketing/campaigns` | manter entrada contextual até a consolidação do menu |

Não há redirect ou rewrite configurado no `next.config.ts`. O redirecionamento
de sessão continua exclusivamente em `proxy.ts`.

## Fronteira pública preservada

As rotas públicas declaradas são `/`, `/login`, `/forgot-password`,
`/reset-password`, `/setup` e `/auth/callback`. `/setup` também está excluída do
matcher do proxy, preservando o bootstrap já corrigido. Esta fase não executou
bootstrap nem alterou autenticação.

## Aliases e decisões para a Fase 3

| Conceito | Alias legado | Destino declarado | Estado factual | Ação segura |
|---|---|---|---|---|
| Automação | `/automation` | `/automations` | origem e destino isolados | remover do contrato de alias; não publicar |
| Pipeline | `/kanban` | `/pipeline` | origem isolada; destino ativo | manter apenas `/pipeline` |
| Criativos | `/creatives` | `/marketing/creatives` | origens isoladas; destino ativo | manter apenas o destino canônico |
| Agentes | `/agents` | `/atlas-v3/agents` | origem e destino isolados | remover do contrato de alias; não publicar |
| Inteligência | `/ai-insights` | `/intelligence` | origem e destino isolados | remover do contrato de alias; não publicar |
| Relatórios | `/analytics` | `/reports` | origens isoladas; destino ativo | manter apenas `/reports` |
| Conversas | `/chat` | `/conversations` | origem isolada; destino ativo | manter apenas `/conversations` |

Nenhum alias possui origem e destino simultaneamente ativos. Portanto, a Fase
3 pode limpar o contrato de navegação sem trocar uma implementação funcional
por outra.

## Colisões históricas isoladas

As 17 colisões existem somente ao considerar arquivos que o build já coloca em
quarentena:

`/`, `/ai-dashboard`, `/analytics`, `/analytics/conversion`,
`/analytics/enterprise`, `/analytics/funnel`, `/analytics/leads`,
`/analytics/sales`, `/analytics/source`, `/behavior-model`, `/creatives`,
`/dashboard`, `/decision-engine`, `/global-brain`, `/marketing`,
`/revenue-engine` e `/sales`.

As maiores fontes de dispersão isolada são 54 rotas antigas sob `(crm)`, nove
sob `(andromeda)`, oito sob `(ai)`, oito sob `(automation)` e oito sob
`app/analytics`. Nenhuma delas colide na superfície ativa.

## Decisão de consolidação

| Classificação | Arquivos | Regra |
|---|---:|---|
| Manter | 266 | página/API ativa, sem colisão e sem redirect direto |
| Redirecionar | 2 | compatibilidade explícita com destino ativo |
| Ocultar | 181 | quarentena legada; não participa do build |
| Revisar por colisão ativa | 0 | não existe bloqueio atual |

“Ocultar” nesta fase não significa apagar. A remoção física só ocorrerá quando
a Fase 3 provar que não há import, link, teste ou contrato operacional
dependente do arquivo.

## Provas automatizadas

O contrato `tests/contracts/v3000-clean-consolidation-phase-02-route-inventory.test.mjs`
valida:

- integridade entre resumo e inventário;
- zero colisão ativa;
- método HTTP em toda API ativa;
- 100% dos destinos de navegação ativos;
- ausência de duas implementações ativas por alias;
- fronteira pública e exceção de `/setup`;
- ausência de leitura de dados e segredos.

O arquivo de evidência é determinístico: duas execuções sobre o mesmo commit
devem produzir o mesmo SHA-256.

## Alterações operacionais

- banco remoto: nenhuma;
- migrations: nenhuma;
- usuários, organização e perfis: nenhuma;
- autenticação e bootstrap: nenhuma;
- páginas ou APIs publicadas: nenhuma;
- ZIP e deploy: não gerados nesta fase.

## Critério de saída da Fase 2

- [x] todas as páginas e APIs rastreadas;
- [x] menu canônico e ações contextuais cruzados com o App Router;
- [x] redirects e fronteira de sessão registrados;
- [x] aliases classificados;
- [x] colisões ativas descartadas por prova;
- [x] legado separado da superfície publicada;
- [x] decisões `manter`, `redirecionar` e `ocultar` registradas;
- [x] inventário reproduzível e sem dados sensíveis.

## Próxima fase

**Fase 3/16 — consolidação da navegação e dos aliases:** remover referências
inativas do contrato, centralizar os caminhos oficiais e provar que menu,
atalhos, links estáticos, redirects e testes apontam para uma única rota por
função. Rotas de apoio usadas por fluxos reais serão preservadas.
