# Auditoria Atlas V3 - 10 fases

## Resultado executivo

O código compila e os contratos de login, sessão, RLS, hierarquia, APIs e segredos passam. A homologação ainda não pode ser considerada funcional porque o banco conectado está atrás do V3 e o endereço público permanece como placeholder.

## Fases

1. **Diagnóstico reproduzível** - concluída. Corrigidos o falso alerta da chave pública Supabase e a classificação de `ATLAS_PACKAGE_ENV_FILE`.
2. **Banco e migrations** - bloqueadora. Aplicar migrations em homologação, executar `npm run audit:runtime-schema` e exigir 8/8 superfícies.
3. **Login e hierarquia** - contratos locais aprovados. O auditor real `npm run audit:auth-hierarchy` está pronto para validar os cinco níveis (admin, diretor, superintendente, gerente e corretor), contas sem perfil, perfis sem autenticação e vínculos de liderança. A execução completa depende da fase 2.
4. **APIs resilientes** - controles locais aprovados para 135 rotas: autenticação, RLS, rate limit, assinatura de webhooks, deduplicação, idempotência e proteção de segredos. O upload de materiais agora rejeita o corpo pelo `Content-Length` antes do parsing e limita documentos a 50 MB e vídeos a 200 MB. Falta o smoke no endereço público de homologação.
5. **CRM e pipeline** - 17 contratos locais aprovados: cadastro progressivo, deduplicação atômica, Lead 360, identidade, atribuição imutável, Kanban, movimentação com conflito/rollback, distribuição explicável, fila sem responsável, reserva, transferências e ownership único. O verificador histórico foi corrigido para aceitar fases concluídas sem exigir regressão do programa. Falta provar o ciclo completo com uma lead de homologação após o banco chegar a 8/8.
6. **Projetos e materiais** - contratos locais aprovados para incorporadora canônica, projetos, tipologias, espelho, importação XLSX/CSV, vigência, materiais, dossiê regional e homologação. Uploads exigem autenticação e assinatura válida, versões são preservadas e links privados expiram em 15 minutos. Falta validar storage e material real depois das migrations e da URL pública.
7. **Desempenho** - o gate `npm run performance:check` mede cada build de produção e bloqueia excesso de chunks, chunk individual, gzip individual e JavaScript total. Latência de banco/API, navegação móvel autenticada e Core Web Vitals continuam pendentes da URL pública de homologação; não são estimados localmente.
8. **Design e acessibilidade** - contratos locais aprovados para componentes canônicos, foco visível, redução de movimento, estados de status/progresso, navegação por perfil, dock móvel, safe area e contenção de foco no Command Center. A inspeção visual de desktop/mobile, contraste e fluxos autenticados permanece pendente da homologação pública.
9. **Segurança e recuperação** - executar backup, restore, revogação de sessão, logs, alertas e rollback.
10. **Homologação Hostinger** - gerar ZIP somente após smoke real, testar os perfis e exigir aprovação humana.

## Bloqueios atuais

- `ATLAS_ENVIRONMENT_ID` ausente.
- `ATLAS_DATABASE_ENVIRONMENT` ausente.
- `ATLAS_BASE_URL` aponta para `https://crm.seudominio.com.br`.
- O auditor aprofundado encontrou 2/8 superfícies prontas. `profiles` e `leads` ainda não têm o contrato canônico completo (`42703`), enquanto `developers`, `developments`, `project_materials` e `properties` não estão disponíveis no schema REST conectado (`PGRST205`).
- O banco ainda usa campos legados (`profiles.name`, `assigned_user_id`, `project_id`, `score_ia`). A migration `20260717213000_v3_legacy_runtime_schema_bridge.sql` faz a transição de forma aditiva e preserva esses campos.
- A auditoria real de autenticação para de forma segura enquanto `profiles` não possuir `commercial_role` e `reports_to`; ela não cria, bloqueia, exclui ou altera usuários.
- Integrações externas ainda não têm evidência ponta a ponta.

Produção permanece bloqueada até todas as dez fases passarem com evidência real.
