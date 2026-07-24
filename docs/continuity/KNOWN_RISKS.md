# KNOWN_RISKS — depois da unificação completa de 2026-07-24

| id | risco | severidade | evidência | mitigação / estado |
|---|---|---|---|---|
| **R-01** | **Drift de banco: 128 migrations locais nunca aplicadas.** A última aplicada no banco vivo é `20260716083708`. | **crítico** | `migration-status.txt` (coluna Remote vazia da `20260716210000` em diante) | É a causa raiz de **12 dos 14 portões vermelhos**, da recorrência de tarefas bloqueada, dos SLAs cravados em zero e da hierarquia comercial sem RPC. Nada foi aplicado — exige autorização. Ordem de aplicação em `NEXT_SESSION_PROMPT.md`. |
| **R-02** | **Indicadores que existem mas mentem.** `team-sla` já devolve `followUpsMeasured`, `complianceRate` e `averageFollowUpMinutes` **cravados em 0/null**, com `status: "awaiting-live-contact-events"`. | **alto** | `app/api/v1/analytics/team-sla/route.ts:171-178` | **Não pintar esses números no painel** enquanto a migration da fase 35 não subir: deixaria o portão verde exibindo zero como se fosse medição. Registrado para não ser "consertado" por engano. |
| **R-03** | **31 commits não enviados ao remoto.** | alto | `git rev-list --count origin/claude/atlas-v3-entregas..HEAD` | A branch **existe** no `origin` em `8171a397` (o trabalho antigo está salvo); o bloco recente não. O bundle `atlas-one-v100-pre-complete-merge.bundle` é o único backup fora do disco — **copie-o para outro lugar**. Push é decisão do dono. |
| **R-04** | **Os `*:check` não estão em `npm test` nem no build.** Uma entrega pode passar em tudo e quebrar um contrato. | alto | `cc23:check` caiu para 27/30 sem que testes, tsc, lint ou build acusassem | Recomendação em aberto: incluir `cc23:check` e `light-layout:check` num alvo padrão. Enquanto isso, a regra de rodar os checks afetados está no `NEXT_SESSION_PROMPT`. |
| **R-05** | **`security:dependencies` vermelho sem correção viável.** `brace-expansion <=5.0.7`. | médio | `npm audit`; a linha v1 termina em 1.1.16, que é a própria versão vulnerável | Forçar a v5 **quebra o ESLint** (`minimatch@3` usa a API antiga) — testado e revertido. Chega por `read-excel-file → unzipper → fstream → rimraf → glob@7`. Padrões glob internos, não controlados por usuário. As 3 altas originais (sharp, fast-uri, @hono/node-server) **foram corrigidas**. |
| **R-06** | **7 decisões de produto em aberto** travam 2 portões e 1 melhoria de tela. | médio | `PRODUCT_DECISIONS_REQUIRED.md` | Cada uma com opções e consequências levantadas. Nenhuma foi decidida unilateralmente. |
| **R-07** | **`live-hierarchy` liga todo corretor a `managers[0]`** quando o perfil não tem `reports_to`. | médio | `lib/compat/live-hierarchy.ts` | Não corrigido de propósito: a correção depende de `team` estar populado no banco vivo. Se estiver vazio, trocaria a distorção por corretores sumindo dos painéis de gerente. Consulta para desbloquear no `NEXT_BLOCK.md`. |
| **R-08** | **Tema claro cobre só parte do produto** (páginas públicas, shell interno, pipeline). | médio | `docs/LIGHT_LAYOUT_EVOLUTION.md` | Quem ativar o claro hoje vê telas inconsistentes em Command Center, Leads, Projetos e Copilot. Fundação e check já existem. |
| **R-09** | **Validação de tema é numérica, não perceptual.** | médio | `THEME_VALIDATION.md` | 27 pares de contraste medidos, 0 reprovações AA — mas nenhuma captura de tela. Não há navegador headless e a instrução proíbe instalar dependência sem necessidade. Não prova layout quebrado ou sobreposição. |
| **R-10** | **Múltiplas sessões editam o mesmo working tree.** | médio | histórico do projeto; nesta sessão um subagente detectou arquivos mudando durante a análise (era esta própria execução) | Regra respeitada em todos os 24 commits: **nunca `git add -A`**, sempre caminho explícito. |
| **R-11** | **`supabase/` do ZIP nunca analisado** — 7 migrations, 5 drafts, 6 testes SQL, incluindo endurecimento de RLS. | médio | `NEW_ZIP_INVENTORY.md` | Bloqueado pelo gatilho de parada de banco. Precisa de sessão com autorização explícita. |
| **R-12** | **RLS viva é só por tenant, sem hierarquia.** | médio | `docs/META_RLS_STAGING_GATE_REPORT.md`: "Isolamento runtime aprovado: não", 0 de 11 cenários executados | Relevante para qualquer decisão sobre trocar cliente admin por cliente do usuário: o ganho não se materializa hoje. `requireLeadAccess` já valida acesso pelo cliente do usuário. |
| ~~R-13~~ | ~~`dist/hostinger/` com ZIPs antigos fazendo checks passarem sobre artefato obsoleto~~ | — | — | **RESOLVIDO** no commit `b05775e6`. |

## O que foi eliminado nesta unificação

Scanner de segredos cego para segredo no início de arquivo · JWT sem detecção nenhuma ·
4 CVEs de libvips via `sharp` · comissão gravada sem trilha de auditoria · rotas de etapa sem
rate limit · 8 telas com TypeError garantido · build baixando o Next implicitamente ·
export inválido em página do Next · 3 checks dando falso negativo · 1 check contradizendo a si
mesmo · nome de artefato apontando para pacote obsoleto.
