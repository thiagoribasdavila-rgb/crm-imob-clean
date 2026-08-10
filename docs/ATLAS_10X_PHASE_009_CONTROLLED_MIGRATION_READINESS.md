# ATLAS 10X — Fase 9/24

## Migração controlada somente depois da prova

Esta fase não aplica DDL. Ela fecha a porta para alterações de schema sem
evidência e define a sequência reproduzível para transformar um achado real
do clone em uma migration revisável.

## Ordem obrigatória

1. reconciliar `supabase migration list` com o histórico remoto, em modo
   somente leitura;
2. resolver as versões locais duplicadas somente após saber quais arquivos já
   foram registrados;
3. instalar ou disponibilizar um runtime compatível com Docker;
4. inicializar a configuração local do Supabase com a versão fixada no
   projeto;
5. restaurar um clone sanitizado exclusivamente em loopback;
6. capturar o snapshot de ACL;
7. executar o pgTAP da Fase 8 dentro de transação com `ROLLBACK`;
8. produzir o diff mínimo a partir de falhas comprovadas;
9. criar migration e rollback pareados;
10. executar `supabase test db --local` e
    `supabase db lint --local --level error`;
11. solicitar aprovação humana antes de qualquer homologação.

## Colisões encontradas

Há três versões com dois arquivos cada:

- `20260716235900`;
- `20260717203000`;
- `20260717213000`.

Não renomear esses arquivos por conveniência. O histórico remoto precisa ser
comparado primeiro, pois uma migration já aplicada não pode ganhar outra
identidade sem uma estratégia explícita de reparo.

## Estado do ambiente local

- pacote do Supabase CLI fixado em `2.109.1`;
- `supabase/config.toml` ainda ausente;
- Docker ou runtime compatível não disponível;
- clone sanitizado não localizado;
- evidência dinâmica da Fase 8 ainda pendente.

## Segurança

O avaliador:

- não aceita `--linked`;
- não lê nem imprime valores de variáveis secretas;
- não aplica migrations;
- não renomeia arquivos;
- não cria usuários;
- não altera dados;
- não executa build;
- não cria ZIP.

## Saída esperada

Enquanto qualquer gate material estiver ausente, o estado correto é
`controlled_migration_rehearsal_blocked`. Isso não representa falha do
produto: representa a proteção contra uma alteração não comprovada.
