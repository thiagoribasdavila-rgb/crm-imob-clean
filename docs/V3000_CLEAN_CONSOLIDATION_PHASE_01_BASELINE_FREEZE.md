# V3000 limpo — Fase 1/16: congelamento do baseline

Data da captura: `2026-08-11T15:45:52-03:00`  
Finalidade: fixar uma única origem verificável antes de inventariar e eliminar
rotas duplicadas.

## Decisão canônica

| Item | Valor congelado |
|---|---|
| Workspace | `/Users/thiagoribasdavila/.codex/worktrees/v3000-phase10-proof` |
| Branch | `codex/r376-recovery` |
| Upstream | `origin/codex/r376-recovery` |
| Commit | `11de2b921d8e234abcaf70bd0c27be8e79194742` |
| Estado Git antes da fase | limpo e sincronizado com o upstream |
| Aplicação | `atlas-ai-real-estate-os` |
| Versão | `3.0.0-rc.2` |

Este commit é a única fonte canônica para as próximas fases. ZIPs anteriores
são evidência histórica; não podem devolver arquivos ao workspace nem servir de
fonte para a consolidação.

## Linha de origem imediata

1. `11de2b921d8e234abcaf70bd0c27be8e79194742` —
   `fix(v3000): unify command decision surface`
2. `0f500f600631904748cb2422bf4ed4c7fd367181` —
   `fix(v3000): reconcile command decision contracts`
3. `9306daafeca270766bd697b9ad4a7966bc65c1d5` —
   `feat(v3000): checkpoint decision surfaces and release gates`
4. `6c2906a8c6c4caf99c874de5c01b915ccc787cdb` —
   `feat(distribution): add weighted Meta recipient roster`
5. `16669ab65432fed1a91edb573344b4ff2b0fe898` —
   `test(release): classify runtime verification variables`

## Toolchain congelada

| Dependência | Versão |
|---|---:|
| Node.js exigido | `>=22` |
| Node.js usado na captura | `v26.4.0` |
| npm usado na captura | `11.17.0` |
| Next.js | `16.2.11` |
| React | `19.2.4` |
| `@supabase/supabase-js` | `2.110.0` |
| `@supabase/ssr` | `0.12.0` |

O alvo de banco conhecido e preservado é o projeto gerenciado
`atlas-v3-homologacao` (`pozbrcsfthnhmnebfoxv`). Esta fase não acessou, não
alterou e não validou o banco remoto.

## Dimensão factual da fonte

| Superfície | Quantidade |
|---|---:|
| Páginas `page.tsx` | 275 |
| Rotas de API `route.ts` | 173 |
| Migrations SQL | 137 |
| Arquivos sob `tests/` | 235 |
| Scripts npm | 1.162 |
| Páginas com até 20 linhas | 196 |
| Estados `loading.tsx` | 9 |
| Estados `error.tsx` | 1 |

Esses números não representam funcionalidades homologadas. A relação entre 275
páginas, 196 páginas curtas e apenas 10 estados de carregamento/erro é um sinal
objetivo de dispersão que será tratado pelo inventário de rotas da Fase 2.

## Inventário dos artefatos existentes

| Artefato | Commit declarado | SHA-256 | Classificação |
|---|---|---|---|
| `atlas-one-v3000-phase-10-proven.zip` | `6c2906a8` | `80170576910f3681b50a5a5a43bd24ce0cc29153b9a8d7b22235d9f701336715` | histórico; não corresponde ao HEAD |
| `atlas-one-v3000-phase-56-candidate-20260811.zip` | `6c2906a8` | `055ca2f579df3af8cd903bbdec3727da4d081dd84db191df96f3065079bbe467` | candidato histórico; sem relatório de teste incorporado |
| `atlas-v3-hostinger-homologation.zip` | `0f500f60` | `ed067f12d56e46fe0b517afa9e1fb32b7f3ad60d909d4614a415c9ef203508ac` | pacote mais recente existente; um commit atrás do baseline |
| `atlas-one-v3000-command-decision-final.zip` | desconhecido | `3773a795a29383195b2bd4294dd5626138c7f2bea17f33f16e798c776becd4d9` | **não verificável**: só existe o checksum; o ZIP está ausente |

Conclusão: não existe ZIP final reproduzível do commit congelado. Nenhum dos
pacotes acima deve ser publicado como release do HEAD. O próximo ZIP só será
gerado após a consolidação, os gates completos e a instalação limpa previstos
para a Fase 16.

## Gates executados nesta captura

| Gate | Resultado |
|---|---|
| `npm run typecheck` | aprovado, zero erro |
| `npm run lint` | aprovado, zero warning/erro |
| Suíte focal das fases 37–56 | evidência anterior aprovada: 131/131 |
| `npm test` integral | **não encerrado**; execução anterior apresentou repetição/espera prolongada e foi interrompida |
| Build limpo do HEAD | pendente para o gate final |
| Instalação a partir de ZIP do HEAD | pendente; ainda não existe ZIP do HEAD |

O teste integral não é marcado como aprovado por quantidade parcial de casos.
A orquestração da suíte precisa ser fechada antes da release final.

## Restrições do baseline

- não executar bootstrap novamente;
- não alterar administrador, organização, perfis ou dados reais;
- não aplicar migration durante a consolidação de rotas;
- não recuperar código a partir de ZIP histórico;
- não chamar placeholder de módulo funcional;
- não manter duas rotas públicas para a mesma função;
- não gerar ZIP intermediário como se fosse final;
- não incluir `.env.local`, credenciais ou dados privados no pacote.

## Critério de saída da Fase 1

- [x] workspace, branch e commit canônicos fixados;
- [x] Git limpo e upstream confirmado;
- [x] toolchain registrada;
- [x] dimensão da superfície registrada;
- [x] artefatos existentes classificados por evidência;
- [x] ausência de ZIP atual do HEAD explicitada;
- [x] typecheck e lint aprovados;
- [x] banco remoto e operação real preservados.

## Próxima fase

**Fase 2/16 — inventário canônico de rotas:** mapear cada página, API, item de
navegação, redirect e alias; definir `manter`, `redirecionar`, `ocultar` ou
`remover`, sem alterar ainda os fluxos operacionais.
