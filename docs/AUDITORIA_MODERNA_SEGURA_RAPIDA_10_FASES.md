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
- O auditor encontrou 6/8 superfícies prontas; faltam `profiles.commercial_role` e `leads.assigned_to` (`42703`).
- Integrações externas ainda não têm evidência ponta a ponta.

Produção permanece bloqueada até todas as dez fases passarem com evidência real.
