# ATLAS V30 — Consolidação operacional em 30 fases

**Objetivo:** transformar a estrutura existente em uma operação imobiliária
testável, segura e orientada a conversão, sem recomeçar o produto e sem declarar
como operacional aquilo que ainda não foi comprovado em ambiente real.

## Decisão de execução

O programa possui **30 fases, seis ondas e um único build completo**. Cada fase
fecha uma capacidade com evidência. Quantidade de páginas ou de scripts não
substitui jornada funcionando.

| Onda | Fases | Resultado |
|---|---:|---|
| Fundação única | 1–5 | código, runtime, rotas e typecheck confiáveis |
| Banco e identidade | 6–10 | schema, RLS, RBAC, migração e dados seguros |
| Operação comercial | 11–15 | leads, Kanban, agenda, Cliente 360 e projetos |
| Inteligência aplicada | 16–19 | provedores, memória, score e Copilot |
| Receita conectada | 20–24 | filas, WhatsApp, Meta/CAPI e decisão executiva |
| Qualidade e implantação | 25–30 | UX, testes, carga, build, ZIP e teste real |

O detalhamento executável, testes e critérios de aceite de cada fase estão em
`config/v30-consolidation-30-phases.json`.

## Regra de progresso

Uma fase só fica concluída quando:

1. o problema descrito foi corrigido no código ou no ambiente correto;
2. seus testes passaram;
3. a evidência não depende de dado fictício;
4. não houve regressão nas capacidades anteriores;
5. qualquer bloqueio externo ficou explícito, sem percentual inventado.

Os estados permitidos são:

- **não iniciada** — ainda não foi executada;
- **em execução** — alteração ou teste ainda em curso;
- **aprovada localmente** — código e testes locais passaram;
- **aguardando instalação** — falta dependência ou navegador de teste;
- **aguardando ambiente** — exige Supabase, Hostinger ou provedor real;
- **aprovada em homologação** — jornada real controlada passou;
- **bloqueada** — existe falha objetiva que impede avanço.

## Build e instalações

- O projeto usa Node.js 24; Node.js 22 é o mínimo.
- `npm ci` é a instalação canônica.
- O contrato ativo do Next.js 16 verifica parâmetros assíncronos, `cookies()`,
  `proxy.ts` e inicialização lazy de clientes externos.
- A arquitetura E2E e as jornadas por papel já fazem parte do código; o runner
  Playwright e o Chromium são instalados na fase 26, no executor de homologação.
- O único `next build` completo de fechamento ocorre na fase 29.
- A Hostinger faz a instalação limpa a partir do ZIP aprovado.
- Migrations e DDL são aplicados antes do código que depende deles.

## Gate de teste real

A fase 30 precisa comprovar, no mínimo:

- login, recuperação de senha e sessão;
- ADMIN, diretor, gerente e corretor;
- criação de lead e responsável único;
- movimentação persistida no Kanban;
- tarefa, agenda e próxima ação;
- Cliente 360 e histórico;
- projeto, incorporadora e material privado;
- uma chamada de IA controlada e registrada;
- um fluxo WhatsApp oficial controlado;
- uma lead Meta real controlada;
- um evento CAPI com `test_event_code`, recibo e deduplicação;
- backup, rollback e decisão humana documentados.

Sem essas evidências, o resultado continua candidato de homologação, não produção
10/10.

## Estado inicial em 23/07/2026

O inventário anterior encontrou uma plataforma extensa e funcional em nível
local, porém com quatro lacunas estruturais:

1. o último pacote ainda declarava Node 20, apesar de o projeto exigir Node 22+;
2. o README ainda apontava para Vercel, fora da estratégia oficial;
3. parte material do TypeScript ativo estava excluída do typecheck;
4. as provas reais de banco, papéis, IA, Meta/CAPI, WhatsApp e recuperação ainda
   não fechavam produção.

As fases 1–3 começam corrigindo exatamente essa fundação. O percentual será
recalculado por evidência ao final de cada onda.

## Estado consolidado

Execute:

1. `npm run consolidation:30:local-gates`
2. `npm run consolidation:30:status`

O resultado reproduzível fica em:

- `artifacts/v30/local-gate-results.json`
- `config/v30-consolidation-current-status.json`
- `docs/ATLAS_V30_CONSOLIDATION_STATUS.md`

Os gates locais aprovam contratos e código. A prontidão operacional continua
dependente das evidências de ambiente listadas no relatório de status.
