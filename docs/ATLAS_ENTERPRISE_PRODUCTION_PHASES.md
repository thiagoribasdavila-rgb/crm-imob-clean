# Atlas Enterprise 1.0 — fases até produção

Objetivo: transformar a base V1/V2/V3/Atlas 2030 em uma plataforma utilizável por incorporadoras, com evolução controlada e sem regressões.

## Fase 1 — Production Foundation
- autenticação e bootstrap do primeiro administrador
- variáveis de ambiente e readiness
- migrations aplicadas
- health, logs, rate limit e auditoria
- fluxo crítico: login → lead → pipeline

**Critério de saída:** ambiente abre, autentica e grava dados reais com isolamento por organização.

## Fase 2 — Design System Next Generation
- tokens visuais e tipografia
- componentes premium consistentes
- estados de loading, vazio, erro e sucesso
- responsividade desktop/mobile
- acessibilidade e contraste

**Critério de saída:** nenhuma tela crítica usa estilo isolado ou componente improvisado.

## Fase 3 — Operating System Shell
- sidebar orientada por domínio
- topbar contextual
- command palette global
- pesquisa e atalhos
- navegação recente e ações rápidas

**Critério de saída:** qualquer ação principal é alcançada em poucos segundos sem navegar por múltiplos menus.

## Fase 4 — Command Center Executivo
- KPIs comerciais em tempo real
- forecast, VGV, estoque, campanhas e tarefas
- alertas e decisões prioritárias
- visão por incorporadora, lançamento e equipe

**Critério de saída:** o diretor entende o estado da operação e as próximas decisões em uma única tela.

## Fase 5 — Sales Operation
- Lead 360
- deduplicação, score e timeline
- pipeline com SLA e forecast
- clientes, tarefas, agenda e propostas
- trilha completa de conversão

**Critério de saída:** a equipe comercial consegue operar o dia inteiro sem planilhas paralelas.

## Fase 6 — Launch Commerce OS
- incorporadoras, empreendimentos, unidades e tabelas
- salas de lançamento
- reservas e bloqueio de concorrência
- políticas comerciais, descontos e comissões
- portais de gestor e parceiros

**Critério de saída:** um lançamento pode ser configurado, distribuído, vendido e acompanhado dentro do Atlas.

## Fase 7 — Growth Layer
- conversas omnichannel
- campanhas, criativos e atribuição
- aprovações humanas
- Meta e WhatsApp
- automações governadas

**Critério de saída:** marketing e atendimento compartilham dados e resultados com o comercial.

## Fase 8 — Intelligence Layer
- Digital Twins
- Decision Engine
- Recommendation Engine
- memória institucional
- simulações e forecast
- agentes com aprovação e auditoria

**Critério de saída:** toda recomendação é explicável, rastreável e ligada a uma ação operacional.

## Fase 9 — Enterprise Reliability
- testes unitários, integração e E2E
- observabilidade e alertas
- filas, retries e dead-letter queue
- backup e restauração
- testes de isolamento multiempresa
- LGPD e resposta a incidentes

**Critério de saída:** falhas são detectadas, contidas e recuperáveis sem perda silenciosa de dados.

## Fase 10 — Production Launch
- homologação de todos os fluxos críticos
- testes de carga e segurança
- deploy Vercel
- domínio e monitoramento
- piloto com operação real
- documentação e treinamento

**Critério de saída:** Atlas Enterprise 1.0 operando com usuários reais e indicadores monitorados.

## Regra de evolução
Cada correção deve entregar: correção definitiva, melhoria estrutural, melhoria de UX, observabilidade e proteção contra regressão.