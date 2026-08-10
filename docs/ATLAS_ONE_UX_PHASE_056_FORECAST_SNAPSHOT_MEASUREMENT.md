# Atlas One — Fase 56: forecast previsto × realizado

## Objetivo

Transformar o forecast ao vivo em uma medição auditável sem declarar tendência antes de existir evidência comparável.

## Entrega

- fotografia imutável da coorte de oportunidades e das probabilidades vigentes;
- horizontes explícitos de 30, 60 ou 90 dias;
- aferição manual somente após o encerramento do horizonte;
- resultado calculado sobre os mesmos IDs congelados;
- valor previsto, realizado, erro absoluto e precisão observada;
- precisão ausente quando a previsão é zero;
- tendência permitida apenas com três janelas do mesmo horizonte, independentes e com amostra mínima;
- leitura restrita à organização e à gestão;
- nenhuma etapa, contato, orçamento ou integração alterada automaticamente.

## Banco

A migration `20260804224827_phase_56_forecast_snapshot_measurement.sql` cria `forecast_snapshots`, RLS de leitura por organização e escrita exclusiva do servidor. Ela foi criada localmente e não foi aplicada remotamente nesta fase.

## Operação

Na rota `/atlas-v3/forecast`, a diretoria registra uma fotografia, aguarda o período e aciona **Aferir resultado**. O Atlas mantém o forecast corrente separado da memória histórica.

## Validação

```bash
npm run ux:phase-056:check
npm run typecheck
npm run lint
npm test
```

Build, ZIP, deploy e alteração remota permanecem fora do escopo desta fase.
