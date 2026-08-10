# ATLAS ONE — Fase 29: fila curta de atualização de materiais

## Objetivo

Transformar vencimentos e validações pendentes em trabalho claro para a gestão, dentro da biblioteca existente e sem criar um módulo paralelo.

## Prioridade

1. Material vencido.
2. Material que vence em até 30 dias.
3. Material aguardando validação.

A primeira leitura mostra até cinco pendências. Quando houver mais, a interface informa o saldo e mantém o foco nas mais urgentes.

## Ações reais preservadas

- **Validar:** usa a API existente e registra a conferência no histórico.
- **Atualizar versão:** prepara o formulário existente com tipo, título e descrição e conduz a gestão para o upload.
- A publicação continua versionada; a versão anterior é arquivada pelo fluxo canônico.

## Segurança e escopo

- A fila aparece apenas para papéis que já podem administrar materiais.
- A API de validação também exige um papel de gestão no servidor; ocultar a ação na interface não é usado como controle de segurança.
- Não houve migration, mudança de RLS, autenticação ou dados reais.
- Storage privado, isolamento por organização e links assinados continuam inalterados.

## Validação

```bash
npm run ux:phase-029:check
npm run typecheck
npm run lint
npm test
```
