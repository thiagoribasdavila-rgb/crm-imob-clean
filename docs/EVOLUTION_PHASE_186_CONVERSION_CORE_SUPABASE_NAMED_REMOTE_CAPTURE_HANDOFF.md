# Fase 186 — Handoff local de captura nominal

## Objetivo

Ligar, de forma estritamente local, uma revisão humana válida da Fase 185 ao adaptador da Fase 183. Esta fase não consulta o Supabase remoto e não executa migrations.

## Contrato implementado

- sessão mantida somente em memória;
- validade máxima de 120 segundos e nunca maior que a autorização humana;
- vínculo por SHA-256 da revisão, operação, alvo, consulta, migrations locais e identificador do handoff;
- consumo único por closure, queimado antes de validar/adaptar a captura;
- captura precisa declarar o mesmo fingerprint e identificador do handoff;
- nenhuma credencial, project ref em claro, bearer token ou executor remoto;
- saída continua bloqueando escrita, migration, build, ZIP e deploy.

## Fluxo

1. Validar a revisão humana da Fase 185.
2. Emitir manifesto local curto, sem capacidade serializável de acesso.
3. Receber uma captura já obtida por procedimento externo e autorizado.
4. Consumir a sessão antes de revalidar os hashes.
5. Entregar a captura ao adaptador da Fase 183.
6. Recusar qualquer segunda tentativa, inclusive se a primeira captura for inválida.

## Limite deliberado

O uso único é garantido dentro do processo atual. Reiniciar o processo elimina a sessão; portanto, esta fase ainda não é uma autorização operacional distribuída e não permite contato remoto automático. Um ledger/recibo idempotente deverá ser projetado antes de qualquer runner supervisionado.

## Validação

```bash
npm test -- --test-name-pattern="handoff"
npm run evolution:phase-186:check
npm run typecheck
npm run lint
npm run security:secrets
```

O build permanece reservado ao fechamento da versão, conforme `config/evolution-program-3000.json`.
