# ATLAS AI OS — Fase 13/100

## Homologação de RLS, identidade e hierarquia comercial

### Objetivo

Comprovar, sem dados reais e sem alterar produção, que a regra comercial do Atlas respeita a hierarquia Diretor → Superintendente → Gerente → Corretor e bloqueia qualquer leitura ou escrita entre organizações.

### Resultado desta fase

- PostgreSQL 17.5 efêmero executado com dados inteiramente sintéticos.
- Migration real de hierarquia comercial executada sem cópia simplificada.
- 24 cenários e 44 verificações aprovados.
- Corretor enxerga somente a própria carteira.
- Gerente enxerga apenas sua equipe.
- Superintendente enxerga sua estrutura e a fila sem responsável.
- Diretor enxerga toda a própria organização, nunca outra empresa.
- Usuário inativo não recebe dados.
- Metadados editáveis no JWT não elevam permissão.
- `UPDATE` exige tanto acesso à linha atual quanto permissão sobre o estado novo.
- `anon` não tem acesso à tabela; `service_role` fica restrita ao servidor.

### O que ainda não está homologado

O teste local reproduz as claims que o Postgres recebe, mas não assina tokens nem atravessa a Data API. Portanto ele não prova:

- login real do Supabase Auth;
- atualização/expiração de JWT;
- RLS através do PostgREST/Data API;
- comportamento no banco publicado;
- backup e restauração do clone;
- execução do pgTAP e do lint no stack Supabase completo.

O snapshot remoto sanitizado ainda mostra políticas somente por organização, sem referência à hierarquia. Por isso produção continua bloqueada.

### Ativos preparados

- `scripts/test-meta-rls-jwt-postgres.mjs`: prova semântica local.
- `supabase/tests/database/phase_013_rls_jwt_contract.test.sql`: 30 contratos pgTAP.
- `scripts/run-meta-rls-jwt-supabase-staging.mjs`: teste Data API com usuários sintéticos.
- `scripts/preflight-meta-rls-jwt-staging.mjs`: gate fail-closed.
- `config/fixtures/meta-rls-jwt-evidence-template.json`: evidência sem segredos e sem PII.

### Procedimento obrigatório no clone isolado

1. Criar um projeto Supabase separado de produção e restaurar somente estrutura e fixtures sintéticas.
2. Aplicar a reconciliação canônica após aprovação e depois a hierarquia comercial.
3. Executar os contratos:

```bash
supabase test db supabase/tests/database/phase_013_rls_jwt_contract.test.sql --db-url "$ATLAS_RLS_TEST_DATABASE_URL"
supabase db lint --db-url "$ATLAS_RLS_TEST_DATABASE_URL" --schema public,private --level warning --fail-on error
```

4. Criar contas exclusivas de teste para dois tenants e preencher as variáveis `ATLAS_RLS_TEST_*` fora do repositório.
5. Executar `npm run meta:phase-013:staging` e salvar somente a saída sanitizada.
6. Atualizar o template de evidência e executar `npm run meta:phase-013:preflight`.
7. Obter aprovação do diretor e revisão de segurança antes de qualquer promoção.

### Regras de segurança aplicadas

- Autorização vem do banco, não de `user_metadata` editável pelo usuário.
- `auth.uid()` sem sessão retorna nulo e não libera linhas.
- RLS e privilégios de tabela são controles separados e ambos são exigidos.
- Funções `SECURITY DEFINER` têm `search_path` vazio e execução restrita.
- Nenhum token, e-mail, UUID real ou dado comercial é persistido nos relatórios.

### Decisão

Fase 13 aprovada para semântica PostgreSQL local. Não libera migration, produção, eventos Meta, campanhas, orçamento, público ou build.

### Próxima fase

Fase 14/100: homologar Auth com JWT assinado e Data API em um clone Supabase isolado, executar pgTAP/lint e comprovar restauração após os probes de escrita.
