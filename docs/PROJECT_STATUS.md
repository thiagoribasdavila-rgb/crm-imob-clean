# Atlas AI — Status do Projeto

Última atualização: 10/07/2026

## Branch oficial de trabalho

`atlas/v1-v2-audit-2026-07-10`

Nenhuma alteração desta frente deve ser aplicada diretamente na `main` sem revisão e aprovação.

## Objetivo

Consolidar a base existente em uma arquitetura estável para entregar o V1 operacional e, ao mesmo tempo, preparar os contratos técnicos necessários para o V2 e a expansão futura ao V3.

## Estado atual

### Auditoria e estabilização

- [x] Branch isolada criada
- [x] Issue de autorização criada
- [x] Primeiro bloqueio crítico identificado
- [x] Conflito de merge em `lib/supabase.ts` corrigido
- [ ] Inventário completo de rotas
- [ ] Inventário completo de componentes
- [ ] Auditoria de imports, aliases e duplicidades
- [ ] Auditoria do banco, Prisma e Supabase
- [ ] Auditoria de autenticação e autorização
- [ ] Build limpo e lint limpo

## Roadmap consolidado V1 + V2

### Fase 0 — Auditoria total e recuperação da base

Progresso: 15%

Objetivos:

- remover conflitos de merge e arquivos corrompidos;
- mapear rotas, componentes, serviços, tipos e integrações;
- identificar código duplicado, páginas conceituais e módulos realmente operacionais;
- definir a arquitetura canônica que suportará V1, V2 e V3;
- estabelecer build, lint e validações automáticas.

### Fase 1 — Fundação da plataforma

Progresso: 0%

Inclui:

- configuração central;
- autenticação;
- multiempresa;
- perfis e permissões;
- Supabase;
- Prisma;
- observabilidade;
- tratamento de erros;
- design system e layout principal.

### Fase 2 — CRM operacional

Progresso: 0%

Inclui:

- leads;
- clientes;
- funil;
- atividades;
- tarefas;
- agenda;
- corretores;
- histórico;
- importação e exportação.

### Fase 3 — Imóveis e empreendimentos

Progresso: 0%

Inclui:

- imóveis;
- empreendimentos;
- unidades;
- disponibilidade;
- tabelas;
- documentos;
- matching cliente-imóvel.

### Fase 4 — Marketing e Andromeda

Progresso: 0%

Inclui:

- campanhas;
- públicos;
- criativos;
- orçamento;
- Meta Ads;
- atribuição;
- landing pages;
- acompanhamento de CPL, CTR, CAC e ROI.

### Fase 5 — Automação comercial

Progresso: 0%

Inclui:

- workflows;
- gatilhos;
- WhatsApp;
- email;
- webhooks;
- follow-up;
- handoff humano;
- regras de segurança e aprovação.

### Fase 6 — Inteligência Atlas V2

Progresso: 0%

Inclui:

- lead scoring;
- recomendação de imóveis;
- previsão de conversão;
- assistentes por função;
- memória operacional;
- centro de decisão;
- análise de campanhas;
- recomendações explicáveis.

### Fase 7 — Financeiro e analytics

Progresso: 0%

Inclui:

- VGV;
- comissões;
- fluxo de pagamento;
- rentabilidade;
- previsão de receita;
- dashboards executivos;
- indicadores comerciais e de marketing.

### Fase 8 — Segurança, qualidade e produção

Progresso: 0%

Inclui:

- LGPD;
- auditoria;
- logs;
- testes;
- CI/CD;
- performance;
- backup;
- deploy;
- documentação operacional.

## Regras técnicas permanentes

1. A `main` permanece protegida.
2. Cada mudança deve ocorrer em branch isolada.
3. Arquivos alterados devem ser entregues completos.
4. Módulos conceituais não entram no fluxo principal sem contrato, implementação e teste.
5. V1 deve ser utilizável; V2 deve ampliar inteligência sem quebrar o V1.
6. Toda automação com efeito externo deve possuir autorização, log e opção de intervenção humana.
7. Nenhuma credencial deve ser versionada no Git.

## Próximo marco

Concluir a Fase 0 com:

- árvore canônica do projeto;
- lista de bloqueios críticos;
- matriz manter/refatorar/arquivar/excluir;
- build reproduzível;
- backlog técnico priorizado;
- plano de implementação executável por fases.
