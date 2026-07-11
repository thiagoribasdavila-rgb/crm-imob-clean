# Atlas AI — Plano de Execução V1, V2 e V3

Branch de trabalho: `atlas/v1-v2-v3-build`

## Regra de entrega

- nenhuma alteração direta na `main`;
- toda mudança passa por Pull Request;
- build, lint e typecheck devem passar antes do merge;
- segredos ficam apenas em variáveis de ambiente;
- Supabase e Vercel são validados por ambiente;
- funcionalidades sensíveis exigem aprovação humana.

## Fases

1. Auditoria e estabilização da base
2. Arquitetura canônica e banco
3. Autenticação, usuários e permissões
4. CRM: leads, clientes, pipeline e atividades
5. Imóveis, empreendimentos, unidades e matching
6. Dashboard executivo e relatórios
7. Automações, WhatsApp, e-mail e webhooks
8. Marketing Intelligence e Andromeda
9. IA comercial, scoring, copilots e agentes
10. Segurança, multiempresa, testes e deploy
11. Fundação V3: Digital Twin, Market Intelligence e Atlas OS

## Estado inicial desta branch

- conflito de merge do cliente Supabase corrigido;
- scripts de validação adicionados;
- workflow de CI criado;
- `.env.example` documentado;
- próximo passo: executar CI, corrigir erros reais e estabilizar preview deploy.
