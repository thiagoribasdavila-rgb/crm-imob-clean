# ATLAS AI OS — Fase 43/100

## Objetivo

Preparar o contrato de permissão operacional efêmera para o replay da amostra 02. A fase descreve como a futura execução deverá reservar, de forma atômica e de uso único, a permissão, o nonce, o supervisor e o adaptador. Nenhuma reserva ou execução acontece nesta fase.

## Problema resolvido

O supervisor da Fase 42 governa ordem, timeout, rollback e destruição, mas ainda não existe uma autorização operacional separada capaz de impedir consumo parcial ou reutilização. A Fase 43 cria esse limite de confiança sem criar um atalho para staging.

O recibo somente poderá ser preparado com:

1. supervisor real da Fase 42, emitido há no máximo cinco minutos, imutável, não iniciado e vinculado ao mesmo alvo descartável;
2. atestado de um worker revisado, com artefato imutável, estágios allowlisted e sem comando livre, alvo vinculado ou caminho de produção;
3. autorização humana AAL2 emitida há no máximo um minuto, válida por no máximo dois minutos e vinculada por SHA-256 ao supervisor, worker, alvo e política exata do permit.

Mesmo com as três provas, o permit nasce no estado `ATOMIC_PERMIT_PREPARED_CONSUMPTION_BLOCKED`.

## Reserva atômica futura

O contrato exige uma única operação compare-and-swap, sem consumo parcial:

```text
executionPermitConsumed:       false -> true
oneTimeExecutionNonceConsumed: false -> true
supervisorStarted:              false -> true
adapterExecuted:                false -> true
consumptionVersion:                 0 -> 1
```

Se qualquer pré-condição falhar, nenhuma das cinco mudanças poderá ser aplicada. O permit admite somente um consumo e não autoriza retry automático.

## Fluxo seguro

```text
Supervisor real da Fase 42 (0600)
              +
Atestado do worker revisado (0600)
              +
Autorização humana imediata AAL2 (0600)
              +
Fingerprint da política do permit
              |
              v
Permit selado da Fase 43 (0600)
              |
              v
ATOMIC_PERMIT_PREPARED_CONSUMPTION_BLOCKED
              |
              v
Consumidor atômico e replay continuam ausentes
```

## Controles obrigatórios

- staging e produção permanecem separados;
- autorização não pode depender de `user_metadata`; somente fonte confiável de banco ou `app_metadata` atestada;
- AAL2 é obrigatório para a confirmação humana de alto risco;
- sessão, claims, credenciais, nonce bruto e valor de permit nunca são persistidos;
- nenhuma URL, `project-ref`, `db push`, `db reset --linked`, fragmento de shell ou comando livre;
- permissão válida por no máximo dois minutos e consumo máximo igual a um;
- supervisor, adaptador e nonce devem permanecer não consumidos durante toda a preparação;
- rollback e destruição do alvo continuam obrigatórios no futuro worker;
- produção, Meta, deploy e build permanecem proibidos.

## Evidência disponível

Nenhuma evidência real foi recebida nesta fase. Portanto:

- permit real foi emitido: **não**;
- permit foi disponibilizado ou consumido: **não**;
- nonce foi recebido ou consumido: **não**;
- supervisor foi iniciado: **não**;
- adaptador foi consumido: **não**;
- replay foi executado: **não**;
- staging foi acessado: **não**;
- banco remoto foi acessado: **não**;
- produção foi tocada: **não**;
- Meta foi tocado: **não**;
- build executado: **não**.

## Validação

Os testes cobrem fingerprints, expiração, AAL2, fonte confiável de autorização, alteração do worker, reuso do supervisor, consumo parcial, versão incorreta, escalada para produção, segredos, sessão, dados pessoais, comandos e liberação indevida. O construtor falha fechado sem as três evidências reais.

## Referências oficiais verificadas em 19/07/2026

- [Changelog e breaking changes do Supabase](https://supabase.com/changelog?tags=breaking-change)
- [Gerenciamento separado de staging e produção](https://supabase.com/docs/guides/deployment/managing-environments)
- [Deployment e ambientes isolados](https://supabase.com/docs/guides/deployment)
- [RLS, autorização e AAL2](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Próxima etapa

Fase 44: preparar o consumidor compare-and-swap e o worker efêmero revisável. Eles continuarão sem executar replay real até existirem permit válido, alvo descartável conferido e autorização humana imediatamente anterior ao consumo.
