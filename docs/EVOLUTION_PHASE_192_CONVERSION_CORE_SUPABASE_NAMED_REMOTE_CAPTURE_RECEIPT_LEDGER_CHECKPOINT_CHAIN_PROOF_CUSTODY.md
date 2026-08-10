# Fase 192 — Custódia pseudonimizada da prova da cadeia

## Resultado

A fase cria um contrato local e fail-closed para registrar quem revisou uma prova e para qual finalidade, sem armazenar o identificador do revisor nem o texto da finalidade. As duas alegações são transformadas em pseudônimos independentes com HMAC-SHA256 e separação de domínio.

O registro também fixa criptograficamente a prova da fase 191 por hash, nome do arquivo, digest da cadeia, head e quantidade de entradas. Uma verificação posterior consegue confirmar tanto o vínculo com a prova quanto uma alegação de revisor/finalidade, desde que a chave externa correta seja apresentada.

## Proteções

- diretório obrigatório com modo `0700`;
- arquivo imutável por conteúdo, criado com `O_EXCL`, `O_NOFOLLOW` e modo `0600`;
- nome derivado do SHA-256 canônico do registro;
- chave de pseudonimização com no mínimo 32 bytes;
- comparação dos HMACs em tempo constante;
- revisor, finalidade e chave nunca são persistidos nem retornados;
- recusa de symlinks, fuga da raiz, permissões amplas, adulteração e colisão;
- nenhuma leitura ou escrita remota, migration, build, ZIP ou deploy.

## Uso local deliberado

```js
const created = createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody({
  root,
  proofDirectory: "private/proofs",
  proofFileName,
  custodyDirectory: "private/custody",
  reviewer: reviewerFromSecureInput,
  purpose: purposeFromSecureInput,
  pseudonymizationKey: keyFromSecretManager,
});
```

A chave deve vir de entrada segura local ou gerenciador de segredos. Ela não deve ser gravada no repositório, em `.env` versionado, no ZIP ou em logs.

## Validação

- testes de contrato cobrem criação, privacidade, integridade, vínculo com a prova, confirmação e rejeição de alegações, idempotência, adulteração, divergência, permissões, symlink e ausência de entrada;
- `npm run evolution:phase-192:assess` demonstra o comportamento fail-closed sem criar arquivos;
- `npm run evolution:phase-192:check` valida a entrega e mantém todos os gates operacionais bloqueados.

## Limite desta fase

O registro comprova custódia local declarada e verificável. Ele não comprova captura remota atual, não homologa o runtime e não autoriza qualquer alteração no Supabase ou na release publicada.

## Próxima fase

Criar um índice local append-only dos registros de custódia, encadeado criptograficamente e ainda sem armazenar revisor, finalidade ou chave em texto claro.
