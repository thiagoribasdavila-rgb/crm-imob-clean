# ATLAS ONE — Fase 226/3000

## Controlled External Publication Execution Permit Consumption

### Resultado

A fase 226 implementa o consumo atômico, auditável e de uso único da permissão de execução externa concedida na fase 225. O consumo só pode ser realizado pelo mesmo executor externo previamente aceito e vinculado à permissão.

Esta fase não inicia a prova controlada e não executa publicação, rede, mutação de banco, geração de pacote, build, deploy ou promoção de release.

### Cadeia de confiança

O consumo valida integralmente a cadeia já aprovada:

1. revisão da autorização externa;
2. concessão da autorização;
3. consumo da autorização;
4. handoff para execução externa;
5. aceitação pelo executor alvo;
6. concessão da permissão de execução;
7. consumo único dessa permissão.

Cada etapa é ligada por hashes canônicos. Nenhum executor, concedente, consumidor, handoff, aceitação, permissão ou consumo real é inventado na configuração canônica.

### Garantias implementadas

- exige permissão registrada, íntegra, não expirada e ainda não consumida;
- exige vínculo exato com a memória de permissões e com seu cabeçalho atual;
- exige o mesmo executor externo aceito e indicado como alvo;
- exige chave privada correspondente ao descritor público do executor;
- exige vínculo exato com pacote, inventário, aceitação e handoff;
- gera recibo Ed25519 assinado pelo consumidor autorizado;
- registra o consumo em memória append-only com encadeamento de hashes;
- marca `permitConsumed: true` e `remainingUses: 0` no recibo;
- rejeita reutilização da mesma permissão, ainda que o identificador do segundo consumo seja diferente;
- detecta adulteração do recibo, da memória e dos resumos derivados;
- mantém `controlledProofExecutionStarted: false` e todos os efeitos externos bloqueados.

### Arquivos centrais

- `lib/release/controlled-external-publication-execution-permit-consumption.mjs`
- `tests/contracts/controlled-external-publication-execution-permit-consumption.test.mjs`
- `config/controlled-external-publication-execution-permit-consumption-policy.json`
- `config/controlled-external-publication-execution-permit-consumption-memory.json`
- `config/evolution-phase-226-controlled-external-publication-execution-permit-consumption.json`
- `scripts/run-controlled-external-publication-execution-permit-consumption-phase-226.mjs`
- `scripts/check-evolution-phase-226.mjs`

### Estado canônico atual

- executores externos confiáveis configurados: 0;
- concedentes de permissão configurados: 0;
- consumidores de permissão configurados: 0;
- handoffs registrados: 0;
- aceitações registradas: 0;
- permissões registradas: 0;
- consumos registrados: 0;
- prova controlada iniciada: não;
- publicação executada: não;
- pacote gerado: não;
- build executado: não;
- deploy executado: não;
- release promovida: não.

Esse estado vazio é intencional: a infraestrutura está pronta para verificar evidência real sem simular uma autorização ou execução que não ocorreu.

### Identidade canônica

- policy de concessão da permissão: `a804274407a8f3f1410739a118e9c21b52217f551a035cbca4f0ea5f3f8046f7`;
- memória de permissões: `e478edb4c980c7310331a5c688e85adc288e06d78dd2373cbdbbf4b9cf8098bd`;
- policy de consumo: `34dbf0847e3593f0865db56de546faff8186745682089f65c2b9b38d6a0b3ebe`;
- memória de consumos: `931f28cc15b0a25723f69c0df0f13b4c9cf030d423b6d12ac4d7ee76ccb3c1fb`.

### Validação

Comandos específicos da fase:

```bash
npm run evolution:phase-226:assess
npm run evolution:phase-226:check
node --test tests/contracts/controlled-external-publication-execution-permit-consumption.test.mjs
```

A validação contratual cobre o caminho válido e as rejeições por expiração, ausência de registro, executor incorreto, chave divergente, consumo duplicado, recibo adulterado e memória divergente.

### Próxima fase

Fase 227 — **Controlled Proof Execution Start Authorization**: autorizar explicitamente o início de uma prova controlada somente após um consumo registrado e válido, ainda sem iniciar a execução nem produzir efeitos externos.
