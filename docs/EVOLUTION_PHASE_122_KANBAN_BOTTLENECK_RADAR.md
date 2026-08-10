# Fase 122 — Kanban Bottleneck Radar

Objetivo: tornar o Kanban mais decisivo mostrando quais etapas concentram os maiores gargalos comerciais.

## O que mudou

- O Kanban ganhou um radar compacto de gargalos por etapa.
- Cada etapa recebe uma pontuação de pressão baseada em:
  - urgência;
  - leads parados;
  - leads sem próxima ação;
  - volume de oportunidades abertas.
- O radar exibe somente as três etapas mais importantes do recorte atual.
- Cada item é clicável e leva o usuário para a etapa priorizada.

## Impacto operacional

O gerente deixa de depender de leitura manual das colunas para entender onde agir primeiro. O corretor ganha clareza de execução e o diretor passa a enxergar travas de funil com menos ruído visual.

## Proteções

- Não cria tabela nova.
- Não altera banco.
- Não duplica regra de negócio.
- Reutiliza cálculos já existentes do Kanban.
- Funciona com dados reais, filtros atuais e base legada.

## Critério de decisão

O radar prioriza etapas com maior chance de perda por inércia operacional. A ordem considera ações críticas antes de volume bruto, porque conversão depende de velocidade e próximo passo registrado.

## Validação

- Check de fase: `npm run evolution:phase-122:check`
- Typecheck: obrigatório por alterar TSX.
- Lint: obrigatório por alterar interface React.

## Próxima evolução sugerida

Fase 123: transformar o ranking em ação guiada por perfil, mostrando texto diferente para corretor, gerente e diretor.
