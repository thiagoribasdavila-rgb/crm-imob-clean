# Atlas One V1000 — reconciliação de migrations

Data: 23/07/2026  
Projeto remoto: `atlas-v3-homologacao` (`pozbrcsfthnhmnebfoxv`)

## Resultado

- 126 arquivos locais e 179 registros no ledger remoto foram comparados por nome lógico e conteúdo.
- O ledger remoto contém migrations históricas renomeadas/repetidas; por isso timestamps isolados não foram usados como prova.
- O administrador, perfil e organização existentes não foram recriados, removidos ou alterados.
- Nenhuma tabela foi apagada e nenhum reset foi executado.

## Aplicado com segurança

| Migration local | Decisão | Resultado |
|---|---|---|
| `20260711232000_add_missing_foreign_key_indexes.sql` | Aplicar após tornar opcional a criação de índices cujas colunas não existem | 22 índices compatíveis criados; seis índices incompatíveis foram ignorados |
| `20260723090000_explicit_data_api_grants.sql` | Aplicar | privilégios explícitos corrigidos |
| `20260723143000_harden_internal_trigger_functions.sql` | Aplicar | funções internas endurecidas e execução direta pública removida |
| `20260719092358_phase_029_meta_permit_atomic_ledger.sql` | Não aplicar | migration exige explicitamente `staging_clone`; homologação real não é clone descartável |

## Evidência antes/depois

| Objeto | Antes | Depois |
|---|---:|---:|
| Usuários Auth | 1 | 1 |
| Perfis | 1 | 1 |
| Organizações | 2 | 2 |
| Objetos no Storage | 0 | 0 |
| Índices compatíveis adicionados | 0 | 22 |
| Execuções inseguras nas 3 funções internas auditadas | 3 conjuntos | 0 |

## Pendências não aplicadas automaticamente

- Há migrations remotas antigas sem arquivo local equivalente. Elas foram preservadas no ledger e não foram recriadas.
- O assessor de segurança ainda aponta tabelas com RLS sem policy e RPCs `SECURITY DEFINER` acessíveis a `authenticated`. Algumas RPCs são intencionais e exigem revisão funcional antes de qualquer revogação.
- A proteção contra senhas vazadas permanece uma configuração do painel Supabase e não deve ser alterada por migration sem aprovação.

## Regra de continuidade

Toda futura reconciliação deve comparar nome lógico, assinatura dos objetos e efeito esperado. Nunca reaplicar apenas porque o timestamp local diverge do remoto.
