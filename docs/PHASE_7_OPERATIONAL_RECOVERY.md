# Atlas One — Fase 7: recuperação funcional real

Data: 23/07/2026  
Ambiente: Supabase `pozbrcsfthnhmnebfoxv`  
Regra aplicada: nenhuma alteração em administrador, organização, autenticação ou bootstrap.

## Resultado factual

| Módulo | Rota | Frontend | API | Banco | Permissões | Status real | Lacuna |
|---|---|---|---|---|---|---|---|
| Incorporadoras | `/developments/developers` | cadastro, lista e edição | `/api/v1/developers` | `developers` | diretoria; tenant | Funcional por contrato | prova operacional aguarda cadastro real |
| Projetos | `/developments`, `/developments/registry`, `/developments/[id]` | lista, busca, filtro, cadastro, edição e arquivo | `/api/v1/developments`, `/api/v1/developments/[id]` | `developments`, `development_profile_events` | diretoria; tenant | Funcional por contrato | prova operacional aguarda projeto real |
| Materiais | `/developments/materials`, `/developments/[id]/materials` | upload, busca, vigência e histórico | `/api/v1/developments/[id]/materials` | `project_materials`; bucket `project-materials` | liderança; tenant | Funcional por contrato | upload real aguarda projeto real |
| Estoque | `/developments/[id]/inventory` | CSV/XLSX, prévia, validação e aplicação | `/api/v1/developments/[id]/inventory/import` | `properties`, `inventory_import_batches`, `inventory_import_rows` | liderança; tenant | Funcional por contrato | importação real aguarda projeto e arquivo real |
| Usuários e equipes | `/settings/team`, `/users` | convite, papel, vínculo e ativação | `/api/v1/team`, recuperação de senha | `profiles`, Auth, auditoria | admin/diretoria; tenant | Parcial operacional | existem 1/5 perfis ativos; faltam e-mails reais |
| Campanhas | `/marketing/campaigns` | CRUD interno, indicadores, briefing e criativos | `/api/v1/marketing/campaigns`, `/api/v1/marketing/campaigns/[id]`, `/assets` | `campaigns`, `campaign_assets`; bucket privado | liderança; tenant | Funcional por contrato | prova operacional aguarda campanha real |
| Meta | `/integrations` | estado claramente sinalizado | APIs existentes | configuração externa | admin/diretoria | Preparado | credencial e teste real fora desta fase |

## Migration

- `20260723203000_phase_7_operational_recovery.sql`
- aplicada de forma aditiva;
- adiciona campos internos de campanha e `campaign_assets`;
- RLS e grants explícitos;
- não altera ou remove dados existentes.

## Evidências automatizadas

- TypeScript: aprovado.
- ESLint: aprovado.
- Incorporadoras: aprovado.
- Cadastro de projetos: aprovado.
- Central de materiais: aprovado.
- Importação CSV/XLSX: aprovado.
- Hierarquia comercial: aprovado.
- Recuperação de senha: aprovado.
- RLS: aprovado.
- Contratos gerais e da Fase 7: aprovados.

## Evidências remotas

- RLS ativo em `developers`, `developments`, `project_materials`, `properties`,
  `inventory_import_batches`, `inventory_import_rows`, `profiles`, `campaigns`
  e `campaign_assets`.
- Ambiente limpo confirmado: zero incorporadoras, projetos, materiais, importações
  e campanhas.
- Um perfil real ativo confirmado. Nenhum gerente ou corretor real está cadastrado.

## Gate de homologação operacional

O código e o banco estão preparados, mas não é correto alegar provas de upload,
importação e CRUD real sem criar dados. Como a fase proíbe dados fictícios, faltam:

1. cadastrar uma incorporadora e um projeto reais;
2. enviar um book real e confirmar leitura por URL assinada;
3. importar uma tabela real e confirmar a prévia;
4. convidar quatro usuários reais, incluindo gerente e corretor;
5. criar uma campanha interna real e anexar briefing/criativo.

Até essas cinco ações humanas ocorrerem, nenhum ZIP deve ser gerado.
