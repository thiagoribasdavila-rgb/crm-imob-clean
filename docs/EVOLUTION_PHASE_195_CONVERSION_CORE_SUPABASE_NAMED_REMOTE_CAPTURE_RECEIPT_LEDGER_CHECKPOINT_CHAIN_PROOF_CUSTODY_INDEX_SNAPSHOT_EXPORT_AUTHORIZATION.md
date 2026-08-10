# ATLAS ONE — Fase 195/3000

## Objetivo

Separar a autorização humana de exportação do snapshot portátil criado na fase 194. O snapshot permanece neutro e contém somente hashes; o novo manifesto privado registra finalidade controlada, validade curta e provas pseudonimizadas de destinatário e aprovador.

## Implementado

- Manifesto canônico e endereçado pelo próprio SHA-256.
- Vínculo exato ao hash e nome do snapshot portátil.
- Finalidades limitadas a códigos conhecidos.
- Aprovação literal obrigatória: `AUTORIZO EXPORTAR ESTE SNAPSHOT`.
- Destinatário e aprovador protegidos por HMAC-SHA-256 com chave privada fornecida pelo operador.
- Separação obrigatória entre quem recebe e quem aprova.
- Janela máxima de autorização de 15 minutos.
- Verificação de início, expiração, finalidade, identidades e snapshot.
- Diretório `0700`, arquivo `0600`, recusa de symlink, fuga da raiz, adulteração e colisão.
- Nenhuma identidade, credencial ou dado pessoal em claro no manifesto.

## Limite operacional

A verificação pode afirmar `exportAuthorized: true` durante a janela válida, mas sempre mantém `exportExecuted: false`. Não existe executor de exportação nesta fase. Nenhum contato remoto, escrita no banco, migration, build, ZIP ou deploy foi realizado.

## Comandos de validação

```bash
npm run evolution:phase-195:assess
npm run evolution:phase-195:check
node --test tests/contracts/conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot-export-authorization.test.mjs
```

## Próxima fase

Criar um recibo local e de consumo único para a autorização, vinculado ao destino lógico e ao hash do snapshot, ainda sem transmitir dados.
