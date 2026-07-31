# MATRIZ MIGRATIONS — REPOSITÓRIO × BANCO

**2026-07-31. Somente leitura. Nenhuma migration aplicada.**
Método: nomes normalizados dos dois lados (prefixo numérico removido em ambos), e
verificação de **existência do objeto no schema real** para cada divergência.

---

## RESUMO

| medida | valor |
|---|---|
| Arquivos em `supabase/migrations/` | **177** |
| Registros em `supabase_migrations.schema_migrations` | **223** |
| Nomes distintos no banco | **218** |
| Reaplicações (mesmo nome, versões diferentes) | **30 nomes**, 5 linhas extras |
| No repositório e **não registradas** | **4** — todas com objeto existente |
| No banco e **sem arquivo** no repositório | **15** |
| **Divergência de schema real** | **0** |

---

## A. AS 4 DO REPOSITÓRIO QUE NÃO CONSTAM NO BANCO

Nenhuma exige ação: as quatro estão aplicadas sob outro nome de registro.

| migration | data | no repo | consta no banco | objeto existe no schema | aplicação anterior | duplicada/substituída | classificação | necessária p/ fila | decisão | rollback |
|---|---|:--:|:--:|:--:|---|---|---|:--:|---|---|
| `corrige_move_pipeline_lead` | 27/07 | ✔ | ✘ | **✔** `public.move_pipeline_lead` | sim, como `corrige_move_pipeline_lead_coluna_title` | substituída pelo nome com sufixo | **segura** | não | **nenhuma ação** | n/a |
| `regras_de_comissao` | 27/07 | ✔ | ✘ | **✔** tabela `public.commission_rules` | sim, sob outro nome | não | **segura** | não | **nenhuma ação** | n/a |
| `grafo_de_oportunidade_de_receita` | 30/07 | ✔ | ✘ | **✔** 3 views + 4 funções (`vw_grafo_demanda`, `vw_grafo_oferta`, `vw_grafo_censo_de_arestas`, `private.ator_alcanca_lead`, `grafo_clientes_para_empreendimento`, `grafo_aptidao_do_corretor`) | sim, sob outro nome | não | **segura** | não | **nenhuma ação** | n/a |
| `auxiliares_e_fronteira_do_relogio` | 31/07 | ✔ | ✘ | **✔** `posiciona_evento_de_prova`, `envelhece_lock_de_prova`, `reivindica_eventos_da_fila`, `prova_de_fronteira_do_relogio` | sim, em **3** registros: `auxiliares_de_prova_do_relogio`, `prova_de_fronteira_do_relogio`, `reivindicacao_com_recorte_de_topico` | consolidada num arquivo depois de 3 aplicações | **segura** | **sim** — é a reivindicação atômica | **nenhuma ação** | drop das 4 funções, no cabeçalho do arquivo |

---

## B. AS 15 QUE EXISTEM SÓ NO BANCO

Estas são o **drift real e remanescente**: aplicadas via API, sem arquivo. Um clone
limpo que rodasse os 177 arquivos ficaria sem elas.

| migration registrada | classificação | necessária p/ fila-worker | decisão recomendada |
|---|---|:--:|---|
| `reivindicacao_com_recorte_de_topico` | segura | **sim** | versionar *(o conteúdo já está em `20260731050000`)* |
| `prova_de_fronteira_do_relogio` | segura | **sim** | versionar *(idem)* |
| `auxiliares_de_prova_do_relogio` | segura | **sim** | versionar *(idem)* |
| `corrige_move_pipeline_lead_coluna_title` | segura | não | versionar |
| `harden_internal_trigger_functions` | **ambígua** — mexe em gatilho interno | não | versionar **após** ler o `statements` gravado |
| `explicit_data_api_grants` | **ambígua** — altera GRANT | não | versionar após leitura; GRANT é a classe do incidente de 30/07 |
| `rls_policies_tabelas_sem_politica_helper_lead_scope` | **ambígua** — mexe em RLS | não | versionar após leitura |
| `reapply_phase_17_after_tenant_policies` | **ambígua** — reaplicação de isolamento | não | versionar após leitura |
| `phase_7_operational_recovery` | segura | não | versionar |
| `consumo_de_ia_do_dia_em_public` | segura | não | versionar |
| `finops_uso_de_infra_publico` | segura | não | versionar |
| `geolocalizacao_corrige_ambiguidade_do_out_param` | segura | não | versionar |
| `geolocalizacao_demanda_nao_perde_lead_sem_bairro` | segura | não | versionar |
| `documenta_armadilha_do_development_id_das_fontes` | documental | não | versionar |
| `tabela_de_comissao_por_projeto_e_incorporadora` | segura | não | versionar |

**Nenhuma é destrutiva.** Quatro são **ambíguas** porque tocam em GRANT, RLS ou
gatilho — e essas três áreas já produziram um incidente de segurança neste projeto
(a escalação de privilégio de 30/07 nasceu de um `GRANT` reconcedido por uma
migration posterior). Nenhuma deve ser versionada sem ler o `statements` gravado.

---

## C. AS 30 REAPLICADAS

Mesmo nome registrado em versões diferentes. Isto **não** é defeito: é o registro
honesto de migrations idempotentes rodadas mais de uma vez.

Mais reaplicadas: `harden_auth_profile_provisioning` (**×4**),
`auto_provision_auth_profiles` (×3), `cleanup_legacy_auth_provisioning` (×3),
`atlas_ai_memory` (×3). As demais, ×2.

O agrupamento em torno de **provisionamento de autenticação** é o rastro de uma
correção que precisou de quatro tentativas — coerente com o histórico do projeto,
não com corrupção de registro.

---

## D. POR QUE OS NÚMEROS NÃO FECHAM DE FORMA ÓBVIA

```
177 arquivos no repositório
    − 4 sem registro (mas aplicadas sob outro nome)
    = 173 com correspondência

223 registros no banco
    − 5 linhas de reaplicação
    = 218 nomes distintos
    − 15 que só existem no banco
    = 203 … dos quais 173 correspondem ao repositório
```

A diferença remanescente vem de **nomes de registro que não batem com o nome do
arquivo** — consequência de `apply_migration` gravar o nome que o chamador passa.

---

## E. DECISÃO

> **Nenhuma migration deve ser aplicada.** O schema está completo.
>
> A única ação recomendada — e **opcional, sem urgência** — é versionar as 15 da
> seção B, para o repositório voltar a reconstruir uma base do zero. As 4 marcadas
> como ambíguas exigem leitura do `statements` antes.

**Regra que evita a recorrência:** ao usar `apply_migration`, passar exatamente o
nome do arquivo. As 4 divergências da seção A e boa parte da confusão de nomes vêm
de não ter feito isso.

Ver `DIAGNOSTICO_DRIFT_MIGRATIONS.md` para o motivo de este projeto ter reportado
"109 não aplicadas" — e por que esse número era falso.
