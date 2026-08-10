# ATLAS AI OS — Fase 17/24

## Dossiê de decisão para homologação

Esta fase transforma provas locais aprovadas em uma decisão rastreável de
**preflight manual** para uma branch Supabase isolada. Ela não cria branch,
não consulta schema remoto, não aplica migration e não autoriza produção.

## Resultado seguro de hoje

O contrato foi concluído e o dossiê não foi gerado. Continuam ausentes:

1. resultado executado e aprovado do ensaio local da Fase 16;
2. manifesto imutável da Fase 15;
3. restauração isolada aprovada do banco e do Storage;
4. descritor sanitizado de uma branch de homologação;
5. aprovação humana independente, de uso único e vinculada por SHA-256.

Ausência de evidência sempre bloqueia a decisão.

## Fluxo protegido

```text
manifesto F15 + ensaio F16 repetido
                  ↓ hashes
restore isolado do banco e Storage
                  ↓ prova
branch Supabase isolada e sem dados reais
                  ↓ descritor sanitizado
revisão independente + registro de riscos
                  ↓ 64 gates
dossiê de preflight manual em memória
```

O dossiê não contém comandos de aplicação e não promove nenhum ambiente.

## Alvo permitido

Somente uma destas opções pode ser descrita:

- preview branch Supabase;
- persistent branch Supabase.

Em ambos os casos o ambiente precisa ser `homologation`, estar isolado de
produção, não ser a branch principal e usar apenas dados vazios (`data_less`)
ou sintéticos (`synthetic_only`).
O descritor aceita somente hashes do project ref e do alvo. URL, chaves,
connection string e project ref em texto são proibidos.
Campos extras também são recusados: o descritor possui forma exata e
versionada.

O estado esperado é `preflight_pending`: a existência da branch não é tratada
como prova de saúde.

## Evidência local obrigatória

- PostgreSQL 17 e Supabase CLI 2.109.1 comprovados.
- Permit local consumido.
- Dois resets e dois testes dinâmicos aprovados.
- Histórico de migrations, lint e advisors aprovados.
- Delta de catálogo igual à allowlist.
- Idempotência e revisão humana aprovadas.
- Evidência sanitizada e nenhuma interação remota.

## Recuperação obrigatória

Antes de qualquer preflight:

- banco restaurado em ambiente isolado;
- Storage restaurado;
- pacote V3 anterior preservado e imutável;
- smoke autenticado aprovado;
- RTO e RPO medidos;
- diretoria aprovou a evidência;
- rollback aponta para a versão V3 anterior, nunca para o arquivo V2.

## Decisão humana

A aprovação:

- é válida por no máximo 24 horas;
- é de uso único;
- usa identificador opaco para o revisor;
- exige independência do revisor local e do aprovador da recuperação;
- vincula manifesto, migration, teste, ensaio, recuperação e alvo por SHA-256;
- exige responsável e disposição para todo risco;
- rejeita risco alto ou crítico simplesmente aceito;
- autoriza somente o preflight manual da homologação.

## Comandos seguros desta fase

```bash
npm run atlas:homologation-dossier:assess
npm run atlas:homologation-dossier:check
```

Eles leem somente artefatos locais, executam contratos sintéticos e imprimem o
diagnóstico. Não gravam o dossiê, não iniciam Supabase e não acessam ambiente
remoto.

## Referências oficiais

- [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase Branching](https://supabase.com/docs/guides/deployment/branching)
- [Working with branches](https://supabase.com/docs/guides/deployment/branching/working-with-branches)
- [Branch configuration](https://supabase.com/docs/guides/deployment/branching/configuration)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PostgreSQL 15 para 17](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change)

## Próxima decisão

A Fase 18 poderá executar somente um preflight sanitizado da branch isolada,
depois que todas as provas e a aprovação explícita existirem. A aplicação da
migration continuará fora do escopo.
