# Fase 379 — Prova executável da superfície ativa V3000

## Objetivo

Comprovar que todas as páginas, APIs e rotas de compatibilidade mantidas na base
canônica existem, possuem contrato executável e chegam ao build de produção.

## Escopo validado

- 268 arquivos de rota ativos;
- 95 páginas com exportação padrão;
- 173 APIs com pelo menos um método HTTP exportado;
- 180 arquivos legados mantidos fora da compilação pela quarentena;
- quatro aliases permanentes apontando diretamente para páginas canônicas;
- zero colisão entre URLs ativas.

## Prova no build

O manifesto de produção contém 270 entradas:

- 268 rotas pertencentes à superfície ativa;
- `/_global-error/page` e `/_not-found/page`, geradas internamente pelo Next.js;
- nenhuma rota em quarentena;
- nenhuma rota ativa ausente;
- nenhum caminho público divergente;
- os quatro redirects permanentes com status 308.

## Preservação

Esta fase não altera telas, APIs, autenticação, Supabase, RLS, organização ou dados.
Ela adiciona somente uma auditoria reexecutável e um contrato que impede regressões
na superfície já consolidada.

## Percentuais verificáveis

- histórico documentado: 379/380 = 99,7%;
- cobertura sobre a meta V3000: 379/3000 = 12,6%;
- contratos rastreáveis: 59/379 = 15,6%;
- consolidação do próximo ZIP: 6/16 = 37,5%.

## Próxima fase

Gate 7/16: fechar a paridade funcional, classificando as páginas ativas por operação
real e impedindo placeholders de aparecerem como módulos concluídos.
