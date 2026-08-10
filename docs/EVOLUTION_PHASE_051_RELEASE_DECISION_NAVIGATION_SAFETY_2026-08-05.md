# Fase 51 — segurança de navegação ao registrar decisão

## Objetivo

Proteger o envio de aprovação ou rollback quando o usuário sai do Command Center antes da resposta do servidor.

## Alteração aplicada

- Após cada etapa assíncrona do registro, o componente verifica se ainda está montado.
- Mensagens, limpeza de formulário e estado de envio não são atualizados após navegação.
- A decisão continua sendo persistida apenas pelo endpoint autorizado; a proteção é exclusivamente de interface.

## Impacto operacional

O fluxo executivo permanece estável durante navegação, sem feedback atrasado aparecer em uma tela que já não está aberta.

## Validações

- Typecheck e lint.
- Contratos de governança, medição antes/depois e gate de release.
- Sem alteração de banco, dados comerciais, feature flags remotas, build, ZIP ou deploy.
