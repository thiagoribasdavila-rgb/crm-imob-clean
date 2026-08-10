# Fase 205 — Avaliação da matriz com evidências admitidas

## Objetivo

Calcular a cobertura dos gates de release usando exclusivamente registros que passaram pela entrada, assinatura e admissão das fases anteriores. A avaliação é informativa: não executa gates, não altera a memória canônica e não promove release.

## Contrato implementado

- cada lote admitido é revalidado integralmente antes de fornecer registros;
- lotes permanecem separados por papel: QA, engenharia, operações e diretoria;
- vários lotes admitidos podem compor uma única avaliação;
- IDs, hashes de registros e hashes de admissão repetidos entre lotes são rejeitados;
- provas fora da janela de 600 segundos falham de forma fechada;
- cobertura parcial é um resultado válido e explícito;
- cobertura completa ainda exige revisão humana posterior.

## Estados de saída

- `matrix_evaluated_incomplete`: recibos válidos, mas cobertura insuficiente;
- `matrix_evaluated_complete`: todos os itens exigidos estão cobertos;
- `rejected`: contexto, política, admissão, integridade, repetição ou vigência inválidos.

## Limites deliberados

Esta fase não configura signatários reais, não acessa serviços remotos, não altera banco, não executa migration, não roda build, não cria ZIP, não faz deploy e não promove release. A configuração canônica continua com zero signatários confiáveis até uma decisão operacional explícita.

## Validação

O contrato cobre matriz parcial e completa, adulteração do resultado de admissão, adulteração do intake, avaliação precoce, expiração, replay entre lotes e adulteração do próprio resultado. O verificador da fase usa chaves Ed25519 efêmeras apenas em memória.

## Próxima fase

Fase 206: preparar um pacote de revisão humana dos gates avaliados, sem atualizar memória, empacotar ou publicar.
