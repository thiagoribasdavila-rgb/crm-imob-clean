# Fase 017 — Uso real instrumentado

## Resultado

O Atlas agora cria evidência real de adoção e fluidez das telas sem observar conteúdo comercial ou dados pessoais.

## Eventos

- `atlas.page_viewed`: registra somente a rota normalizada após uma tela ser exibida.
- `atlas.navigation_completed`: registra origem, destino e duração real de uma navegação iniciada pelo usuário.

Os eventos percorrem o coletor autenticado já existente, recebem a organização no servidor e são persistidos em `atlas_events`.

## Proteções

- IDs numéricos e UUIDs viram `:id`.
- Parâmetros de busca não são capturados.
- Nome, e-mail, telefone, conteúdo da lead e texto digitado não são enviados.
- A preferência `Do Not Track` é respeitada.
- Falha de telemetria nunca bloqueia a operação.
- O envio usa transporte assíncrono com `keepalive`.

## Limite de evidência

Esta fase instala a medição. Tendências de adoção e metas de velocidade só podem ser declaradas depois de uma amostra real em homologação; nenhum número foi inventado.
