# ATLAS AI OS — Fase 31/100

## Objetivo

Transformar o ensaio local da Fase 30 em uma prova técnica verificável. A Fase 31 não executa campanha, evento Meta, reserva de permissão ou mudança em banco remoto. Ela define o que uma evidência precisa comprovar antes de liberar a continuidade.

## Problema resolvido

Um resultado booleano como `approved` não basta para homologação. Agora a evidência precisa registrar:

- execução somente no alvo local `127.0.0.1:55432/atlas_phase30`;
- imagem Supabase/Postgres exata e sua impressão digital;
- versão real do PostgreSQL encontrada no ensaio;
- hashes SHA-256 dos seis artefatos executados;
- ordem monotônica: runtime, baseline, migration, segurança, rollback e destruição;
- ausência de segredos, URLs remotas, reserva de permissão, Meta e build.

## Fluxo aceito

1. Runtime local iniciado.
2. Contrato mínimo aplicado.
3. Migration oficial aplicada.
4. RLS, privilégios, funções e índices verificados.
5. Rollback iniciado.
6. Ausência final dos objetos verificada.
7. Containers e volumes destruídos.
8. Evidência reconciliada com os arquivos atuais do projeto.

Qualquer inversão, hash divergente, versão incompatível ou indício de segredo reprova a prova inteira.

## Segurança e integridade

O reconciliador:

- aceita somente arquivo regular dentro do workspace;
- rejeita link simbólico e arquivo acima de 1 MiB;
- não recebe URL de banco;
- não abre conexão de rede;
- não modifica banco;
- grava apenas um recibo sanitizado com hashes;
- falha fechado quando a evidência estiver ausente ou incompleta.

## Estado desta fase

- contrato estático e testes negativos: **preparados**;
- ensaio local: **não foi executado**;
- evidência real: **não recebida**;
- banco/produção/Meta: **não tocados**;
- build: **não executado**;
- avanço: **bloqueado até evidência real aprovada**.

## Compatibilidade futura

O ensaio continua fixado em `supabase/postgres:15.14.1.149`, preservando repetibilidade. Como o Supabase mudou o padrão de self-hosted de PostgreSQL 15 para 17 em junho de 2026, a Fase 32 deverá criar um gate separado de compatibilidade com PostgreSQL 17. A troca de major nunca será silenciosa nem misturada ao ensaio de referência.

Referências oficiais consultadas em 19/07/2026:

- [Testing and linting](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Local development](https://supabase.com/docs/guides/local-development)
- [Self-hosted PostgreSQL 15 para 17](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change)

## Próxima etapa recomendada

Executar manualmente o workflow isolado quando houver Docker disponível, reconciliar a evidência e, somente depois, preparar o ensaio complementar de compatibilidade PostgreSQL 17.
