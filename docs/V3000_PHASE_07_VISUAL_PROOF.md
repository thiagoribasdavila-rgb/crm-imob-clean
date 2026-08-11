# Atlas One V3000 — Fase 7: prova visual e recuperação do piloto

## Resultado

O piloto V3000 de Notificações voltou a ter uma rota canônica completa e
compilável. A página é uma composição Server Component; sessão, consulta,
Realtime e mutações permanecem isolados no componente cliente existente.

## Falha encontrada e corrigida

A rota `app/(crm)/notifications/page.tsx` estava ausente no estado de trabalho,
embora o componente operacional e os contratos das Fases 5 e 6 já existissem.
Isso impedia compilação, teste e qualquer prova visual honesta do piloto. A rota
foi recomposta sem restaurar páginas antigas ou interferir na consolidação maior
do workspace.

## Evidência de experiência

| Camada | Prova aplicada |
| --- | --- |
| Decisão | prazo vencido aparece como primeira orientação |
| Métricas | abertos, não lidos e vencidos usam os dados reais da API |
| Prioridade | vencidos ficam antes da lista completa |
| Trabalho | caixa preserva abrir, ler e dispensar |
| Contexto | estado do Realtime fica separado da fila de trabalho |
| Teclado | skip link leva ao workspace focável |
| Mobile | contexto lateral empilha e ações respeitam largura estreita |
| Falha | erro é anunciado e oferece nova tentativa |
| Governança | nenhuma mensagem ou conclusão é automática |

## Contratos preservados

- `GET` e `PATCH /api/v1/task-reminders`;
- Bearer token da sessão Supabase;
- filtro Realtime pelo responsável;
- RLS e isolamento por organização;
- navegação para lead ou tarefa;
- estados de loading, vazio e erro recuperável;
- autenticação, banco e migrations sem alteração.

## Validação executada

| Gate | Resultado |
| --- | --- |
| Contratos focados V3000, Fases 5, 6 e 7 | 19/19 aprovados |
| Verificador de notificações em tempo real | aprovado |
| TypeScript | zero erro |
| ESLint | zero aviso e zero erro |
| Integridade do diff | aprovado |
| Acesso anônimo a `/notifications` | redireciona para `/login?next=%2Fnotifications` |

A Fase 8 reutilizou de forma segura a sessão já autenticada no navegador do
usuário, sem copiar credenciais, cookies ou segredos. A prova encontrou uma
divergência de release: a rota existe e está aprovada no código local, mas a
Hostinger ainda responde com a página 404 do Atlas em `/notifications`.
Portanto, a validação autenticada em desktop e mobile permanece bloqueada até a
publicação controlada do piloto atual — não por falha do contrato visual local.

## Escopo intocado

- Command Center, Leads e Pipeline;
- dados comerciais e usuários;
- Supabase, migrations e policies;
- Hostinger, deploy e pacote de release;
- remoções e consolidações em andamento no restante do workspace.

## Gate para a próxima página

Uma segunda página só deve adotar o template após validação autenticada no
ambiente de homologação. A próxima candidata deve ser operacional, de baixo
risco e já possuir API, persistência, estados e permissões funcionais.
