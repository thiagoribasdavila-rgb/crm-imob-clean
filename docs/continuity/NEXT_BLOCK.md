# NEXT_BLOCK — próximo bloco recomendado

## Recomendação: **Bloco 1 — fechar as correções pontuais já mapeadas (2–3 h)**

Motivo: são 7 itens já investigados, cada um com defeito ou ganho identificado e escopo pequeno.
É o maior retorno por hora disponível agora, e não depende de decisão de produto.

| # | item | por quê | risco | pré-requisito |
|---|---|---|---|---|
| 1 | `bulk-transfer`: validar destino no escopo hierárquico + exigir `humanConfirmed` | hoje confia só no erro do banco | baixo | nenhum |
| 2 | `sales/[id]/commission`: rollback quando `commission_events` falha | inconsistência financeira silenciosa | baixo | nenhum |
| 3 | `pipeline/stages`: adicionar `enforceRateLimit` | rota sem limite | baixo | nenhum |
| 4 | PADRÃO F: parar de devolver `error.message` do banco em 5 rotas | vazamento de detalhe interno | baixo | nenhum |
| 5 | `lib/compat/live-hierarchy.ts`: derivar por `team` | hoje liga **todo** corretor a `managers[0]` | **médio** | conferir consumidores de relatório |
| 6 | `app/api/v1/tasks`: ligar recorrência ao RPC `create_recurring_task` | migration já existe no repo; feature bloqueada | **médio** | **confirmar o RPC no banco vivo** |
| 7 | `leads/actions/page.tsx`: adotar a página real | hoje é stub de 281 bytes com botões inertes | baixo | conferir rotas consumidas |

Fazer 1–4 primeiro (independentes, baixo risco). 5–7 exigem uma verificação a mais cada.

## Alternativas

**Bloco 2 — resolver os 21 conflitos manuais grandes (6–10 h).** Necessário antes de qualquer
novo ZIP da linha Atlas One, senão a divergência cresce. Vários são decisão de produto
(ex.: `dashboard` = redirect ou tela completa?), então precisa do dono junto.

**Bloco 3 — continuar o tema claro (3–5 h).** Hoje cobre páginas públicas, shell interno e
pipeline. Faltam Command Center, Leads, Projetos e Copilot. Quem ativar o claro hoje vê telas
inconsistentes. Fundação e check já existem; é trabalho de superfície.

**Bloco 4 — banco (bloqueado).** As 7 migrations e os 6 testes SQL do ZIP, incluindo
endurecimento de RLS, nunca foram analisados. **Exige autorização explícita** e precisa
enfrentar o drift (127+ migrations no repo vs ~23 tabelas no banco vivo).

## Antes de qualquer bloco: 2 decisões do dono

1. **Push.** 592 commits existem só neste disco. Nenhum backup fora da máquina.
2. **`security:secrets` vermelho.** Falso positivo, mas bloqueia a cadeia `validate` inteira no
   primeiro passo. Decidir entre ajustar o `allowedPublic`, reescrever a prosa do runbook, ou
   aceitar conscientemente.
