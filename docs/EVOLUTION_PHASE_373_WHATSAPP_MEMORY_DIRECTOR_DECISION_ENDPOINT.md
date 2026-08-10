# Fase 373 — endpoint protegido da decisão da diretoria

## Resultado

A fase adiciona a fronteira HTTP autenticada que poderá registrar a decisão da diretoria depois da reconciliação da migration da fase 372. O navegador envia somente decisão, justificativa e duas confirmações humanas. Organização, ator, evidência e fingerprint são sempre determinados no servidor.

## Contrato

`POST /api/v1/integrations/whatsapp/memory-director-decision`

Cabeçalho obrigatório: `Idempotency-Key`, com 8 a 128 caracteres seguros.

Corpo aceito:

```json
{
  "decision": "approve",
  "reason": "Justificativa explícita da diretoria com pelo menos vinte caracteres.",
  "operationalScopeConfirmed": true,
  "evidenceLimitsConfirmed": true
}
```

Qualquer campo adicional é rejeitado. A rota exige sessão válida, papel `admin` ou função comercial `director`, aplica limite de cinco tentativas por minuto e valida a origem de mutações feitas por cookie.

## Evidência recalculada

Antes da escrita, o servidor relê, dentro da organização autenticada:

- continuidade estrutural de conversas e titularidade de leads;
- qualidade de captura, rastreabilidade externa e eventos canônicos;
- completude da memória comercial estruturada.

O recálculo não seleciona conteúdo, corpo de mensagem, telefone ou e-mail. O snapshot é versionado e recebe fingerprint SHA-256 no servidor. Se qualquer um dos dez controles estiver bloqueado, nada é persistido.

## Persistência e limites desta entrega

- O RPC append-only da fase 372 continua sendo a única escrita permitida.
- A migration existe somente no repositório e **não foi aplicada ao Supabase remoto**.
- Enquanto ela estiver ausente, a rota responde `503 PERSISTENCE_MIGRATION_PENDING` sem improvisar outra tabela.
- A interface mostra apenas o estado técnico; nenhum botão de aprovação foi liberado.
- Mesmo após um registro, `learningActivated` permanece `false`.

## Verificação

```bash
npm run whatsapp-memory-director-decision-endpoint:check
npm run typecheck
npm run api-security:check
```

## Próximo gate

A próxima fase deve reconciliar a migration em ambiente autorizado e executar um teste ponta a ponta autenticado, com replay idempotente e isolamento entre organizações. Até essa prova, a decisão continua indisponível na interface.
