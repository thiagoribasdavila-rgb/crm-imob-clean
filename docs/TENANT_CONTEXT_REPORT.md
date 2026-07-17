# ATLAS V3 — Contexto do tenant

## Diagnóstico real em 17/07/2026

| Verificação | Resultado |
| --- | --- |
| Autenticação Supabase | Operacional |
| Perfis existentes | 4 |
| Perfis com `organization_id` | 4 de 4 |
| Organização operacional | `Atlas AI CRM` |
| Status da organização | `ACTIVE` |
| Perfis ativos | 1 administrador |
| Perfis inativos | 3 — preservados sem alteração automática |

## Causa do falso erro de organização

O resolvedor antigo solicitava `profiles.commercial_role` e `organizations.active`. Essas colunas não existem no contrato V2. O PostgREST rejeitava toda a seleção e o código convertia essa falha em “Usuário sem organização vinculada”, embora o vínculo existisse.

## Correção

- Perfil e organização agora são lidos com o contrato disponível e normalizados em memória.
- `organizations.status=ACTIVE` é aceito como organização ativa.
- Papéis `ADMIN`, `DIRETOR`, `GERENTE` e `CORRETOR` são normalizados para o RBAC V3.
- O fallback `ATLAS_DEFAULT_ORGANIZATION_ID` só é considerado em `ATLAS_ENV=homologation`, exige UUID válido, valida uma organização real e registra `fallback organization applied`.
- O fallback nunca cria usuário, organização ou dado comercial.

## Configuração da homologação Hostinger

```env
ATLAS_ENV=homologation
ATLAS_DEFAULT_ORGANIZATION_ID=8523bec1-1bef-4395-92ee-7458becc9b3f
```

Em produção, remova a variável de fallback e vincule todos os perfis explicitamente.
