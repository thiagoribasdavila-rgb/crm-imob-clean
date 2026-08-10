# Fase 168 — entrega Meta controlada no dataset de teste

## Resultado

O Atlas One agora possui um único caminho governado para comprovar a recepção de um evento `Lead` pela Meta. O envio não acontece em testes automatizados, em carregamento de tela ou por cron: exige ação direta da diretoria, confirmação textual exata e toda a cadeia das fases 165–167 válida.

## Cadeia de autorização

1. A diretoria aprova a lead e o contexto elegível.
2. O Atlas congela um payload sem PII e calcula sua fingerprint.
3. O gate temporário autoriza no máximo uma entrega por dez minutos.
4. Antes de enviar, o servidor relê a lead e exige a mesma fingerprint aprovada.
5. O evento usa `event_id` determinístico e chave idempotente.
6. O worker Hostinger entrega com `mode=test` e `test_event_code`.
7. Só há sucesso quando a Meta responde `events_received: 1`.
8. O Atlas grava um recibo sanitizado em `atlas_events`.

## Proteções

- A rota aceita somente `admin`, `director_decisor` e `director`.
- A confirmação obrigatória é `ENVIAR_TESTE_META_AGORA`.
- Qualquer mudança na origem, contato, consentimento ou contexto da lead invalida a cadeia.
- Produção permanece desativada (`productionEnabled: false`).
- O recibo contém somente identificadores técnicos, dataset mascarado, horário, tentativas, status e trace id.
- Token Meta, segredo do worker, telefone e e-mail nunca aparecem na resposta ou no evento de auditoria.
- O endpoint antigo `/conversion-test` responde `410` e não possui capacidade de envio.

## Operação

Na Sala de Campanhas, a diretoria deve selecionar a lead, aprovar, congelar, abrir o gate e então clicar em **Enviar 1 teste à Meta**. Em caso de alteração ou expiração, uma nova cadeia deve ser criada; não se reaproveita autorização antiga.

## Validação sem rede

```bash
npm run evolution:phase-168:check
node --experimental-strip-types --test tests/contracts/meta-test-delivery.test.mjs
npm run typecheck
```

O build integral continua reservado ao fechamento da versão/ZIP. Nenhum teste local dispara evento externo.
