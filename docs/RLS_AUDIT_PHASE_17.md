# Fase 17 — Auditoria RLS

## Resultado

O isolamento comercial foi revisado em cinco dimensões: organização, função, equipe, carteira e usuário. Leads, oportunidades e atividades mantêm a cadeia hierárquica já validada; tarefas passam a seguir a lead ou o responsável visível na cadeia.

| Superfície | Leitura | Escrita |
| --- | --- | --- |
| Perfis | cadeia comercial | própria conta; hierarquia via operação privilegiada auditada |
| Leads | carteira/equipe/cadeia | carteira/equipe/cadeia |
| Oportunidades | lead vinculada | lead vinculada |
| Atividades | lead vinculada ou autor | autor com acesso à lead |
| Tarefas | lead vinculada ou responsável visível | mesmo escopo da leitura |
| Campanhas | empresa | liderança comercial |
| Insights de IA | empresa | somente backend privilegiado |

As filas internas, falhas de provisionamento e chaves de idempotência perderam privilégios diretos de `anon` e `authenticated`. Foram adicionados índices para os filtros usados com maior frequência pelas políticas.

## Homologação externa pendente

A migração deve ser aplicada primeiro no Supabase de homologação. Depois, executar testes com cinco contas: diretor, superintendente, gerente, dois corretores de equipes diferentes e uma conta de outra organização. Validar também os advisors de segurança e desempenho antes da produção.
