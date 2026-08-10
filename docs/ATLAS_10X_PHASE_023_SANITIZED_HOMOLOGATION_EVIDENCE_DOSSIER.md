# ATLAS AI OS — Fase 23/24

## Objetivo

Transformar o resultado de um ensaio local descartável realmente concluído em
um dossiê sanitizado, verificável e adequado à decisão humana de homologação.
A Fase 23 não executa o ensaio, não inicia Docker, não aplica migration, não
consulta projeto linked e não cria build ou ZIP.

## Estado real

O contrato está pronto, mas o dossiê continua bloqueado. Ainda não existem:

1. recibo sanitizado de execução concluída da Fase 22;
2. revisão humana válida, de uso único e com até 30 minutos;
3. as provas reais que esses dois artefatos representam.

O avaliador atual passa 16 de 84 gates. Os demais ficam explicitamente
bloqueados, sem transformar ausência de evidência em aprovação.

## Cadeia de confiança

```text
Plano F22 + autorização consumida
              ↓
Ensaio local descartável concluído
              ↓
Recibo mínimo: hashes + contagens + booleanos
              ↓
Revisão humana curta e vinculada ao SHA-256
              ↓
Dossiê sanitizado gerado somente em memória
              ↓
Decisão humana final da Fase 24
```

Cada hash liga o dossiê ao recibo, à migration, ao pgTAP e ao baseline. Texto
livre, SQL, saída da CLI, credenciais e dados reais não entram no artefato.

## Evidência mínima exigida

- 18 de 18 testes pgTAP aprovados, sem falha ou skip;
- lint no nível `error`, com zero erros;
- fingerprints de schema e histórico diferentes depois da migration;
- fingerprints restaurados exatamente ao baseline após a reconstrução;
- testes aprovados antes da limpeza e depois da restauração;
- cleanup somente do `atlas-phase-022-rehearsal`;
- zero container e volume residual;
- zero uso de `--all`;
- zero tráfego externo, seed ou fixtures reais.

## Cobertura de segurança

O dossiê só é formado quando a revisão humana confirma:

- CRUD anônimo negado;
- CRUD entre tenants negado;
- CRUD permitido ao proprietário autorizado;
- troca de tenant da linha negada;
- grants explícitos da Data API **e** RLS verificados juntos;
- views respeitando o invocador;
- execução pública de função privilegiada negada;
- segredo de serviço ausente do cliente.

Grants controlam se um papel alcança o objeto; RLS controla quais linhas esse
papel pode acessar. Um controle não substitui o outro.

## Compatibilidade de plataforma

Antes de homologar um alvo real, a Fase 24 deve registrar a versão PostgreSQL,
extensões e mudanças de plataforma do projeto hospedado. O suporte ao
PostgreSQL 14 terminou em 1º de julho de 2026 e ambientes self-hosted têm
orientações próprias de atualização para PostgreSQL 17. Nenhuma conclusão do
stack local prova automaticamente o hardening do ambiente hospedado.

## Proteção de privacidade

O dossiê aceita somente:

- SHA-256;
- contagens;
- estados booleanos;
- timestamps;
- identificadores técnicos previamente fixados.

Ele rejeita credenciais, connection strings, dados pessoais ou comerciais,
usuários Auth, objetos Storage, SQL e saídas brutas.

## Como medir

```text
npm run atlas:homologation-evidence:assess
npm run atlas:homologation-evidence:check
```

O primeiro comando apenas avalia arquivos. O segundo valida o contrato e roda
mutantes locais em memória. Nenhum deles executa Supabase CLI.

## Referências oficiais

- [Testing and linting com Supabase CLI](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Proteção da Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Segurança de produto](https://supabase.com/docs/guides/security/product-security)
- [Breaking changes](https://supabase.com/changelog?tags=breaking-change)
- [Developer Update — julho de 2026](https://supabase.com/changelog/47796-developer-update-july-2026)
- [Fim do suporte ao PostgreSQL 14](https://supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026)
- [Atualização self-hosted PostgreSQL 15 → 17](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change)

## Próxima etapa

Fase 24/24: receber o dossiê realmente formado e emitir a decisão humana final
de homologação, com checklist e plano de mudança separados. Isso ainda não
presume nem autoriza leitura linked, aplicação remota, produção, build ou ZIP.
