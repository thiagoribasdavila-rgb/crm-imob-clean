# ATLAS AI OS — Fase 19/24

## Plano sanitizado de remediação Supabase

Esta fase converte a observação sanitizada da Fase 18 em uma fila de trabalho
determinística. Ela não consulta o Supabase e não gera SQL.

## Por que a camada existe

O preflight pode revelar contagens de problemas sem revelar nomes de objetos ou
dados. A Fase 19 preserva esse limite e transforma apenas sete contagens em
workstreams controlados:

1. cobertura RLS;
2. grants da Data API;
3. política de UPDATE com SELECT, USING e WITH CHECK;
4. contexto de segurança das views;
5. funções privilegiadas e grants de execução;
6. advisors de segurança;
7. advisors de performance.

`migration_entries` e `exposed_tables` são inventário. Eles não são tratados
automaticamente como falha.

## Priorização

- `P0`: autorização, isolamento tenant e superfície exposta;
- `P2`: performance, sempre depois da segurança;
- toda correção exige revisão humana;
- contagem zero não aprova produção;
- um número sozinho nunca determina a correção SQL.

## Fluxo

```text
evidência F17 + alvo + permit histórico + observação F18
                         |
                         v
                validação por hashes
                         |
                         v
              sete workstreams controlados
                         |
                         v
            plano em memória, sem SQL ou nomes
                         |
                         v
          revisão humana antes do desenho local F20
```

## Garantias

- forma exata para fontes, resumo e itens;
- todos os hashes são SHA-256;
- contagens devem coincidir com a observação;
- catálogo, prioridades e estratégias não são livres;
- SQL, saída CLI, nomes de objetos e credenciais são proibidos;
- nenhuma autorização remota é emitida;
- avaliador não grava arquivos e não executa comandos.

## Referências atuais

- Supabase separa grants de acesso a objetos e políticas RLS por linha.
- Tabelas em schemas expostos precisam de RLS e privilégio mínimo.
- `UPDATE` depende de política `SELECT` e deve proteger a linha existente e a
  nova linha.
- Views expostas precisam respeitar o contexto do chamador ou ser removidas da
  superfície pública.
- Advisors devem ser executados novamente depois de mudanças DDL.

## Situação atual

Os quatro artefatos operacionais ainda não existem no workspace. Portanto o
avaliador encerra bloqueado, sem fabricar findings e sem gerar um plano vazio
enganoso.

## Próxima fase

Fase 20/24: transformar somente workstreams revisados em especificações locais
de migration e testes, sem aplicação remota.
