# Atlas One — Fase 24 — Recuperação de dados essenciais

## Objetivo

Permitir que o corretor complete projeto, investimento, região, tipologia e telefone diretamente a partir da leitura operacional do Lead 360, sem procurar o formulário correto nem criar uma segunda fonte de dados.

## Alterações

- Uma fila compacta identifica somente os dados comerciais essenciais ausentes.
- A lacuna de maior impacto aparece primeiro com uma ação direta.
- As demais pendências ficam em uma lista curta, reduzindo ruído visual.
- Projeto abre automaticamente a correção de contexto comercial já governada, com justificativa e confirmação humana.
- Investimento, região, tipologia e telefone levam aos campos existentes do perfil canônico.
- O formulário oficial recebeu uma âncora estável para navegação e foco acessível.

## Impacto operacional

- O corretor sabe qual dado perguntar primeiro durante o atendimento.
- A recuperação deixa de exigir procura por seções ou telas.
- Matching, materiais e continuidade de contato ganham contexto sem duplicação.
- RLS, organização, responsável e histórico permanecem preservados.

## Limites da fase

Não houve alteração em Supabase, migrations, APIs, RLS, autenticação, RBAC, automações, dados reais ou pacote de release.

## Validação

```bash
npm run ux:phase-024:check
node --test tests/contracts/essential-data-recovery.test.mjs
npm test
npm run typecheck
npm run lint
```
