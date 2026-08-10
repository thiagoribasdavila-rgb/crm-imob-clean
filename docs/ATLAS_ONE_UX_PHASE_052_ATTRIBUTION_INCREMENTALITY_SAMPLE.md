# Atlas One — Fase 52: atribuição, incrementalidade e amostra

## Objetivo

Impedir que a diretoria confunda uma venda atribuída a uma campanha com prova de que a campanha gerou ganho incremental.

## Alterações

- A jornada semanal passou a declarar três dimensões independentes:
  - **atribuição observada:** origem preservada no cadastro da lead;
  - **impacto incremental:** não estimado sem experimento compatível;
  - **suficiência da amostra:** leitura descritiva sinalizada como baixa abaixo de 30 leads.
- Cada campanha informa se a atribuição está registrada ou incompleta.
- Cada campanha mostra a condição da amostra sem transformar volume em confiança causal.
- Mesmo acima do mínimo descritivo, a tela declara que não mede lift ou efeito causal.

## Preservado

- Relatório semanal, API, cálculos, banco, RLS e hierarquia existentes.
- Nenhuma decisão automática sobre campanha ou orçamento.
- Nenhum número incremental ou confiança estatística foi inventado.

Não houve migration, alteração de API, build, ZIP ou deploy.
