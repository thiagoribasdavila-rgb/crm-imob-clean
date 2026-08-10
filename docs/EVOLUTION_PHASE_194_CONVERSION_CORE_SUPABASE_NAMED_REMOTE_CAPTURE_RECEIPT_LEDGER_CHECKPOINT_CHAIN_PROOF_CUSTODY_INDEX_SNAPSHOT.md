# Fase 194 — Snapshot portátil do índice de custódia

## Resultado

O índice privado e append-only da fase 193 agora pode ser consolidado em um snapshot compacto, content-addressed e verificável fora da máquina de origem. O arquivo contém somente hashes SHA-256, posições, sequências e limites estruturais da cadeia.

Não são exportados alegações, nomes de revisores, finalidade, pseudônimos, chave de pseudonimização, credenciais ou dados pessoais.

## Garantias implementadas

- nome do arquivo igual ao SHA-256 do conteúdo canônico;
- contrato de chaves exatas, recusando campos extras;
- validação autônoma de integridade, sequência e encadeamento;
- comparação opcional com o índice privado original;
- comparação entrada por entrada dos hashes de índice, custódia e prova de origem;
- diretório `0700`, arquivo `0600`, `O_NOFOLLOW` e recusa de fuga por symlink;
- criação idempotente e recusa de colisão divergente;
- limite de tamanho e quantidade de entradas;
- zero contato remoto e zero alteração no Supabase.

## Uso seguro

Por padrão, a avaliação falha fechada e não cria arquivos:

```bash
npm run evolution:phase-194:assess
npm run evolution:phase-194:check
```

A criação programática exige explicitamente os diretórios privados de custódia e índice, o head do índice e o diretório privado de destino. A verificação portátil exige somente o snapshot; a verificação vinculada exige também toda a origem.

## Validação

A suíte contratual cobre conteúdo mínimo, verificação portátil, vínculo integral com a origem, idempotência, adulteração do conteúdo e da cadeia, origem divergente, argumentos incompletos, permissões, symlink, fuga da raiz e ausência de entrada.

## Limite deliberado

O snapshot prova integridade estrutural local. Ele não assina o conteúdo, não fornece carimbo de tempo independente e não autoriza seu envio. A próxima fase deverá criar uma autorização de exportação separada, explícita, temporária e auditável.
