# Atlas One V1000 — clean release

## Decisão

A homologação usa o projeto Supabase gratuito atual. Nenhuma branch paga ou infraestrutura adicional foi criada.

## Estado confirmado

- base comercial remota: zero registros;
- organizações e perfis: zero registros antes do primeiro acesso;
- catálogos estruturais de RBAC: preservados;
- RLS: ativo nas tabelas públicas auditadas;
- aplicação: empacotada sem segredos nem dados privados.

## Correções desta entrega

- seed local ausente substituído por seed vazio;
- primeiro administrador passa a criar a organização inicial quando necessário;
- autorização gravada em `app_metadata` e no perfil canônico;
- rollback cobre usuário Auth e organização recém-criada;
- onboarding protegido adicionado em `/setup`;
- pacote final documentado para Hostinger e Supabase atual.

## Limite conhecido

O histórico remoto contém migrations de fundação que não estão integralmente materializadas nos arquivos locais antigos. Esta entrega é instalável sobre o ambiente Supabase atual. Uma futura mudança para outro projeto requer exportação lógica autoritativa do schema antes da migração.

## Integrações

Meta, WhatsApp, IA, e-mail e calendários estão preparados, porém permanecem pendentes até configuração de credenciais e teste real supervisionado.

## Verificação externa pendente

A regressão, os contratos de segurança e o scanner de segredos passaram localmente. A consulta pública de vulnerabilidades do npm não pôde ser concluída porque o registro externo estava inacessível no momento do empacotamento. Ela permanece como gate explícito, sem aprovação presumida.
