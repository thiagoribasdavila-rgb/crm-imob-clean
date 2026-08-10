# Fase 206 — Dossiê de revisão dos gates de release

## Objetivo

Transformar uma avaliação válida da matriz de evidências em um dossiê determinístico para revisão humana. O dossiê organiza módulos, gates, papéis revisores, provas aceitas e lacunas sem registrar aprovação nem executar qualquer efeito de release.

## Contrato implementado

- a política e o resultado da avaliação da fase 205 são revalidados;
- os registros admitidos são extraídos novamente e a matriz de origem é reconstruída;
- o hash reconstruído precisa coincidir com o hash avaliado;
- todas as provas são reavaliadas no instante de preparação do dossiê;
- a preparação deve ocorrer depois da avaliação e dentro de 300 segundos;
- cada gate preserva seu papel revisor e expõe provas aceitas e ausentes;
- cobertura completa produz apenas `ready_for_human_review`, nunca aprovação;
- cobertura incompleta ou prova recém-expirada produz `blocked_incomplete_evidence`;
- adulteração, contexto divergente ou janela inválida produz `rejected`.

## Estados de saída

- `ready_for_human_review`: cobertura completa e vigente, aguardando decisões humanas explícitas;
- `blocked_incomplete_evidence`: dossiê válido, mas com lacunas ou provas vencidas;
- `rejected`: integridade, contexto, política, tempo ou avaliação inválidos.

## Estado canônico real

A configuração canônica possui zero signatários confiáveis e nenhuma avaliação admitida disponível. Por isso, a fase não produz um dossiê operacional e não declara homologação. O executor informa `awaiting_trusted_signer_configuration` até que responsáveis reais sejam configurados por decisão operacional explícita.

## Limites deliberados

Esta fase não acessa serviços remotos, não altera banco, não executa migration, não roda build, não cria ZIP, não executa gates, não aprova, não atualiza a memória canônica, não faz deploy e não promove release. As chaves Ed25519 usadas pelo verificador existem somente em memória durante o teste isolado.

## Validação

Os contratos cobrem política segura, matriz parcial, matriz completa sem aprovação, avaliação adulterada, preparação precoce ou tardia, expiração entre avaliação e preparo e adulteração do próprio dossiê.

## Próxima fase

Fase 207: registrar decisões humanas explícitas e rastreáveis por gate elegível, ainda sem promoção automática.
