# ATLAS AI OS — Fase 42/100

## Objetivo

Preparar o supervisor efêmero que poderá, em uma fase posterior, controlar o replay da amostra 02 em **staging isolado e descartável**. Esta fase cria somente a máquina de estados e o recibo selado do supervisor. Não executa replay, migração, Supabase remoto, Meta, campanha, deploy ou build.

## Problema resolvido

O adaptador da Fase 41 descreve os doze estágios, mas não governa transições, falhas, timeout, rollback e destruição. A Fase 42 adiciona esse controle sem transformar o plano em executor.

O supervisor somente pode ser preparado com:

1. adaptador real da Fase 41, ainda válido, imutável e não consumido;
2. validação humana final emitida há no máximo cinco minutos e válida por no máximo dez minutos;
3. confirmação vinculada por SHA-256 ao adaptador, ao alvo descartável e à política exata da máquina de estados.

Mesmo com essas provas, o supervisor nasce no estado `SUPERVISOR_PREPARED_EXECUTION_BLOCKED`.

## Máquina de estados

Cada um dos doze estágios possui:

- identificador allowlisted, sem comando executável;
- tentativa máxima igual a uma;
- timeout declarativo de quinze minutos;
- transição de sucesso somente para o próximo estágio;
- transição de erro ou timeout para `HALTED_ROLLBACK_REQUIRED`;
- rollback de emergência obrigatório após falha;
- destruição obrigatória do alvo após sucesso ou falha;
- estado terminal único `DESTROYED`.

Nenhum estágio pode ser pulado, repetido automaticamente ou reordenado.

## Fluxo seguro

```text
Adaptador real da Fase 41 (0600)
              +
Validação humana final (0600)
              +
Fingerprint da política do supervisor
              |
              v
Supervisor selado da Fase 42 (0600)
              |
              v
SUPERVISOR_PREPARED_EXECUTION_BLOCKED
              |
              v
Worker e permissão operacional continuam ausentes
```

## Controles obrigatórios

- staging separado de produção;
- adaptador deve permanecer não consumido;
- nonce não é recebido, lido, persistido ou consumido nesta fase;
- nenhuma URL, `project-ref`, `db push`, `db reset --linked`, fragmento de shell ou comando livre;
- nenhuma credencial ou linha de dado real no supervisor;
- `stop-on-error` e `stop-on-timeout` obrigatórios;
- falha exige rollback e destruição, mesmo se o rollback falhar;
- produção, Meta, deploy e build permanecem proibidos.

## Evidência disponível

Nenhuma evidência real foi recebida nesta fase. Portanto:

- supervisor real foi emitido: **não**;
- adaptador real foi consumido: **não**;
- nonce real foi recebido ou consumido: **não**;
- worker foi iniciado: **não**;
- replay foi executado: **não**;
- staging foi acessado: **não**;
- banco remoto foi acessado: **não**;
- produção foi tocada: **não**;
- Meta foi tocado: **não**;
- build executado: **não**.

## Validação

Os testes cobrem cadeia de fingerprints, validade temporal, alteração da política, reuso do adaptador, estados proibidos, reordenação dos estágios, ausência de rollback, destruição omitida, tentativa automática, escalada para produção e inclusão de segredos. O construtor falha fechado sem as duas evidências reais.

## Referências oficiais verificadas em 19/07/2026

- [Gerenciamento de ambientes no Supabase](https://supabase.com/docs/guides/deployment/managing-environments)
- [Deployment e ambientes isolados](https://supabase.com/docs/guides/deployment)
- [Referência atual do Supabase CLI](https://supabase.com/docs/reference/cli/usage)
- [Testes de banco e RLS](https://supabase.com/docs/guides/local-development/testing/overview)
- [Changelog com breaking changes](https://supabase.com/changelog?tags=breaking-change)

## Próxima etapa

Fase 43: preparar o contrato de permissão operacional efêmera e consumo atômico do adaptador. A permissão continuará separada do supervisor e nenhum replay será executado até existir worker revisado, alvo descartável conferido e autorização humana de uso único imediatamente antes do consumo.
