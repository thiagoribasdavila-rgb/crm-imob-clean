# Fase 3 — feedback supervisionado da preparação assistida

## Objetivo

Fechar o primeiro ciclo de aprendizado da captura assistida: rascunho, revisão humana, confirmação no histórico e avaliação opcional da utilidade da preparação.

## O que foi alterado

- A captura confirmada passa a aceitar uma avaliação humana curta: **ajudou**, **precisa ajustar** ou **não ajudou**.
- A avaliação é gravada somente como telemetria agregada por `captureId` em `atlas_events`.
- A medição gerencial passa a informar respostas recebidas e taxa de utilidade percebida.

## Proteções

- A avaliação não envia mensagem, não altera o funil, não cria tarefa e não executa ação externa.
- O evento técnico não contém anotação original, resumo, objeções, dados pessoais ou conteúdo de conversa.
- O feedback é opcional e só pode ser enviado por usuário autenticado com acesso à lead.
- O isolamento continua derivado da organização resolvida pelo contexto de acesso.

## Sem migration

Esta fase reutiliza `atlas_events`, já existente, com o mesmo isolamento organizacional. Nenhuma tabela, política ou dado comercial foi alterado.

## Critério de validação

1. Confirmar uma captura assistida revisada.
2. Registrar uma das três avaliações.
3. Consultar a medição como direção/superintendência.
4. Confirmar que a telemetria contém apenas `captureId`, classificação e metadados técnicos.
