# Atlas One — Fase 2: medição das jornadas críticas

Data: 04/08/2026

## Resultado

A Fase 2 está **instrumentada e aguardando amostra real**. O Atlas One agora registra, de forma agregada, tempo de permanência, cliques em controles acionáveis, navegações internas e intenções de envio por rota e papel comercial. Nenhuma métrica foi estimada e nenhum resultado comercial foi inferido a partir do código.

O ambiente local não apresentou credenciais operacionais disponíveis para consultar uma amostra autenticada. Por isso, mediana, p95, taxa de conclusão e abandono continuam `null` até a versão instrumentada receber uso real.

## O que passou a ser medido

| Sinal | O que responde | Limite da evidência |
|---|---|---|
| Entrada na rota | Quantas vezes a superfície foi aberta | Não comprova que a tarefa foi concluída |
| Navegação concluída | Tempo entre uma rota interna e outra | Comprova mudança de contexto, não persistência do resultado |
| Sessão da rota | Tempo e esforço agregado na tela | Não identifica qual registro foi usado |
| Cliques acionáveis | Quantos controles foram acionados | Não coleta texto, rótulo, valor ou conteúdo digitado |
| Intenção de envio | Quantos formulários foram submetidos | Não substitui a resposta da API nem o evento de domínio |
| Papel comercial | Se o fluxo pertence ao corretor, gerente, superintendente ou diretor | Não coleta nome, e-mail ou ID do usuário |

## Jornadas contratadas

| Jornada | Início | Destino | Meta | Prova disponível nesta fase |
|---|---|---|---:|---|
| Capturar nova lead | `/dashboard` | `/leads/new` | 2 cliques | Abertura do formulário e duração da navegação |
| Agir na prioridade | `/dashboard` | `/leads/:id` | 2 cliques | Abertura do Lead 360 e duração da navegação |
| Avançar oportunidade | `/pipeline` | `/pipeline` | 2 cliques | Esforço agregado na rota; conclusão exige evento de domínio |
| Localizar material vigente | `/developments` | `/developments/materials` | 3 cliques | Abertura da biblioteca; download exige evento de domínio |
| Distribuir lead | `/distribution` | `/distribution` | 2 cliques | Esforço agregado na rota; atribuição exige ledger de distribuição |
| Diagnosticar integração | `/integrations` | `/integrations/health` | 3 cliques | Abertura do health center; conexão exige teste real do provedor |

## Privacidade e segurança

- O navegador registra somente após existir sessão autenticada.
- A organização é obtida no servidor; o cliente não envia `organization_id`.
- IDs UUID e segmentos numéricos da URL são convertidos em `:id`.
- Query strings, textos, rótulos, campos, valores e conteúdo livre não são registrados.
- `Do Not Track` é respeitado.
- O evento é gravado no ledger `atlas_events`, protegido por RLS e sem acesso direto do navegador.
- A telemetria é não bloqueante: uma falha nunca interrompe o trabalho comercial.

## Como gerar a linha de base real

Após publicar esta instrumentação e colher uso autenticado, exporte somente os três tipos de evento do contrato para um JSON sanitizado e execute:

```bash
npm run ux:phase-002:measure -- --input=caminho/eventos.json --output=artifacts/ux-phase-002-runtime.json
```

Sem `--input`, o medidor retorna o estado `awaiting-real-sample` e métricas nulas. Isso impede que código, mocks ou percepção visual sejam apresentados como comportamento real.

## Próxima fase

A Fase 3 deve medir e reduzir mudanças de contexto nas mesmas seis jornadas usando a amostra real produzida por esta versão. Eventos de domínio já existentes devem ser ligados à análise antes de afirmar criação, movimentação, distribuição, download ou conexão concluída.
