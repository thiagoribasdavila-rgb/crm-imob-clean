# ATLAS 10X — Fase 7/24

## Ensaio isolado de RLS e matriz real de acesso

### Objetivo

Transformar os achados da fase 6 em contratos explícitos, removendo atalhos
legados e preparando uma prova segura de isolamento multi-tenant. Nenhuma
alteração remota faz parte desta fase.

### Regra central

Grants e RLS são camadas diferentes:

- **Grants** determinam se um papel alcança uma tabela ou função pelo Data API.
- **RLS** determina quais linhas continuam visíveis depois desse acesso.
- Uma tabela interna não deve depender apenas de RLS: `anon` e `authenticated`
  perdem o acesso direto e o servidor usa `service_role`.
- `service_role` nunca pode ser enviado ao navegador.

As recomendações atuais do Supabase favorecem privilégios explícitos para
tabelas expostas. As referências usadas são:

- [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Hardening the Data API](https://supabase.com/docs/guides/database/secure-data)

### Matriz aprovada nesta fase

| Grupo | Acesso direto | Caminho aprovado |
|---|---|---|
| Conversas, mensagens, ferramentas e uso de IA legados | `service_role` | servidor e trilha de auditoria |
| Aprendizado e score derivados | `service_role` | pipelines confiáveis |
| Rate limit e identidade de lead | `service_role` | função/trigger interno |
| Conhecimento | `service_role` | recuperação com tenant validado no servidor |
| `projects` legado | `service_role` | migração; UI usa `developments` |
| usuários e falhas de provisionamento legados | `service_role` | reconciliação/migração |

Os papéis `broker`, `manager`, `superintendent` e `director_admin` continuam
acessando os objetos comerciais canônicos por policies próprias. Eles não
recebem acesso direto às 12 estruturas internas/legadas desta fase.

### Funções privilegiadas

1. Gatilhos de comissão e inteligência de projeto perdem execução direta.
2. `distribute_project_leads`, `effective_distribution_rule` e
   `search_knowledge_chunks` ficam somente no servidor até a prova de vínculo
   com tenant.
3. `create_lead_atomic`, `current_organization_id`, `current_user_role` e
   `mutate_crm_project_v1` mantêm o contrato autenticado atual apenas para o
   ensaio positivo e negativo da Fase 8.
4. Novas funções do schema público deixam de herdar `EXECUTE` público por
   padrão no candidato de ensaio.

### Limpeza do legado

Os dois consumidores diretos restantes de `public.projects` foram retirados:

- o portal da incorporadora consulta apenas `developments`;
- a reativação usa o resultado canônico, inclusive no modo protegido.

Isso elimina um fallback de navegador que poderia reabrir uma tabela antiga
sem vínculo confiável com organização.

### Pacote de ensaio preparado

- Matriz: `config/atlas-10x-phase-007-access-matrix.json`
- Candidato reversível:
  `supabase/migration-drafts/20260723070000_phase_007_rls_access_hardening_candidate.sql`
- Guard de rollback:
  `supabase/migration-drafts/20260723070000_phase_007_rls_access_hardening_candidate.rollback.sql`
- Contrato pgTAP:
  `supabase/tests/database/phase_007_rls_access_matrix.test.sql`

O candidato:

- exige `app.atlas_rls_rehearsal_environment=isolated_clone`;
- detecta drift nas 12 tabelas;
- não contém `COMMIT`;
- não apaga dados ou tabelas;
- termina obrigatoriamente em `ROLLBACK`.

### O que ainda não está provado

A análise estática não substitui uma prova real com JWTs e dados de dois
tenants. A Fase 8 deverá restaurar uma cópia isolada e comprovar:

1. `anon` sem acesso;
2. corretor vendo apenas a própria carteira;
3. gerente vendo apenas seus subordinados;
4. diretor vendo sua organização;
5. tenant A sem acesso ao tenant B;
6. tentativa de forjar `actor_id` negada;
7. caminhos positivos funcionando;
8. rollback restaurando o estado anterior;
9. advisors sem os achados-alvo.

### Critério de saída

Esta fase está concluída quando a matriz, os consumidores canônicos, o
candidato reversível e os testes estáticos passam. Ela **não** libera
homologação real nem produção; isso depende do ensaio da Fase 8.
