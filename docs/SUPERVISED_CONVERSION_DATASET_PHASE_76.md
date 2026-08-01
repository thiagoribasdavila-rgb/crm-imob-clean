# Fase 76 — Dataset supervisionado de conversão

## Resultado

Cada fotografia preserva somente os sinais existentes naquele instante. Ganho, perda ou compra externa entram como rótulo apenas se acontecerem depois e dentro da janela escolhida. Leads abertas não são tratadas como negativas.

## Proteções

- Fotografia imutável e versionada.
- Corte temporal explícito e primeiro desfecho posterior.
- Sem nome, contato, documentos, texto de conversa ou resultado futuro nas features.
- Sem ranking de pessoas ou promoção automática de modelo.
- Validação exige 100 exemplos, 20 positivos e 20 negativos.
- Bases antigas recuperam o primeiro desfecho comprovado em `pipeline_stage_moves`, com chave idempotente.

## Homologação

Aplicar as migrations 75 e 76, executar `npm run conversion-dataset:check`, criar fotografias em mais de uma data e validar que somente desfechos posteriores entram no conjunto. Conferir quatro perfis e dois tenants antes de calibrar qualquer modelo.
