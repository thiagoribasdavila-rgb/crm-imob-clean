# Fase 193 — Índice append-only das custódias de prova

## Resultado

A fase cria um índice local, privado e append-only para os registros de custódia produzidos na fase 192. Cada entrada é content-addressed, recebe uma sequência monotônica e referencia criptograficamente a entrada anterior, o registro de custódia e a prova original.

O índice não copia revisor, finalidade, chave de pseudonimização ou mesmo os pseudônimos HMAC presentes no registro-fonte. Assim, ele permite auditar ordem, integridade, completude e unicidade das custódias sem ampliar a superfície de dados sensíveis.

## Proteções

- diretório obrigatório com modo `0700`;
- entradas imutáveis criadas com `O_EXCL`, `O_NOFOLLOW` e modo `0600`;
- nome de cada entrada derivado do SHA-256 canônico do próprio conteúdo;
- sequência e vínculo anterior verificados da head até a gênese;
- vínculo independente com o SHA-256 da custódia e da prova original;
- recusa de duplicidade da mesma custódia, ciclos, lacunas, órfãos, symlinks, fuga da raiz e permissões amplas;
- revisor, finalidade, chave, pseudônimos, credenciais e dados pessoais não são persistidos no índice;
- nenhuma leitura ou escrita remota, migration, build, ZIP ou deploy.

## Uso local deliberado

```js
const indexed = appendNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex({
  root,
  custodyDirectory: "private/custody",
  custodyFileName,
  indexDirectory: "private/custody-index",
  previousEntryFileName,
  indexedAt: trustedTimestamp,
});
```

O chamador deve manter o head em armazenamento local privado e fornecer um registro de custódia já validado. Repetir exatamente a mesma operação é idempotente; tentar inserir a mesma custódia em outra entrada é recusado.

## Validação

- testes de contrato cobrem gênese, encadeamento, privacidade, inspeção, idempotência, duplicidade, adulteração, custódia ausente, órfãos, permissões, symlink e ausência de entrada;
- `npm run evolution:phase-193:assess` demonstra o comportamento fail-closed sem criar arquivos;
- `npm run evolution:phase-193:check` valida a entrega, a ausência de dados sensíveis no índice e mantém todos os gates operacionais bloqueados.

## Limite desta fase

A cadeia comprova integridade e ordem local das custódias. Ela não fornece carimbo de tempo externo, assinatura digital ou notarização independente; também não comprova captura remota atual, não homologa o runtime e não autoriza alteração do Supabase ou da release publicada.

## Próxima fase

Criar um snapshot portátil e compacto do índice completo, contendo apenas hashes e metadados estruturais, sem registros brutos nem pseudônimos.
