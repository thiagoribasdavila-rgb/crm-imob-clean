# Fase 380 — Paridade funcional canônica V3000

## Objetivo

Classificar os módulos expostos na navegação por evidência rastreável, sem chamar
uma tela de funcional apenas porque a rota existe.

## Critério executável

Cada módulo interno precisa apresentar, em conjunto:

- página não trivial com exportação padrão;
- estados de carregamento, erro e vazio;
- ausência de placeholder apresentado como entrega concluída;
- API com os métodos HTTP exigidos;
- autenticação, escopo por organização e regra de papel;
- leitura ou escrita persistente;
- pelo menos um contrato automatizado existente;
- presença única na navegação canônica.

## Resultado

- módulos canônicos: 19;
- contratos internos comprovados: 18;
- integrações externas em estado honesto de conexão: 1;
- módulos parciais ou quebrados expostos: zero;
- IDs ou rotas duplicadas no menu: zero;
- evidência inválida: zero.

O módulo **Integrações** preserva sua interface, API, persistência, tenant e
permissões, mas permanece classificado como `CONNECT_REQUIRED`. Credencial
configurada não é tratada como prova de Meta ou WhatsApp operacional.

## Limite da prova

Esta é uma prova estática e reexecutável dos contratos da base canônica. Ela não
declara sessão, organização, dados reais ou fornecedor externo validados em
runtime. Essas provas pertencem aos gates 8 e 9.

## Percentuais verificáveis

- histórico solicitado: 380/380 = 100%;
- cobertura sobre a meta V3000: 380/3000 = 12,7%;
- contratos históricos rastreáveis: 60/380 = 15,8%;
- consolidação do próximo ZIP: 7/16 = 43,8%.

## Evidência

`docs/evidence/V3000_PHASE_380_FUNCTIONAL_PARITY.json`

## Validação executada

- suíte integral: 6.803/6.803 testes aprovados;
- prova específica da fase: 4/4 contratos aprovados;
- build de produção Next.js 16.2.11/Turbopack: aprovado;
- typecheck: aprovado;
- ESLint com zero warnings: aprovado;
- varredura de segredos: 4.699 arquivos, zero credenciais detectadas;
- `git diff --check`: aprovado.

## Próxima fase

Gate 8/16: provar em runtime autenticação, organização, autorização e leitura de
dados sem regressão, preservando o Supabase real.
