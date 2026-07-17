# Auditoria Atlas V3 - 10 fases

## Resultado executivo

O código compila e os contratos de login, sessão, RLS, hierarquia, APIs e segredos passam. A homologação ainda não pode ser considerada funcional porque o banco conectado está atrás do V3 e o endereço público permanece como placeholder.

## Fases

1. **Diagnóstico reproduzível** - concluída. Corrigidos o falso alerta da chave pública Supabase e a classificação de `ATLAS_PACKAGE_ENV_FILE`.
2. **Banco e migrations** - bloqueadora. Aplicar migrations em homologação, executar `npm run audit:runtime-schema` e exigir 8/8 superfícies.
3. **Login e hierarquia** - validar em runtime os cinco níveis: admin, diretor, superintendente, gerente e corretor.
4. **APIs resilientes** - testar autorização, rate limit, idempotência, timeout e respostas sem detalhes privados.
5. **CRM e pipeline** - provar cadastro, deduplicação, distribuição, transferência e ownership único de uma lead real.
6. **Projetos e materiais** - provar incorporadora, projeto, kit vigente, storage privado, vídeo e versionamento.
7. **Desempenho** - medir banco, API, renderização, bundle e navegação; otimizar apenas com evidência.
8. **Design e acessibilidade** - validar desktop/mobile, teclado, contraste, estados vazios, erro e carregamento.
9. **Segurança e recuperação** - executar backup, restore, revogação de sessão, logs, alertas e rollback.
10. **Homologação Hostinger** - gerar ZIP somente após smoke real, testar os perfis e exigir aprovação humana.

## Bloqueios atuais

- `ATLAS_ENVIRONMENT_ID` ausente.
- `ATLAS_DATABASE_ENVIRONMENT` ausente.
- `ATLAS_BASE_URL` aponta para `https://crm.seudominio.com.br`.
- O auditor aprofundado encontrou 2/8 superfícies prontas. `profiles` e `leads` ainda não têm o contrato canônico completo (`42703`), enquanto `developers`, `developments`, `project_materials` e `properties` não estão disponíveis no schema REST conectado (`PGRST205`).
- O banco ainda usa campos legados (`profiles.name`, `assigned_user_id`, `project_id`, `score_ia`). A migration `20260717213000_v3_legacy_runtime_schema_bridge.sql` faz a transição de forma aditiva e preserva esses campos.
- Integrações externas ainda não têm evidência ponta a ponta.

Produção permanece bloqueada até todas as dez fases passarem com evidência real.
