# Atlas AI V3 — Release Status

Status: **release candidate tecnicamente validado**.

## Quality gate automatizado

- [x] Instalação limpa com `npm ci`
- [x] Prisma Client gerado
- [x] TypeScript sem erros
- [x] ESLint sem erros no escopo ativo
- [x] Build Next.js de produção concluído
- [x] Status de integração Vercel aprovado no commit atual

## Revisão estrutural

- [x] Autenticação Supabase
- [x] Proteção das rotas internas
- [x] Design system responsivo
- [x] Dashboard executivo
- [x] Leads, pipeline, clientes e tarefas
- [x] Imóveis, empreendimentos, oportunidades e relatórios
- [x] Marketing, automações e integrações
- [x] Intelligence Layer, Decision Center e Digital Twin
- [x] Multiempresa, RLS, governança e auditoria
- [x] Migração Supabase V3 versionada

## Gates manuais antes da produção definitiva

- [ ] Login com usuário real do Supabase
- [ ] Criar, editar e consultar lead real
- [ ] Mover lead no pipeline e confirmar persistência
- [ ] Confirmar isolamento entre duas organizações
- [ ] Conferir responsividade em desktop e celular
- [ ] Validar variáveis de ambiente no Preview e Production da Vercel
- [ ] Confirmar ausência de erros de runtime após navegação
- [ ] Fazer backup do banco antes do merge em produção

## Política de lançamento

O projeto não deve ser chamado de produção 100% homologada até os gates manuais acima serem concluídos. O código está compilando e apto para preview; a homologação funcional depende de credenciais, dados e navegação real no ambiente publicado.
