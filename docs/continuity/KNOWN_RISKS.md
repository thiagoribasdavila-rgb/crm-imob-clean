# KNOWN_RISKS — depois da unificação completa de 2026-07-24

| id | risco | severidade | evidência | mitigação / estado |
|---|---|---|---|---|
| **R-01** | **O deploy aponta para o banco ERRADO.** Existem dois projetos Supabase e o dado e o schema estão separados. | **crítico** | Verificado ao vivo em 2026-07-24 (ver quadro abaixo) | **Não é falta de migration.** O `atlas-v3-homologacao` tem **176 migrations aplicadas** e todos os 12 RPCs que os portões exigem — mas **0 leads**. O `atlas-ai-crm-v1` tem **17.151 leads** e só **24 tabelas** (schema legado, sem os RPCs) — e é para ele que `.env.hostinger` aponta. Decisão de infraestrutura pendente. |
| **R-01b** | **`migration-status.txt` descreve o projeto errado.** | alto | o arquivo mostra Remote vazio para 128 migrations | Ele reflete o `atlas-ai-crm-v1`, não o alvo de homologação. Foi a fonte do meu diagnóstico errado de "128 migrations não aplicadas". Regenerar apontando para o projeto certo, ou marcar explicitamente a qual projeto se refere. |
| **R-02** | **Indicadores que existem mas mentem.** `team-sla` devolve `followUpsMeasured`, `complianceRate` e `averageFollowUpMinutes` **cravados em 0/null**. | **alto** | `app/api/v1/analytics/team-sla/route.ts:171-178` | A tabela `follow_up_sla_events` **existe** em homologação (a migration da fase 35 está aplicada) — mas com **0 linhas**, e a base de homologação tem 0 leads. Ou seja: mesmo ligando a medição, o painel exibiria zero. **Não pintar esses números** até haver evento real; senão o portão fica verde exibindo zero como se fosse medição. |
| **R-03** | **31 commits não enviados ao remoto.** | alto | `git rev-list --count origin/claude/atlas-v3-entregas..HEAD` | A branch **existe** no `origin` em `8171a397` (o trabalho antigo está salvo); o bloco recente não. O bundle `atlas-one-v100-pre-complete-merge.bundle` é o único backup fora do disco — **copie-o para outro lugar**. Push é decisão do dono. |
| **R-04** | **Os `*:check` não estão em `npm test` nem no build.** Uma entrega pode passar em tudo e quebrar um contrato. | alto | `cc23:check` caiu para 27/30 sem que testes, tsc, lint ou build acusassem | Recomendação em aberto: incluir `cc23:check` e `light-layout:check` num alvo padrão. Enquanto isso, a regra de rodar os checks afetados está no `NEXT_SESSION_PROMPT`. |
| **R-05** | **`security:dependencies` vermelho sem correção viável.** `brace-expansion <=5.0.7`. | médio | `npm audit`; a linha v1 termina em 1.1.16, que é a própria versão vulnerável | Forçar a v5 **quebra o ESLint** (`minimatch@3` usa a API antiga) — testado e revertido. Chega por `read-excel-file → unzipper → fstream → rimraf → glob@7`. Padrões glob internos, não controlados por usuário. As 3 altas originais (sharp, fast-uri, @hono/node-server) **foram corrigidas**. |
| **R-06** | **7 decisões de produto em aberto** travam 2 portões e 1 melhoria de tela. | médio | `PRODUCT_DECISIONS_REQUIRED.md` | Cada uma com opções e consequências levantadas. Nenhuma foi decidida unilateralmente. |
| **R-07** | **`live-hierarchy` liga todo corretor a `managers[0]`** quando o perfil não tem `reports_to`. | médio | `lib/compat/live-hierarchy.ts` | **Confirmado por consulta em 2026-07-24: dos 6 perfis em homologação, os 6 têm `team` vazio.** A correção proposta (derivar por `team`) produziria `reports_to: null` para todo mundo e os corretores **sumiriam** dos painéis de gerente — exatamente a quebra que eu previa. A decisão certa foi não aplicar. Para desbloquear: popular `team`, ou derivar de `reports_to`, que 5 dos 6 já têm. |
| **R-08** | **Tema claro cobre só parte do produto** (páginas públicas, shell interno, pipeline). | médio | `docs/LIGHT_LAYOUT_EVOLUTION.md` | Quem ativar o claro hoje vê telas inconsistentes em Command Center, Leads, Projetos e Copilot. Fundação e check já existem. |
| **R-09** | **Validação de tema é numérica, não perceptual.** | médio | `THEME_VALIDATION.md` | 27 pares de contraste medidos, 0 reprovações AA — mas nenhuma captura de tela. Não há navegador headless e a instrução proíbe instalar dependência sem necessidade. Não prova layout quebrado ou sobreposição. |
| **R-10** | **Múltiplas sessões editam o mesmo working tree.** | médio | histórico do projeto; nesta sessão um subagente detectou arquivos mudando durante a análise (era esta própria execução) | Regra respeitada em todos os 24 commits: **nunca `git add -A`**, sempre caminho explícito. |
| **R-11** | **`supabase/` do ZIP nunca analisado** — 7 migrations, 5 drafts, 6 testes SQL, incluindo endurecimento de RLS. | médio | `NEW_ZIP_INVENTORY.md` | Bloqueado pelo gatilho de parada de banco. Precisa de sessão com autorização explícita. |
| **R-12** | **RLS viva é só por tenant, sem hierarquia.** | médio | `docs/META_RLS_STAGING_GATE_REPORT.md`: "Isolamento runtime aprovado: não", 0 de 11 cenários executados | Relevante para qualquer decisão sobre trocar cliente admin por cliente do usuário: o ganho não se materializa hoje. `requireLeadAccess` já valida acesso pelo cliente do usuário. |
| ~~R-13~~ | ~~`dist/hostinger/` com ZIPs antigos fazendo checks passarem sobre artefato obsoleto~~ | — | — | **RESOLVIDO** no commit `b05775e6`. |

## Os dois bancos — quadro verificado ao vivo (2026-07-24)

| projeto | ref | tabelas | leads | migrations | quem aponta para ele |
|---|---|---|---|---|---|
| `atlas-v3-homologacao` | `pozbrcsfthnhmnebfoxv` | 176 | **0** | **176 aplicadas** | `.env.local` (desenvolvimento) |
| `atlas-ai-crm-v1` | `ietwopslgqxlenfyghqk` | 24 | **17.151** | schema legado | `.env.hostinger` e `hostinger.env` (deploy) |

**Os 12 RPCs que os portões exigem existem, todos, em homologação** — verificado por consulta:
`manage_commercial_profile`, `create_recurring_task`, `process_due_task_recurrences`,
`redistribute_absent_broker_leads`, `configure_broker_capacity`, `configure_distribution_priority`,
`distribute_project_leads_v3`, `distribute_project_leads_v4`, `accept_lead_assignment`,
`process_expired_lead_reservations`, `get_portfolio_audit_ledger`, `transition_commercial_proposal`.
As colunas também: `leads.first_response_minutes`, `leads.first_contact_sla_met`,
`opportunities.value`, `profiles.{commercial_role,reports_to,team}`.

**Consequência para os 12 portões:** eles não estão travados por falta de migration — estão
travados porque **o deploy aponta para o banco que não tem os RPCs**. Ligar o código aos RPCs
hoje faria a aplicação funcionar em desenvolvimento e **quebrar no Hostinger**.

**A decisão real, que é sua:** ou o deploy passa a apontar para homologação (que tem o schema
mas está vazia — precisaria da carga de dados), ou o `atlas-ai-crm-v1` recebe as migrations
(mas tem 17.151 leads reais, então é operação com dado de cliente, não exercício de schema).

## O que foi eliminado nesta unificação

Scanner de segredos cego para segredo no início de arquivo · JWT sem detecção nenhuma ·
4 CVEs de libvips via `sharp` · comissão gravada sem trilha de auditoria · rotas de etapa sem
rate limit · 8 telas com TypeError garantido · build baixando o Next implicitamente ·
export inválido em página do Next · 3 checks dando falso negativo · 1 check contradizendo a si
mesmo · nome de artefato apontando para pacote obsoleto.
