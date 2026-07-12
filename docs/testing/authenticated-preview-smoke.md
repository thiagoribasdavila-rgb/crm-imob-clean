# Smoke autenticado do Preview

Este teste valida o fluxo real de autenticação e CRM Leads sem depender do navegador.

## Pré-requisitos

Crie `.env.local` a partir de `.env.example` e configure:

```env
PREVIEW_URL=https://crm-imob-clean-kvkv-git-81e3be-thiagoribasdavila-rgbs-projects.vercel.app
TEST_EMAIL=
TEST_PASSWORD=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Quando o Preview estiver protegido pela Vercel, configure também:

```env
VERCEL_AUTOMATION_BYPASS_SECRET=
```

Nunca versione `.env.local` nem compartilhe os valores dos segredos.

## Executar

```bash
npm ci
npm run smoke:auth:preview
```

## Cobertura

O script verifica:

1. API de leads sem autenticação retorna `401`;
2. login real no Supabase;
3. `/api/v1/auth/me` retorna `200`;
4. dashboard protegido responde com sessão válida;
5. listagem inicial de leads;
6. criação de lead retorna `201`;
7. repetição com a mesma `Idempotency-Key` retorna o mesmo lead;
8. duplicidade de contato com outra chave retorna `409`;
9. consulta por ID;
10. atualização de status;
11. Lead 360;
12. lead criado aparece na busca.

Os registros de teste usam `source = atlas_e2e` e e-mail no domínio reservado `example.invalid`.
