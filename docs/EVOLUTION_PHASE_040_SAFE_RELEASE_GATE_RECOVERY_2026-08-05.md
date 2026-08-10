# Fase 40 — gate de release seguro e recuperável

## Objetivo

Evitar que a Diretoria tome uma decisão de liberação sem a justificativa e as confirmações exigidas pelo servidor, além de tornar indisponibilidades temporárias recuperáveis pela interface.

## Ajuste entregue

- Validação preventiva de justificativa mínima antes de aprovar ou acionar rollback.
- Aprovação exige evidências, justificativa e confirmação explícita do checklist também na interface.
- Tratamento seguro para falhas de sessão, rede, API e resposta inválida.
- Estado de indisponibilidade com atualização manual; nenhuma decisão é alterada quando o gate não pode ser lido.
- Feedback de êxito ou falha permanece visível para a Diretoria.

## Impacto operacional

O gate passa a refletir as mesmas regras que já protegem a API e reduz tentativas inválidas ou decisões tomadas sem evidência carregada.

## Limites da fase

Sem mudanças em feature flags, regras de negócio, permissões, banco de dados ou integrações externas.

## Validação prevista

- Typecheck.
- Lint.
- Contrato do gate de liberação.
