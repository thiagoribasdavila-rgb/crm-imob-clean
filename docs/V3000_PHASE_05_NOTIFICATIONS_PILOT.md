# Atlas One V3000 — Fase 5: piloto real em Notificações

## Resultado

A página `/notifications` é o primeiro piloto real do template canônico V3000. A
mudança reorganiza a experiência sem trocar API, schema, RLS, autenticação ou
regras operacionais.

## Por que esta página

Notificações é uma superfície operacional real e de risco controlado. Ela tem
dados, mutações, Realtime e estados de interface suficientes para provar o
template, mas não altera o núcleo de Leads, Pipeline ou Command Center.

## Arquitetura aplicada

- `app/(crm)/notifications/page.tsx` permanece Server Component e compõe o
  `V3000PageTemplate`.
- `components/atlas/notifications-v3000-surface.tsx` concentra somente estado,
  sessão, API e Realtime no cliente.
- Os slots cliente compartilham um provider único, sem duplicar consulta ou
  assinatura.
- A página segue a ordem canônica: decisão, métricas, urgência, trabalho e
  contexto detalhado.

## Paridade comprovada

| Contrato existente | Estado no piloto |
| --- | --- |
| Sessão Supabase e Bearer token | Preservado |
| GET `/api/v1/task-reminders` | Preservado |
| PATCH para leitura e dispensa | Preservado |
| Filtro Realtime por corretor | Preservado |
| Atualização silenciosa após evento | Preservado |
| Fallback manual | Preservado |
| Navegação para lead ou tarefa | Preservado |
| Loading, vazio e erro recuperável | Preservado e refinado |
| Região `aria-live` | Preservada |
| Nenhum contato automático | Preservado |
| Nenhuma conclusão automática | Preservado |

## Ganho de experiência

1. Tarefas vencidas aparecem antes da caixa completa.
2. Ação primária e caminho para tarefas ficam explícitos.
3. Estado do Realtime sai do cabeçalho e vira contexto lateral.
4. Governança fica em divulgação progressiva, reduzindo ruído.
5. Falha de sessão ou API oferece tentativa novamente no mesmo contexto.

## Escopo intocado

- API `/api/v1/task-reminders`;
- migrations e banco Supabase;
- RLS e isolamento por organização;
- autenticação e sessão;
- menu e rotas;
- Command Center, Leads e Pipeline;
- Hostinger e deploy.

## Gates da fase

- contrato do template canônico;
- contrato do piloto de Notificações;
- verificador histórico de Realtime da Fase 45;
- TypeScript;
- ESLint;
- integridade do diff.

## Próxima fase recomendada

Validar responsividade, teclado, foco e contraste do piloto antes de expandir o
template para uma segunda página operacional. As superfícies centrais continuam
bloqueadas até essa prova.
