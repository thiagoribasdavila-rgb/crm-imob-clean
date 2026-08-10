# ATLAS AI OS — Fase 41/100

## Objetivo

Preparar o adaptador temporário e de uso único que poderá, em uma fase posterior, entregar o plano do replay da amostra 02 a um supervisor efêmero de **staging isolado**. Esta fase não executa replay, migração, Supabase remoto, Meta, campanha, deploy ou build.

## Problema resolvido

O pacote da Fase 40 continua bloqueado por desenho. Esta fase formaliza a última ponte antes de um executor, exigindo três evidências independentes:

1. pacote real e selado da Fase 40;
2. confirmação humana emitida há no máximo cinco minutos e válida por no máximo dez minutos;
3. nonce aleatório de 256 bits entregue somente pelo ambiente seguro de execução.

O adaptador liga as três provas por SHA-256, não contém comandos de shell, URL de banco, referência de projeto vinculado, credencial ou valor do nonce.

## O que foi implementado

- gate formal da Fase 41;
- template vazio e fechado;
- validador offline com casos negativos de expiração, replay indevido, escalada para produção e nonce fraco;
- construtor offline que lê somente arquivos `0600`, rejeita links simbólicos e recebe o nonce apenas pela memória do processo;
- plano com 12 identificadores allowlisted, sem comandos executáveis;
- fingerprint da sessão do adaptador sem persistir o nonce;
- auditoria estática que rejeita rede, subprocessos, clientes Supabase/Postgres e comandos remotos;
- regressão da cadeia de Fases 30–41.

## Fluxo seguro

```text
Pacote real da Fase 40 (0600)
              +
Confirmação humana imediata (0600)
              +
Nonce de 256 bits somente em memória
              |
              v
Adaptador selado da Fase 41 (0600)
              |
              v
Replay continua bloqueado
              |
              v
Supervisor efêmero futuro valida e consome uma única vez
```

## Controles obrigatórios

- staging separado da produção;
- confirmação humana não pode ser reaproveitada nem inferida;
- nonce não pode existir em arquivo, log, saída ou argumento de comando;
- nenhuma URL, `project-ref`, `db push`, `db reset --linked` ou comando livre no adaptador;
- todos os estágios permanecem bloqueados e declarativos;
- falha em qualquer fingerprint fecha a sessão;
- produção, Meta e build permanecem proibidos;
- destruição do staging descartável continua obrigatória.

## Evidência disponível

Nenhuma evidência real foi recebida nesta fase. Portanto:

- adaptador real foi emitido: **não**;
- nonce real foi recebido ou consumido: **não**;
- replay foi executado: **não**;
- staging foi acessado: **não**;
- banco remoto foi acessado: **não**;
- produção foi tocada: **não**;
- Meta foi tocado: **não**;
- build executado: **não**.

## Validação

Os testes verificam a cadeia de fingerprints, frescor da confirmação, entropia mínima do nonce, ordem exata dos 12 estágios, ausência de segredos e bloqueio integral. O construtor deve falhar sem as duas evidências reais e o nonce em memória.

## Referências oficiais verificadas em 19/07/2026

- [Gerenciamento de ambientes no Supabase](https://supabase.com/docs/guides/deployment/managing-environments)
- [Referência atual do Supabase CLI](https://supabase.com/docs/reference/cli/usage)
- [Testes de banco e RLS](https://supabase.com/docs/guides/local-development/testing/overview)
- [Security e Performance Advisors](https://supabase.com/docs/guides/database/database-advisors)
- [Changelog com breaking changes](https://supabase.com/changelog?tags=breaking-change)

## Próxima etapa

Fase 42: preparar o supervisor efêmero do executor, com máquina de estados, `stop-on-error`, rollback e destruição obrigatória. Ele continuará sem acesso remoto até existir um adaptador real da Fase 41, ainda válido, e uma nova validação humana imediatamente antes do consumo.
