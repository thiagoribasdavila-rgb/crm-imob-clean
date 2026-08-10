# ATLAS ONE — Fase 227/3000

## Controlled Proof Execution Start Authorization

### Resultado

A fase 227 cria a autorização explícita, assinada, curta e de uso único para o futuro início de uma prova controlada. Ela só pode ser emitida pelo executor já aceito e somente depois de um consumo de permissão registrado e válido.

Esta fase autoriza apenas o registro do início futuro. Ela não inicia a prova e não executa rede, publicação, mutação de banco, geração de pacote, build, deploy ou promoção de release.

### Garantias implementadas

- exige recibo de consumo registrado na memória canônica da fase 226;
- valida a cadeia integral de handoff, aceitação, permissão e consumo;
- exige o mesmo executor alvo e sua chave privada Ed25519;
- vincula autorização a consumo, permissão, aceitação, handoff, pacote e inventário;
- limita a autorização a no máximo 300 segundos e ao vencimento original da permissão;
- permite exatamente um início futuro (`maximumStarts: 1`);
- registra a autorização em memória append-only com cabeçalho atômico;
- rejeita nova autorização para o mesmo consumo;
- detecta adulteração da autorização, da assinatura e da memória;
- mantém `controlledProofExecutionStarted: false` e todos os efeitos externos bloqueados.

### Arquivos centrais

- `lib/release/controlled-proof-execution-start-authorization.mjs`
- `tests/contracts/controlled-proof-execution-start-authorization.test.mjs`
- `config/controlled-proof-execution-start-authorization-policy.json`
- `config/controlled-proof-execution-start-authorization-memory.json`
- `config/evolution-phase-227-controlled-proof-execution-start-authorization.json`
- `scripts/run-controlled-proof-execution-start-authorization-phase-227.mjs`
- `scripts/check-evolution-phase-227.mjs`

### Estado canônico atual

- autorizadores de início confiáveis configurados: 0;
- consumos de permissão registrados: 0;
- autorizações de início registradas: 0;
- prova controlada autorizada: não;
- prova controlada iniciada: não;
- publicação executada: não;
- pacote gerado: não;
- build executado: não;
- deploy executado: não;
- release promovida: não.

O estado vazio é intencional. A fase prepara a prova de autorização sem inventar executor, consumo ou autorização real.

### Identidade canônica

- policy de consumo da permissão: `34dbf0847e3593f0865db56de546faff8186745682089f65c2b9b38d6a0b3ebe`;
- memória de consumos: `931f28cc15b0a25723f69c0df0f13b4c9cf030d423b6d12ac4d7ee76ccb3c1fb`;
- policy de autorização do início: `8a4ff3df8bdc1ee51013f0bef3abd83477dc0c01621941ca02e76b520df63f0c`;
- memória de autorizações: `340db494cf568fcc5ed583e2db02c5f5d46898f0fc7d5dcccab335d3e8cae541`.

### Validação

```bash
npm run evolution:phase-227:assess
npm run evolution:phase-227:check
node --test tests/contracts/controlled-proof-execution-start-authorization.test.mjs
```

A validação cobre o caminho válido e rejeições por consumo ausente, janela inválida, executor incorreto, chave divergente, autorização duplicada, autorização adulterada e memória divergente.

### Próxima fase

Fase 228 — **Controlled Proof Execution Start**: consumir uma autorização registrada, vigente e de uso único para registrar o início da prova controlada, ainda sem efeitos externos.
