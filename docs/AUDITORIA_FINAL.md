# AUDITORIA FINAL — ATLAS ONE

> **Números oficiais:** `docs/auditoria/INDICADORES_OFICIAIS.md` — prevalece sobre
> qualquer número deste relatório. Vários foram corrigidos depois de publicados; o
> registro de cada correção está em `docs/auditoria/REGISTRO_FALSOS_POSITIVOS.md`.

**2026-07-30.** 15 dimensões auditadas em paralelo, 163 achados, 12 submetidos a
refutação adversarial de *default refutado*.

**Resultado da refutação:** nenhum mecanismo foi derrubado — e **11 de 12 tiveram a
criticidade rebaixada** (7 de crítico para alto, 4 para médio), porque o dano alegado
não passou na régua do próprio projeto. Isso muda a leitura de forma importante:

> **Não há incêndio.** Há uma corrente de transmissão que nunca foi ligada, e vários
> elos dela estão partidos.

---

## 1. DECISÃO

# 🔴 NÃO LIBERADO

**Não liberado para a entrada de R$ 10.000/mês de verba de mídia.**

Isto **não** é ordem para desligar o que roda hoje. Os 6 perfis podem seguir
trabalhando as 482 leads existentes: identidade e deduplicação estão comprovadamente
corretas — 482/482 com nome, 482/482 com telefone, 482 `phone_normalized` distintos,
482 `identity_key` distintos, **zero grupos duplicados**, e zero lead fictícia apesar
de o seed definir 18 endereços `@exemplo.test`.

**O que não está liberado é converter dinheiro em lead através deste sistema.**

### As cinco evidências que sustentam a recusa

**1. O agendador não roda.** Um evento entrou na fila em 28/07 22:50:05 com
`available_at = created_at` (elegível na hora) e só chegou a `attempts=1` em 30/07
19:44 — **44h49m de fila parada** — contra cadência versionada `*/2 * * * *` em
`config/workers-schedule.json`. Esse worker é o elo que transforma um webhook da Meta
em lead no CRM.

**2. A produção não está rodando o código auditado.** A chave `agendamento` está
**ausente** de `/api/v1/ready` em 6 sondagens consecutivas, e o bloco que a produz
retorna objeto em todos os caminhos e é serializado incondicionalmente. Ausência só é
possível se o build for anterior ao commit `6e97b1fb`. **As correções de hoje não
estão no ar.**

**3. Não existe elo medido entre reais e lead.** `marketing_spend` 0 linhas,
`campaigns` 0, `meta_daily_reports` 0, `product_budgets` 0. Em
`lead_attribution_touches`, apenas **24 de 482 leads (5,0%)** têm `ad_external_id`, 3
têm `page_external_id`, e **não existe coluna `utm_*`** (18 colunas, nenhuma). Com
R$ 10.000 entrando, o sistema não consegue dizer qual anúncio trouxe quem.

**4. O ciclo de otimização da Meta está cego nos dois sentidos.** `LeadDisqualified`
lê `lead_events/lead_discarded` = 0 linhas, contra **110 leads perdidas**;
`sale_value_brl` é 0 de 482, **inclusive na única venda ganha**. Houve **1 evento CAPI
na vida inteira**, em modo `test`. A Meta nunca recebeu sinal de resultado — o
algoritmo dela otimiza sem saber o que deu certo.

**5. O caminho ao vivo nunca entregou uma lead.** `meta_lead_events` tem 4 linhas na
história: 3 com `"backfill": true` puxadas à mão, e 1 que é **ensaio da própria
diretoria** (o `leadgen_id` é o epoch do próprio `received_at`).

### O que mudaria para LIBERADO COM RESTRIÇÕES

Os quatro primeiros bloqueadores fechados e **provados pelo dado, não pelo comando**:
crontab instalado e comprovado por um evento saindo de `attempts=1` sozinho; build no
ar publicando a chave `agendamento`; `marketing_spend` com linha real do investimento;
e um evento CAPI fora do modo `test` com `sale_value_brl` preenchido.

**Isso é trabalho de horas a poucos dias, não de meses.**

---

## 2. NOTAS POR DIMENSÃO — média **4,1/10**

| Dimensão | Nota | A evidência que justifica |
|---|---:|---|
| Rotas e código morto | **6,0** | inventário completo, mas rotas órfãs e duplicadas convivem |
| Custos e FinOps | **5,5** | custo real medido (USD 0,011/30d), mas painel construído e não montado |
| Autenticação e RBAC | **5,0** | 3 campos de papel convivendo; `commercial_role` é quem manda |
| Página de Leads | **5,0** | 2.295 linhas; falta virtualização, filtros salvos e ações em massa |
| Segurança e RLS | **4,5** | escalação de privilégio reproduzida — **corrigida em `e3296928`** |
| Arquitetura de IA | **4,5** | governança construída, fora do git e sem consumidor |
| Observabilidade | **4,5** | `catch {}` e `?? 0` transformando falha em zero |
| Performance | **4,5** | `.limit()` como letra morta; quebra antes de 10.000 leads |
| Design System | **4,5** | não há sistema único; superfície cravada quebra no tema claro |
| Banco e migrations | **3,5** → ver ressalva | um clone limpo **não** reconstrói o schema — mas por **15** migrations sem arquivo, não pelas "109" que este relatório chegou a citar |
| Ingestão de leads | **3,5** | o caminho ao vivo nunca entregou uma lead real |
| Qualidade dos dados | **3,5** | identidade impecável; atribuição e valor comercial ausentes |
| Análise preditiva | **3,0** | existe pontuação, **não existe modelo** |
| Integrações e filas | **2,5** | agendador parado 44h49m; CAPI com 1 evento em modo teste |
| **Memória de aprendizado** | **2,0** | **a mais baixa** — `lead_copilots` tem 478 linhas, todas com `memory='{}'` e `interaction_count=0` |

**Nenhuma dimensão foi considerada pronta para produção pelo próprio auditor.**

---

## 3. RESPOSTAS DIRETAS ÀS PERGUNTAS DA SEÇÃO 15

**Há risco de perda de lead?** **Sim, e é o risco principal.** O agendador parado
significa que a fila não drena sozinha. Não é perda silenciosa de dado — o payload é
preservado — mas é lead que **chega e não é trabalhada**.

**Há risco de inconsistência de dados?** **Baixo na identidade, alto na atribuição.**
Zero duplicatas em 482 leads. Mas 95% das leads não sabem de qual anúncio vieram.

**A página de Leads suporta o volume planejado?** **Não.** Sem virtualização, e há
consultas usando `.limit()` que o PostgREST corta em 1000 sem erro.

**A IA está proativa e controlada?** **Nem uma coisa nem outra.** Os controles
(Shadow Mode, níveis de autonomia, registro de modelos) foram construídos, estão
**fora do repositório** e **sem um único consumidor**.

**A memória está funcionando?** **Não.** 478 registros de copiloto, todos com memória
vazia e zero interações. Enviar histórico de conversa ao modelo não é memória.

**As previsões têm precisão mensurável?** **Não existem previsões.** Existe
`score_ia`, que correlaciona **r ≈ 0,88** com `data_quality_percent` — é completude de
cadastro com outro nome. `conversion_feature_snapshots` tem 0 linhas.

**Nível real de maturidade:** **produto operacional em uso interno, com fundação
comercial incompleta.** O CRM funciona para quem já está dentro. A camada que
transforma investimento em receita mensurável não está fechada.

---

## 4. O QUE FOI CORRIGIDO HOJE, COM PROVA

| Correção | Commit | Prova |
|---|---|---|
| Escalação de privilégio em RPC | `e3296928` | ataque reproduzido → **RECUSADO** após a correção |
| Motivo do descarte era exigido e destruído | `d7b8dd0c` | 12/12, os dois lados da guarda |
| `/pipeline/discards` mostrava zero sobre 110 perdas | `73633e82` | 16/16 contra o banco |
| Funil desenhava etapa inexistente | `c39aa3e8` | 19/19, etapas vêm da configuração |
| Página do cliente pedia matching e recebia `[]` | `eeb13523` | 10/10, dois lados do filtro |
| Fonte única de verdade documentada | `0e01e07a` | 43 arquivos fora do git identificados |

---

## 5. A PRÓXIMA AÇÃO IMEDIATA — UMA SÓ

> **Publicar o build atual e instalar o crontab dos workers no servidor.**

É a de maior valor por esforço, e destrava as outras: sem ela, **nenhuma correção
desta sessão está no ar**, e a fila não drena. Depende de acesso ao servidor — é sua,
não minha.

O sinal de que funcionou não é o comando ter rodado: é `/api/v1/ready` passar a
publicar a chave `agendamento`, e um evento da fila sair de `attempts=1` sozinho.

---

## 6. ANTES DISSO, UM CONGELAMENTO

O procedimento de deploy documentado **destrói a credencial que funciona**.
`GO-LIVE.md:32-33`, `LAUNCH_STATUS.md:142-143` e `docs/GO_LIVE_SEQUENCE.md:37` mandam
copiar `.env.hostinger` inteiro para o servidor. Esse arquivo tem `META_APP_SECRET`
com **9 caracteres** (placeholder) e WhatsApp com comprimento **0**.

Provado assinando o mesmo payload contra `/api/webhooks/meta` em produção:

| Segredo usado | Resposta |
|---|---|
| placeholder de 9 chars (o que o runbook manda copiar) | **HTTP 401** `invalid_signature` |
| segredo real de 32 chars (o que está no ar) | **HTTP 200** |

E o runbook autoritativo (`RUNBOOK_DEPLOY_HOSTINGER.md:146`) diz o **oposto**: *"Este
runbook não transfere .env nenhum"*. Duas verdades para o mesmo procedimento — e
seguir a errada derruba a integração da Meta.

---

## 6-bis. ⚠️ CORREÇÃO PUBLICADA EM 2026-07-31 — o drift de migrations era falso

Este relatório e o `ATLAS_ONE_SOURCE_OF_TRUTH.md` reportaram um drift grande de
migrations. **O número estava errado, e o erro era do comparador que eu escrevi.**

A coluna `name` de `supabase_migrations.schema_migrations` tem dois formatos
convivendo (`20260711040000_atlas_v3_foundation` e `atlas_v3_foundation_base_tables`).
O comparador removia o prefixo numérico **só do lado do repositório**.

| comparação | resultado |
|---|---|
| versão com defeito | **109 faltando** |
| os dois lados normalizados | **4 faltando** |
| e dessas 4, com objeto existente no schema | **4 de 4** |

**O drift de schema real é ZERO.** Toda migration do repositório tem seus objetos no
banco — verificado função por função e view por view.

O que permanece verdadeiro, e é menor e mais preciso: **15 migrations existem só no
banco**, sem arquivo. Um clone limpo ficaria sem elas. Detalhamento em
`MATRIZ_MIGRATIONS_REPO_BANCO.md` e `DIAGNOSTICO_DRIFT_MIGRATIONS.md`.

---

## 7. HONESTIDADE SOBRE ESTA PRÓPRIA AUDITORIA

- **Nenhum achado sobreviveu como crítico** após a refutação. Sete foram rebaixados
  de crítico para alto porque o dano exigia condição que hoje não existe.
- **19 achados de criticidade alta não passaram pelo cético** (recorte dos 12 mais
  graves). Eles estão registrados como **não verificados**.
- **~20% dos 1087 contratos não existem num clone limpo** — o verde só vale nesta
  máquina. Ver `ATLAS_ONE_SOURCE_OF_TRUTH.md` seção 3.
- WhatsApp e SMTP **não foram medidos** nesta rodada.
