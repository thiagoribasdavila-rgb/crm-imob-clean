# ATLAS AI OS — Fase 40/100

## Objetivo

Preparar o pacote fechado do replay da amostra 02 em **staging isolado**, sem executar replay, migração, Supabase remoto, Meta, campanha, deploy ou build.

## Problema resolvido

O contrato da Fase 39 organiza o que deve ser testado, mas não autoriza execução. Esta fase separa quatro provas reais que não podem ser inferidas uma da outra:

1. contrato real da Fase 39;
2. janela operacional autorizada, limitada a 120 minutos;
3. atestação de credenciais efêmeras fornecidas somente no ambiente seguro de execução;
4. nova aprovação humana, exclusiva para o replay no staging isolado.

O pacote liga essas provas por SHA-256, preserva a ordem dos 12 estágios e continua bloqueado até uma confirmação imediata com nonce de uso único.

## O que foi implementado

- gate formal da Fase 40;
- template vazio e fechado;
- validador offline com casos negativos;
- construtor offline que lê somente arquivos `0600`, rejeita links simbólicos e grava pacote `0600`;
- bloqueio de valores de credenciais, URLs, dados pessoais e linhas de negócio nos artefatos;
- validação de que a aprovação cobre toda a janela e dura no máximo 4 horas;
- validação de que a janela dura no máximo 120 minutos e começa em até 24 horas;
- exigência de destruição do staging descartável ao final;
- auditoria estática e regressão da cadeia de Fases 30–40.

## Fluxo seguro

```text
Contrato real da Fase 39 (0600)
              +
Janela autorizada de staging (0600)
              +
Atestação de credenciais sem valores (0600)
              +
Aprovação EXECUTE_ISOLATED_STAGING_ONLY (0600)
              |
              v
Pacote selado da Fase 40 (0600)
              |
              v
Replay continua bloqueado
              |
              v
Confirmação imediata + nonce de uso único (fase futura)
```

## Controles obrigatórios

- staging separado da produção e sem dados de produção;
- apenas dados sanitizados;
- credenciais entregues por ambiente seguro, nunca gravadas ou registradas;
- privilégio mínimo e rotação após o replay;
- `stopOnError`, rollback e destruição obrigatórios;
- aprovação da Fase 39 não vale como aprovação de execução;
- aprovação de execução não libera produção, Meta ou build;
- pacote aprovado não significa replay executado.

## Evidência disponível

Nenhuma evidência real foi recebida nesta fase. Portanto:

- pacote real foi emitido: **não**;
- replay foi executado: **não**;
- staging foi acessado: **não**;
- banco remoto foi acessado: **não**;
- produção foi tocada: **não**;
- Meta foi tocado: **não**;
- build executado: **não**.

## Validação

Os testes desta fase verificam estrutura, fingerprints, expiração, janela, isolamento, escopo de aprovação, ausência de segredos e falha fechada. A execução do construtor sem as quatro provas reais deve falhar.

## Referências oficiais verificadas em 19/07/2026

- [Gerenciamento de ambientes no Supabase](https://supabase.com/docs/guides/deployment/managing-environments)
- [Deployment e ambientes isolados](https://supabase.com/docs/guides/deployment)
- [Testes de banco e RLS](https://supabase.com/docs/guides/local-development/testing/overview)
- [Security e Performance Advisors](https://supabase.com/docs/guides/database/database-advisors)

## Próxima etapa

Fase 41: preparar o adaptador temporário de execução, ainda bloqueado até existir pacote real da Fase 40, confirmação humana imediata e nonce de uso único. Nenhum alvo de produção será permitido.
