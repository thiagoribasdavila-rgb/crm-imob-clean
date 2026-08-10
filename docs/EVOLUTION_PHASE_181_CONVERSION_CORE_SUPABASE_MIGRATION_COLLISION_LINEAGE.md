# Fase 181 — Linhagem segura das colisões de migrations

## Resultado

As três versões locais duplicadas foram consolidadas em um dossiê determinístico com seis arquivos, hashes SHA-256, tamanho e objetos SQL referenciados. O registro remoto capturado em 23/07 foi cruzado pelo nome lógico para preservar a linhagem histórica, mas permanece explicitamente incapaz de comprovar o estado remoto atual.

## Linhagens observadas

| versão local em colisão | arquivo local | intenção histórica observada |
| --- | --- | --- |
| `20260716235900` | `meta_director_daily_reports` | `20260716235900` |
| `20260716235900` | `omnichannel_integrations` | `20260716235901` |
| `20260717203000` | `expand_project_material_catalog` | `20260717203000` |
| `20260717203000` | `phase_35_follow_up_sla_cycles` | `20260717203001` |
| `20260717213000` | `phase_36_visit_sla` | `20260717213000` |
| `20260717213000` | `v3_legacy_runtime_schema_bridge` | `20260717213001` |

Essas intenções são históricas. Elas **não** autorizam renomear os três arquivos com sufixo `01`, aplicar SQL, reparar o ledger ou concluir a reconciliação.

## Estado factual

- catálogo local: 131 arquivos, 128 versões únicas;
- colisões: 3 versões e 6 arquivos;
- correspondências históricas: 6 de 6;
- evidência remota atual com nomes: ausente;
- resoluções operacionais: 0;
- Supabase real, administrador, organização e dados: intocados;
- build, ZIP e deploy: não executados.

## Verificação

```bash
npm run evolution:phase-181:assess
npm run evolution:phase-181:check
```

O próximo passo seguro é obter, somente após autorização operacional explícita, evidência atual e somente leitura contendo os nomes do histórico remoto. Até isso ocorrer, o dossiê falha fechado.
