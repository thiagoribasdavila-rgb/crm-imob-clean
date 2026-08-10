# ATLAS AI OS — Fase 44/100

## Consumidor atômico e worker efêmero revisável

### Objetivo

Preparar, somente offline, o contrato que no futuro poderá reservar a permissão de replay, o nonce de uso único, o supervisor, o adaptador e a versão de consumo dentro de uma única fronteira transacional. Esta fase não cria função no banco, não consome permissão, não arma worker e não executa replay.

### O que foi corrigido

Uma simples sequência de cinco atualizações permitiria estado parcial: permissão consumida com worker não iniciado, ou supervisor iniciado com nonce ainda reutilizável. O contrato agora exige reserva integral com versão inicial zero, exatamente uma reserva aceita e recibo imutável na mesma transação.

### Fluxo futuro controlado

1. validar impressões digitais do permit, política, artefato e alvo;
2. confirmar sessão AAL2 e papel vindo de fonte confiável do banco ou metadado da aplicação;
3. confirmar tenant e staging descartável separado de produção;
4. abrir uma única fronteira transacional;
5. comparar `UNCONSUMED` e versão zero;
6. reservar, como unidade indivisível, permissão, nonce, supervisor, adaptador e versão;
7. anexar recibo imutável;
8. exigir exatamente uma reserva;
9. confirmar o commit;
10. só depois do commit confirmado permitir que o worker efêmero seja armado;
11. se o resultado do commit for incerto, bloquear e reconciliar em modo somente leitura, sem repetir;
12. destruir worker e alvo descartável ao final.

### Segurança incorporada

- AAL2 obrigatório e autorização de até um minuto, válida por no máximo dois minutos;
- autorização não pode vir de `user_metadata`;
- preferência por execução com privilégios do chamador e RLS/tenant preservados;
- eventual função privilegiada exigiria revisão separada, `search_path` seguro e privilégios de execução explicitamente revogados/reconcedidos;
- nenhuma sessão, claim, credencial, URL de banco, nonce ou valor de permit é persistido;
- permit e plano valem no máximo dois minutos;
- nenhum retry automático após commit ambíguo;
- caminho de produção e projeto vinculado permanecem ausentes.

### Estado produzido quando todas as três evidências reais existirem

`ATOMIC_CONSUMER_PREPARED_EXECUTION_BLOCKED`

Mesmo nesse estado:

- consumidor disponível: **não**;
- worker armado: **não**;
- permit consumido: **não**;
- nonce consumido: **não**;
- supervisor iniciado: **não**;
- adaptador executado: **não**;
- replay executado: **não**;
- staging alterado: **não**;
- produção alterada: **não**;
- Meta acionado: **não**;
- build executado: **não**.

O bloqueio remanescente é `runtime_transaction_boundary_and_final_execution_authorization_missing`.

### Validação local

- `npm run meta:phase-044:audit`
- `npm run meta:phase-044:preflight`
- `npm run meta:phase-044:check`

O builder `npm run meta:phase-044:prepare` falha fechado sem três arquivos reais, internos ao workspace, regulares, sem link simbólico e com permissão `0600`.

### Impacto operacional

O futuro replay passa a ter uma defesa explícita contra consumo duplo, estado parcial e retry inseguro. A operação atual continua intocada.

### Riscos ainda bloqueados

- fronteira transacional real ainda não existe;
- nenhum teste real no Postgres/Supabase foi executado;
- comportamento de commit incerto ainda não possui reconciliador real;
- staging descartável não foi acessado;
- autorização final de execução não existe.

### Próxima etapa

Fase 45: preparar o reconciliador de commit incerto e a autorização final vinculada à transação revisada, ainda sem consumir permissão, armar worker ou executar replay.

