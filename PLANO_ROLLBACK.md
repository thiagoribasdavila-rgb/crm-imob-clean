# PLANO DE ROLLBACK — ATLAS ONE (frente de fechamento)

Princípio desta frente: nada destrutivo foi feito. Nenhum id mudou, nenhuma
linha existente foi apagada, nenhuma migration remove coluna ou tabela. Por
isso todo rollback abaixo é pequeno e sem perda de dado.

## 1. Banco de dados

### Migration `20260728010000` (ponte crm_projects → developments)
Adiciona UMA coluna anulável e a preenche. Nenhum dado original é alterado.

```sql
-- rollback completo
alter table public.crm_projects drop column if exists development_id;
```

Efeito colateral do rollback: a ingestão volta a gravar `development_id` nulo
nas leads novas (com aviso em log `ponte_de_empreendimento_ausente`) — **não**
volta a perder lead, porque o código corrigido nunca põe o id de crm_projects
na coluna errada.

### Migration `20260727050000` (RPC `move_pipeline_lead`)
Corrigiu um insert numa coluna inexistente. Rollback = restaurar a versão
anterior da função a partir do arquivo da migration antiga
(`git show <commit>:supabase/migrations/...` da versão anterior). NÃO
recomendado: a versão anterior falha em todo movimento de Kanban.

### Registros criados em `meta_lead_sources` (formulários v8/v6)
Não são migration; desfazer é desativar (preserva histórico):

```sql
update public.meta_lead_sources set active = false
where form_id in ('1571460868037960','1601751148056662');
```

## 2. Código

Um assunto por commit — rollback cirúrgico por `git revert <sha>` (não usar
reset em branch compartilhada):

| Mudança | Commit | Observação ao reverter |
|---|---|---|
| Ingestão (ponte) + preflight WhatsApp + debug_token | `4c81510e` | reverter REARMA a perda de lead se houver fonte com empreendimento; desative as fontes v8/v6 antes (item 1) |
| Diagnóstico WhatsApp no meta:diagnostico | `68f15eab` | sem efeito em runtime |
| Preflight do CAPI | `a119b086` | reverter volta a falha silenciosa com flag ligada — manter flag OFF se reverter |
| RBAC diz a verdade | `8cd20eda` | reverter volta a mentira `backendEnforced: true` |
| Tema claro (regras de utilitário) | `a5b5ffdc` | só CSS; sem efeito em dado |
| Modelos de IA / cadeia por saldo | `8d2afb91`/`9e3824c2`/`1e141f9b` | reverter volta modelos aposentados — não reverter sem trocar env |

## 3. Ambiente (`.env` de homologação)

Alterados nesta frente (valores anteriores preservados em backup local na
máquina de origem):

- `WHATSAPP_PHONE_NUMber_ID` → antes vazio; rollback = esvaziar.
- `WHATSAPP_ACCESS_TOKEN` → antes um token de app errado (inválido no `/me`);
  rollback não tem valor útil — manter o atual.
- `ATLAS_AI_*` (modelos/ordem/tarifas) → rollback = esvaziar (padrões do código
  assumem `gpt-5.6-luna`).

Em produção, o `.env` nunca foi tocado por esta frente.

## 4. Objetos criados na Meta (fora do CRM)

- Formulários `Spin Mood (v8)` e `Arvo (v6)`: podem ser arquivados no
  Ads Manager a qualquer momento; leads já recebidas não são afetadas.
- NENHUMA campanha, conjunto, anúncio ou evento de conversão foi criado.

## 5. Kill-switches já existentes (não exigem rollback)

| Alavanca | Efeito |
|---|---|
| `ATLAS_META_CAPI_ENABLED` vazio/false | zero envio de conversão (estado atual) |
| `ATLAS_WHATSAPP_BRIDGE_SECRET` vazio | ponte por QR completamente desligada (estado atual) |
| `meta_lead_sources.active=false` | fonte retém leads em represadas em vez de criar |
| `ATLAS_TENTATIVAS_MINIMAS=3` | religa o piso de descarte do Kanban |
| Preflights (CAPI, WhatsApp) | falham FECHADO sozinhos — credencial/número errado nunca envia |
