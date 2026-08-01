# ATLAS AI — Auditoria integral de produto

Data da revisão: 17 de julho de 2026  
Escopo: produto, experiência, operação, dados, IA, marketing, governança e prontidão comercial.

## Resumo executivo

O ATLAS já possui profundidade superior à de um CRM convencional: foram identificadas **270 páginas**, **136 rotas de API** e uma experiência principal com **19 destinos governados por perfil**. O principal risco deixou de ser ausência de funcionalidade. Agora é excesso de superfície, duplicidade conceitual e distância entre capacidade técnica e valor percebido.

Decisão de produto:

- manter os motores avançados e experimentais sem expô-los na rotina comum;
- tratar as 19 rotas da barra lateral como produto operacional oficial;
- orientar cada tela por uma pergunta comercial e uma próxima ação;
- comunicar resultado — conversão, receita, velocidade e previsibilidade — em vez de arquitetura;
- manter IA supervisionada até existir amostra real suficiente para promoção do modelo.

## Posicionamento oficial

**Atlas AI — Inteligência comercial para vender imóveis com previsibilidade.**

Promessa: conectar marketing, leads, equipe, projetos, dados e IA para reduzir perdas e transformar atividade comercial em receita mensurável.

## Matriz da experiência principal

| Área | Rota | Usuário principal | Pergunta comercial respondida | Situação | Prioridade |
|---|---|---|---|---|---|
| Command Center | `/dashboard` | Todos, com visão por papel | O que exige decisão agora? | Forte; visão por hierarquia existente | P0 |
| Leads | `/leads` | Corretor e gestão | Em quais oportunidades agir primeiro? | Forte; filtros, SLA e ações em massa | P0 |
| Pipeline | `/pipeline` | Comercial | Onde os negócios estão parando? | Forte; Kanban e movimento auditado | P0 |
| Tarefas | `/tasks` | Corretor | O que preciso concluir hoje? | Operacional com produtividade diária | P0 |
| Agenda | `/calendar` | Corretor | Quais compromissos protegem a venda? | Compatibilidade legada aplicada | P0 |
| Atividades | `/activity` | Gestão | O que aconteceu com cada cliente? | Útil; deve permanecer como histórico | P1 |
| Clientes 360 | `/customers` | Comercial | O que sabemos e o que falta saber? | Visão unificada com base real | P0 |
| Projetos | `/developments` | Comercial e diretoria | Qual projeto vende e qual exige ação? | Adapter legado e linguagem de receita | P0 |
| Reativação | `/leads/import` | Gestão e corretor | Qual base pode voltar a gerar conversa? | 16.733 registros isolados e governados | P1 |
| Copilot | `/ai-dashboard` | Todos | Qual é a melhor próxima ação? | Assistente supervisionado | P0 |
| Corretores | `/brokers` | Gestão | Quem precisa de ajuda ou capacidade? | Compatibilidade de perfis aplicada | P0 |
| Distribuição | `/distribution` | Gestão | Quem deve receber a próxima lead e por quê? | Explicável, hierárquico e auditável | P0 |
| Vendas | `/sales` | Gestão | Qual receita é provável e qual está em risco? | Forecast explicável | P0 |
| Relatórios | `/reports` | Diretoria | O resultado está melhorando? | Diário, semanal e mensal | P0 |
| Usuários | `/users` | Administração | Quem pode ver e fazer o quê? | RBAC e tenant | P0 |
| Vendas externas | `/external-sales` | Diretoria | O que perdemos e o que aprendemos? | Memória sem inflar receita própria | P1 |
| Integrações | `/integrations` | Diretoria | O que está realmente conectado? | Estados governados; ativação depende de teste real | P1 |
| Evolução V3 | `/atlas-v3` | Diretoria | Qual é a maturidade comprovada? | Gates e evidências | P1 |
| Configurações | `/settings` | Administração | Como governar operação e IA? | Acesso restrito | P1 |

## Auditoria por domínio

### Command Center

- Já separa corretor, gerente, superintendência e diretoria.
- Deve continuar priorizando exceções, riscos e próximas ações, não quantidade de gráficos.
- Calibragem e memória precisam ser apresentadas como cobertura de evidência, nunca como alegação de precisão.

### CRM e Lead 360

- A base canônica de leads, filtros comerciais, deduplicação, timeline e ações já existe.
- A interface deve manter no primeiro plano: projeto, intenção, score explicável, responsável e próxima ação.
- Dados técnicos, falhas de schema e identificadores internos não podem chegar ao usuário.

### Pipeline

- Etapas canônicas: Novo, Contato, Qualificação, Visita, Proposta, Negociação e Venda.
- Movimentação é auditada e deve preservar o estado anterior quando o servidor não confirmar.
- Prioridade inteligente deve ser explicável por SLA, temperatura, risco e ausência de próxima ação.

### Projetos e incorporadoras

- O módulo reúne portfólio, estoque, materiais, versões comerciais, fluxo de pagamento e estudo regional.
- A tela principal deve responder onde acelerar vendas e qual capital está parado.
- Materiais devem continuar separados por incorporadora, com busca única e validade visível.

### Marketing

- Meta, Andromeda, Google, YouTube e portais possuem arquitetura de integração e estados de governança.
- Uma credencial configurada não significa integração homologada.
- O indicador prioritário é receita atribuída e CAC, não apenas volume de leads.

### Inteligência artificial

- Há orquestração, contexto imobiliário, memória, guardrails, playbooks, qualificação e monitoramento.
- Operação real deve permanecer supervisionada: IA recomenda; pessoas aprovam ações sensíveis.
- A promoção de modelos depende de amostra, resultado observado, custo, latência, drift e equidade.

### Segurança e governança

- RBAC, hierarquia, isolamento por organização, RLS, proteção contra abuso e auditoria possuem verificações dedicadas.
- Segredos não entram no pacote de publicação.
- Produção permanece condicionada a backup, restauração testada e homologação autenticada.

## Achados e ações

| Achado | Risco | Ação aplicada/recomendada |
|---|---|---|
| 270 páginas para 19 rotas operacionais | Confusão e manutenção cara | Declarar a barra lateral como superfície oficial e manter laboratórios fora da rotina |
| Linguagem técnica na marca | Baixo valor percebido | Reposicionar para inteligência comercial e vendas previsíveis |
| Erros do banco chegando a algumas telas | Quebra de confiança | Padronizar mensagens seguras e registrar detalhes apenas no servidor |
| Capacidades de IA confundidas com IA ativa | Expectativa incorreta | Separar preparado, conectado, homologado e operacional |
| Métricas sem decisão associada | Dashboard decorativo | Cada bloco deve indicar leitura e ação recomendada |
| Base fria misturada à carteira | Poluição operacional | Manter os 16.733 contatos isolados até elegibilidade e consentimento |

## Roadmap de produto vendável

1. **Fundação vendável:** autenticação, usuários, Leads, Pipeline e Command Center estáveis.
2. **Resultado comercial:** prioridade, SLA, tarefas e Lead 360.
3. **Gestão executiva:** forecast, performance, metas e relatório de decisão.
4. **Marketing Intelligence:** atribuição real, CAC, ROI e aprendizado para Meta.
5. **Incorporadoras:** projetos, estoque, materiais, VGV e velocidade de vendas.
6. **Automação supervisionada:** WhatsApp oficial, follow-up e agentes.
7. **Escala SaaS:** onboarding, planos, múltiplas organizações e governança de consumo.

## Critérios de aceite comercial

- Corretor identifica sua próxima ação em menos de um minuto.
- Gerente identifica gargalos da equipe sem montar planilha.
- Diretor entende receita, risco e marketing em uma tela.
- Nenhuma falha técnica é mostrada ao usuário.
- Toda recomendação de IA mostra evidência e exige aprovação quando houver impacto humano, financeiro ou de mídia.
- Toda campanha pode ser ligada a lead, atendimento, venda e receita quando os conectores reais forem homologados.
