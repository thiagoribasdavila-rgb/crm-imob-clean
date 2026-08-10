# Fase 121 — Kanban Stage Stall Signal

Objetivo: deixar a fila inteligente do Kanban mais decisiva mostrando há quanto tempo cada lead está parado na etapa atual.

## O que mudou

- Cada item da fila inteligente ganhou um chip de tempo parado.
- O sinal usa a melhor referência disponível na base atual:
  - `updated_at`;
  - `last_interaction_at`;
  - `created_at`.
- O chip muda de tom conforme risco operacional:
  - movimento recente;
  - horas na etapa;
  - dias na etapa;
  - dias sem avanço;
  - lead parado em estado crítico.

## Impacto operacional

O corretor não precisa abrir o histórico para perceber atraso. O gerente também ganha uma leitura rápida dos gargalos da equipe, mantendo o Kanban focado no que realmente move venda: próxima ação e velocidade de avanço.

## Proteções

- Não cria tabela nova.
- Não altera banco.
- Não muda a regra de movimentação.
- Não substitui o histórico real quando ele existir.
- Usa fallback seguro para bases legadas.

## Limitação assumida

Enquanto o sistema não tiver histórico granular de mudança por etapa, o tempo parado usa `updated_at` como aproximação principal. A evolução futura ideal é gravar `stage_entered_at` por oportunidade.

## Validação

- Check de fase: `npm run evolution:phase-121:check`
- Typecheck: obrigatório por alterar TSX.
- Lint: obrigatório por alterar interface React.

## Próxima evolução sugerida

Fase 122: criar ranking visual de gargalos por etapa, agregando quantos leads estão parados em cada coluna e sugerindo a ação prioritária do gerente.
