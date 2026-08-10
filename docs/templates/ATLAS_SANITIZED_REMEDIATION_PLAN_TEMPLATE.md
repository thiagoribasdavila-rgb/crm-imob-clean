# ATLAS — plano sanitizado de remediação

> Template de leitura humana. O plano oficial é derivado em memória pelo
> avaliador da Fase 19 e nunca contém nomes de tabelas, políticas, views,
> funções, SQL, project ref, chaves, URLs, dados pessoais ou dados comerciais.

## Vínculo da evidência

- Dossier SHA-256: `<sha256>`
- Descritor do alvo SHA-256: `<sha256>`
- Permit histórico SHA-256: `<sha256>`
- Observação sanitizada SHA-256: `<sha256>`
- Catálogo SHA-256: `<sha256>`
- Ledger de migrations SHA-256: `<sha256>`
- Advisors SHA-256: `<sha256>`

## Resumo

- Findings sanitizados: `<contagem>`
- Workstreams ativos: `<contagem>`
- Workstreams sem findings observados: `<contagem>`
- Revisão humana: obrigatória
- Autorização de migration ou produção: nenhuma

## Workstreams permitidos

| ID | Classe | Prioridade | Contagem | Situação |
|---|---|---:|---:|---|
| WS-RLS-001 | Cobertura RLS | P0 | `<n>` | Requer desenho local |
| WS-GRANT-002 | Grants da Data API | P0 | `<n>` | Requer desenho local |
| WS-UPDATE-003 | Políticas de UPDATE | P0 | `<n>` | Requer desenho local |
| WS-VIEW-004 | Segurança de views | P0 | `<n>` | Requer desenho local |
| WS-DEFINER-005 | Funções privilegiadas | P0 | `<n>` | Requer desenho local |
| WS-SECADV-006 | Advisors de segurança | P0 | `<n>` | Requer desenho local |
| WS-PERFADV-007 | Advisors de performance | P2 | `<n>` | Requer desenho local |

## Limites

- Contagem zero significa somente que nenhum finding foi observado naquele
  snapshot; não significa homologação ou segurança absoluta.
- A prioridade é padrão conservador, não substitui triagem humana.
- Nenhuma migration foi gerada ou aplicada.
- Nenhuma branch, produção, linha real ou credencial foi acessada nesta fase.
- Um workstream só poderá virar especificação local na Fase 20 após revisão
  humana, testes de isolamento e vínculo pelos hashes acima.
