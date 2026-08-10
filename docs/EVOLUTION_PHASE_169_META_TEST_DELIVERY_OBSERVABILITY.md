# Fase 169 — observabilidade segura da entrega Meta

## Resultado

O Atlas One agora diferencia uma entrega confirmada de uma fila ainda aguardando o worker, uma falha estritamente local, uma tentativa externa inconclusiva e um evento bloqueado. A leitura usa somente registros já persistidos e nunca chama a Meta, nunca aciona o worker e nunca reenvia automaticamente.

## Regra contra duplicidade

Se `attempts > 0`, o Atlas assume que pode ter existido contato externo. Sem recibo conclusivo, a orientação é conferir o Events Manager e reconciliar pelo mesmo `event_id`. Um novo envio fica bloqueado. Somente uma falha comprovadamente anterior a qualquer tentativa externa pode voltar à cadeia controlada após correção local.

## Superfície operacional

A Sala de Campanhas apresenta, para no máximo os três testes mais recentes:

- situação operacional em linguagem clara;
- quantidade de tentativas;
- presença ou ausência do recibo;
- política de repetição;
- próxima ação segura;
- `event_id` técnico para conciliação.

Telefone, e-mail, CPF, token, payload enviado, resposta bruta e `last_error` não são devolvidos à interface.

## Segurança e escopo

- A rota é somente `GET` e aceita `admin`, `director_decisor` e `director`.
- Toda consulta é filtrada pela organização resolvida na sessão.
- Não existe endpoint de retry nesta fase.
- Produção continua desligada.
- Não há migration: `meta_conversion_events` e `atlas_events` já formam o ledger necessário.
- Nenhum teste local dispara evento externo.

## Validação

```bash
npm run evolution:phase-169:check
node --experimental-strip-types --test tests/contracts/meta-test-delivery-observability.test.mjs
npm run typecheck
```

O build integral permanece reservado ao fechamento da versão/ZIP.
