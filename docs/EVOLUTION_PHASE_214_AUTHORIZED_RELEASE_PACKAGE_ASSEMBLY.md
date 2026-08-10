# ATLAS AI OS — Fase 214/3000

## Authorized Release Package Assembly

### Objetivo

Fechar o contrato entre uma autorização humana de pacote e o ZIP efetivamente montado. A fase cria uma prova criptográfica do pacote, do inventário e do consumo da autorização, sem acionar build, deploy ou promoção.

### Problema resolvido

Até a fase 213 existia autorização assinada, porém ainda faltava provar que:

- o artefato é realmente um ZIP;
- o conteúdo corresponde a um inventário determinístico;
- arquivos sensíveis não entram no pacote;
- o mesmo diretor que autorizou realiza a montagem;
- a autorização não pode ser reutilizada;
- o recibo fica comprometido em memória encadeada.

### Implementação

- política canônica `authorized-release-package-assembly-policy` ligada aos hashes das fases anteriores;
- validação da assinatura ZIP e do registro EOCD;
- limites de 64 MiB compactados, 256 MiB descompactados e 12.000 arquivos;
- inventário ordenado, sem caminhos duplicados, travessia, artefatos de build ou arquivos sensíveis;
- SHA-256 do ZIP, do inventário, do recibo e de cada entrada da memória;
- memória append-only que consome `authorizationHash`, `authorizationId` e `nonce` uma única vez;
- vínculo obrigatório entre montador e autorizador;
- recibo explícito com `packageGenerated=true`, mantendo build, deploy e promoção em `false`.

### Estado canônico

O caminho positivo foi provado exclusivamente por fixture efêmera nos testes de contrato. A base canônica continua sem aprovadores, aprovação final, autorização e pacote real:

- aprovadores finais: `0`;
- autorizações de pacote: `0`;
- pacotes montados: `0`;
- autorização consumida: `false`;
- build executado: `false`;
- deploy executado: `false`;
- release promovida: `false`.

### Impacto operacional

Quando houver decisão humana real, o Atlas poderá demonstrar exatamente qual autorização gerou qual ZIP, sem permitir reaproveitamento ou troca silenciosa de conteúdo. Até lá, a operação continua protegida e inalterada.

### Validação

- política regenerável e hash estável;
- memória vazia regenerável e hash estável;
- montagem de ZIP real em diretório temporário;
- rejeição de autorização reutilizada;
- rejeição de ZIP, inventário, ator ou validade divergentes;
- regressão completa, TypeScript, ESLint e varreduras de segurança.

### Fora de escopo

- build de produção;
- criação de ZIP canônico;
- alteração de banco, Auth ou RLS;
- upload, deploy ou promoção;
- criação artificial de aprovador ou autorização.

### Próxima fase recomendada

Fase 215 — comprometer a evidência de um pacote autorizado antes de qualquer decisão posterior de publicação.
