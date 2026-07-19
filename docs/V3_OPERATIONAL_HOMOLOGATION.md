# ATLAS V3 — Homologação operacional

## Correções aplicadas

- Contexto multi-tenant compatível com os schemas V2 e V3.
- Pipeline deixa de depender de colunas V3 ausentes para resolver identidade e score.
- Relatórios usam `score_ia` por adapter e oportunidades derivadas somente de leads reais.
- Clientes 360 usa `customers` quando disponível e `leads` como fonte única compatível no legado.
- Agenda usa `due_date`, `user_id`, `next_action` e `next_contact` como fallbacks seguros.
- Usuários e permissões interpretam nome e papel legados sem exigir `full_name`, `access_role` ou `commercial_role` no banco.
- Projetos globais do legado somente podem ser lidos sem `organization_id` na homologação e para a organização padrão configurada.

## Estado dos módulos

| Módulo | Código | Banco legado | Teste Hostinger pendente |
| --- | --- | --- | --- |
| Command Center | Pronto | Conectado | Abrir por perfil |
| Pipeline | Pronto | `leads` | Movimentar e recarregar |
| Projetos | Pronto | `projects` | Conferir 3 projetos e vínculos |
| Clientes 360 | Pronto | fallback `leads` | Pesquisar cliente real |
| Agenda | Pronto | `tasks` + leads | Conferir prazos |
| Tarefas | Pronto | adapter legado | Criar, concluir e recarregar |
| Usuários | Pronto | `profiles` | Conferir os 4 perfis |
| Relatórios | Pronto | `score_ia` | Conferir score médio |

## Percentual

- Infraestrutura: 100%
- Deploy técnico: 100%
- Interface: 94%
- Compatibilidade dos módulos: 90%
- Banco operacional: 78%
- Homologação total: 84%

O percentual não inclui como concluídas as escritas autenticadas ainda não repetidas na Hostinger.

## Riscos controlados

1. Três perfis estão inativos e não devem ser reativados sem decisão administrativa.
2. `projects` não possui `organization_id`; sua leitura global está limitada à homologação e ao tenant padrão.
3. RPCs V3 de movimentação/recorrência ainda precisam de confirmação no banco remoto antes da liberação comercial.
4. Produção não deve utilizar organização padrão por fallback.
