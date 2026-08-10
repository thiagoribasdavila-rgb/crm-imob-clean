# ATLAS AI OS — Fases 46 a 50/100

Este bloco fecha a preparação de segurança antes do primeiro uso real. Não é uma autorização para enviar eventos, alterar campanhas, consumir permissões, executar worker, tocar staging/produção ou publicar.

## Fase 46 — Reserva exatamente-uma

**Objetivo:** definir a evidência que prova que uma operação ambígua foi reservada uma única vez.

**Resultado:** a reconciliação aceita somente o mesmo `organization_id`, a mesma chave idempotente, o mesmo escopo de origem e uma única versão de consumo. Evidência ausente, divergente ou duplicada encerra em bloqueio e sem retry.

## Fase 47 — Limite de autorização final

**Objetivo:** separar revisão, autorização AAL2 e execução.

**Resultado:** uma decisão humana futura precisa ser imediata, curta, de uso único e vinculada ao plano e à reserva. `user_metadata`, sessão bruta, claims gravadas e permissões genéricas não são aceitos como fonte de autoridade.

## Fase 48 — Jornada mínima de uso real

**Objetivo:** listar o mínimo que diretor, gerente e corretor devem conseguir fazer antes da entrada operacional.

**Checklist:** entrar com perfil correto; criar/atribuir lead; registrar próxima ação; mover oportunidade; consultar histórico; registrar tarefa; respeitar isolamento por organização; encerrar sessão. O roteiro usa dados de homologação autorizados, nunca uma planilha privada no pacote.

## Fase 49 — Evidência de ambiente isolado

**Objetivo:** preparar a coleta de evidência de staging, saúde e retorno seguro.

**Checklist:** staging separado de produção; variáveis conferidas fora do repositório; RLS e papéis testados; backup/restauração documentados; observabilidade ativa; health/readiness respondendo; plano de rollback validado pelo responsável.

## Fase 50 — Decisão de entrada em uso real

**Objetivo:** tornar explícito o que ainda bloqueia o ZIP operacional.

O arquivo `ATLAS_AI_OS_RELEASE_v1.zip` só pode ser criado a partir de um commit aprovado e árvore limpa após: consistência de banco, ambiente preparado, testes críticos, jornada mínima funcional e aprovação do diretor. O build local acontece exatamente uma vez no fechamento.

## Estado atual

O contrato de pré-entrada está pronto, mas a evidência externa ainda não foi fornecida. Portanto:

- banco/staging/produção: **não tocados**;
- Meta e campanhas: **não tocadas**;
- replay, worker e consumo de permit: **bloqueados**;
- build e ZIP de release: **bloqueados**.

Execute `npm run meta:phase-050:check` para conferir o bloco local. A coleta de evidência real deve ser feita pelo responsável no ambiente de homologação, sem segredos no chat ou no ZIP.
