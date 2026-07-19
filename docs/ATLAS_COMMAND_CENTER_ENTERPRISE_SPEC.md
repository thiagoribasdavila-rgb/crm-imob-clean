# ATLAS Command Center OS — Enterprise Specification

## Posicionamento

O Command Center é o cérebro operacional do Atlas: uma única superfície para entender o que aconteceu, por que aconteceu, qual ação humana deve ser tomada e qual impacto financeiro está associado. Não substitui julgamento executivo nem promete resultados; reduz tempo de análise e conecta evidência a execução.

## Experiência por perfil

| Perfil | Pergunta principal | Escopo | Decisões exibidas |
| --- | --- | --- | --- |
| Owner / administrador | Qual o maior risco e a maior oportunidade da empresa? | Organização inteira | receita, forecast, campanhas, incorporadoras, caixa e riscos |
| Diretor | Como aumentar vendas com os recursos atuais? | Estrutura comercial completa autorizada | pipeline, metas, conversão, liderança e orçamento recomendado |
| Superintendente | Qual gerente ou estrutura exige intervenção? | Gerentes subordinados e seus times | comparação com amostra mínima, carga, SLA e conversão |
| Gerente | Quem precisa de atenção agora? | Corretores diretamente subordinados | coaching, distribuição, SLA e higiene da carteira |
| Corretor | Qual cliente devo trabalhar primeiro? | Somente a própria carteira | prioridades, tarefas, visitas e próxima melhor ação |

Todo escopo é resolvido no servidor e reforçado por RLS. Preferências visuais locais nunca concedem acesso a dados.

## Camadas

1. **Business Intelligence Layer** — consolida CRM, vendas, tarefas, projetos, marketing e telemetria de IA.
2. **Real-Time Operation Center** — acompanha mudanças em leads e tarefas; indisponibilidade do canal não bloqueia atualização manual.
3. **AI Decision Engine** — produz briefing contextual e supervisionado; a rota determinística permanece disponível sem provedor externo.
4. **Opportunity Radar** — prioriza intenção, SLA, esquecimento, ausência de responsável e risco de perda.
5. **Revenue Forecast Engine** — calcula pipeline bruto e ponderado apenas com valor e probabilidade registrados.
6. **Sales Performance Engine** — mede carga, contatos, visitas, propostas, ganhos e conversão com amostra mínima.
7. **Marketing Revenue Center** — conecta investimento, leads, qualificação, visitas, vendas, receita e ROAS.
8. **Project Intelligence** — reúne estoque, VGV, leads, velocidade, materiais e risco por empreendimento/incorporadora.
9. **Atlas Copilot Central** — responde usando o snapshot visível e contexto governado.
10. **Learning Engine** — aprende com resultados estruturados, sem armazenar conversas brutas ou executar ações externas sozinho.

## Contrato de cada insight

Cada insight deve conter:

- evidência observável;
- causa observada ou indicação explícita de que a causa é desconhecida;
- recomendação acionável;
- responsável sugerido;
- prazo;
- impacto financeiro medido ou marcado como indisponível;
- nível de confiança e tamanho da amostra;
- link para o registro de origem;
- indicação de aprovação humana.

É proibido apresentar correlação como causalidade, previsão como garantia ou ausência de dados como resultado zero confirmado.

## Métricas principais

### Comercial

- leads recebidos, ativos, quentes e sem responsável;
- SLA de primeiro contato e follow-up;
- visitas, propostas, ganhos e conversão;
- velocidade por etapa e envelhecimento do pipeline;
- pipeline bruto, forecast ponderado e VGV ganho.

### Equipe

- presença e disponibilidade;
- carga ativa por corretor;
- ações atrasadas e carteira sem próxima ação;
- conversão com amostra mínima;
- ranking explicável, nunca usado para decisão automática de pessoas.

### Marketing

- investimento, CPL, qualificados, visitas, vendas, receita e ROAS;
- atribuição preservando fonte e janela;
- campanha só recebe recomendação decisória com amostra suficiente;
- nenhuma alteração de orçamento é automática.

### Projetos e financeiro

- estoque, VGV, reservas, vendas e velocidade;
- comissões a receber, vencidas e sem regra configurada;
- materiais atuais, vencidos e pendentes de homologação.

## Fonte única da verdade

- Supabase/Postgres como registro operacional;
- adaptadores de compatibilidade V2→V3 somente na leitura;
- identificadores únicos para lead, projeto, campanha, usuário e venda;
- eventos e decisões auditáveis;
- deduplicação sem exclusão silenciosa;
- base histórica fria isolada do pipeline até aprovação.

## Segurança e permissões

- RLS em tabelas expostas;
- `service_role` somente no servidor;
- hierarquia validada no servidor;
- corretor vê apenas sua carteira;
- gerente vê apenas subordinados diretos;
- diretoria vê o escopo organizacional autorizado;
- ações de alto impacto exigem confirmação e trilha de auditoria;
- nenhuma chave ou log bruto chega ao navegador.

## IA e memória

- provedor configurado não significa provedor operacional;
- AI Health Center exige teste real registrado;
- prompts com PII usam apenas rota confiável autorizada;
- pesquisa externa não recebe PII;
- memória comercial é estruturada e exclusiva por lead;
- ações externas, transferências, campanhas e mensagens exigem aprovação humana;
- custo, tokens e latência são medidos quando disponíveis.

## Mobile — Command Center de bolso

Ordem de prioridade:

1. ação mais urgente;
2. alerta de SLA;
3. próximo compromisso;
4. oportunidade de maior impacto;
5. acesso rápido ao Lead 360 e Copilot.

Tabelas extensas viram filas e cards; ações têm áreas de toque amplas; detalhes executivos ficam progressivamente revelados.

## Roadmap Enterprise

| Fase | Entrega | Gate |
| --- | --- | --- |
| 1 | Auditoria e fonte da verdade | métricas reconciliadas |
| 2 | Arquitetura visual e briefing decisório | desktop/mobile aprovados |
| 3 | Camada de dados | tenant e RLS comprovados |
| 4 | Indicadores executivos | números rastreáveis |
| 5 | Decision Engine | recomendações explicáveis |
| 6 | Marketing Intelligence | receita atribuída com amostra |
| 7 | Revenue Forecast | método e confiança visíveis |
| 8 | Personalização por perfil | nenhuma ampliação de acesso |
| 9 | Tempo real | reconexão e fallback testados |
| 10 | Enterprise | homologação por perfil e restauração comprovada |

## Critério de aprovação

- Thiago administra a empresa sem cruzar planilhas;
- Senna identifica decisões comerciais prioritárias;
- Diego encontra rapidamente quem precisa de intervenção;
- cada corretor recebe uma fila própria e explicável;
- marketing conecta investimento a receita sem atribuição inventada;
- IA antecipa risco com evidência, revisão humana e custo medido;
- todos consultam a mesma fonte da verdade dentro do próprio escopo;
- nenhuma tela apresenta número técnico, erro de banco ou previsão não comprovada como fato.
