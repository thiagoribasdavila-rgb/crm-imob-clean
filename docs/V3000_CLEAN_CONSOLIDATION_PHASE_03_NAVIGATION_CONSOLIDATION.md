# V3000 limpo — Fase 3/16: navegação e aliases consolidados

Finalidade: reduzir a superfície pública a um caminho oficial por função,
preservando somente compatibilidades úteis e mantendo a proteção de sessão fora
do contrato de redirects estáticos.

## Resultado executivo

| Medida | Resultado |
|---|---:|
| Destinos canônicos do menu | 19/19 ativos |
| Destinos governados totais | 29/29 ativos |
| Redirects de compatibilidade preservados | 4 |
| Aliases sem destino operacional removidos | 3 |
| Colisões entre origem e página ativa | 0 |
| Cadeias de redirect | 0 |
| Ciclos de redirect | 0 |
| Referências ativas a aliases legados | 0 |
| Aliases tratados pelo `proxy.ts` | 0 |

O contrato reproduzível está em
`docs/evidence/V3000_PHASE_03_NAVIGATION_CONTRACT.json`.

## Caminhos oficiais

`lib/atlas/navigation.ts` continua sendo a fonte única do menu, comandos
contextuais e ações por tarefa. Todos os 29 destinos usados por essas
superfícies possuem página ativa e nenhuma ação visível depende de uma rota
isolada.

## Compatibilidade preservada

| Entrada antiga | Destino oficial | Regra |
|---|---|---|
| `/analytics` | `/reports` | redirect permanente |
| `/chat` | `/conversations` | redirect permanente |
| `/creatives` | `/marketing/creatives` | redirect permanente |
| `/kanban` | `/pipeline` | redirect permanente |

Essas regras agora vivem em `config/atlas-route-aliases.json` e são publicadas
por `next.config.ts`. Isso elimina a dependência de páginas duplicadas apenas
para redirecionar e segue o contrato do Next.js 16: aliases estáticos ficam em
`redirects`, enquanto `proxy.ts` permanece responsável por decisões
condicionais de sessão e acesso.

## Aliases retirados

| Entrada antiga | Antigo destino | Motivo |
|---|---|---|
| `/agents` | `/atlas-v3/agents` | origem e destino estão em quarentena |
| `/ai-insights` | `/intelligence` | origem e destino estão em quarentena |
| `/automation` | `/automations` | origem e destino estão em quarentena |

Esses caminhos não são publicados como módulos concluídos. O código histórico
permanece isolado para a limpeza física controlada da Fase 4.

## Provas automatizadas

O contrato
`tests/contracts/v3000-clean-consolidation-phase-03-navigation-consolidation.test.mjs`
valida:

- 100% dos destinos governados presentes na superfície ativa;
- origem de alias sem página ativa concorrente;
- destino de todo redirect existente e ativo;
- redirects permanentes, sem duplicidade, cadeia ou ciclo;
- ausência dos três aliases sem destino operacional;
- zero referência ativa aos aliases de compatibilidade;
- zero regra de alias no `proxy.ts`;
- ausência de leitura de dados, ambiente e segredos.

### Fronteira do typecheck ativo

O `next typegen` validou que o `next.config.ts` é carregável, mas também provou
que o registro global gerado pelo Next ainda importa páginas fisicamente
presentes em grupos já quarentenados. Como `tsconfig.active.json` existe para
validar apenas a superfície canônica, ele não inclui mais `.next/types` nem
`.next/dev/types`; isso impede que a validade do typecheck dependa do estado do
cache local.

Essa separação não substitui o gate integral da release. A remoção física das
rotas isoladas será tratada na Fase 4 e o build de produção completo continuará
obrigatório antes do ZIP final.

## Alterações operacionais

- banco remoto: nenhuma;
- migrations: nenhuma;
- usuários, organização e perfis: nenhuma;
- autenticação e bootstrap: nenhuma;
- rotas funcionais removidas: nenhuma;
- ZIP e deploy: não gerados nesta fase.

## Critério de saída da Fase 3

- [x] uma rota oficial por função na navegação;
- [x] compatibilidades úteis centralizadas;
- [x] aliases mortos removidos do contrato público;
- [x] `proxy.ts` preservado para sessão e segurança;
- [x] nenhuma referência ativa depende de alias legado;
- [x] contrato reproduzível e testado.

## Próxima fase

**Fase 4/16 — limpeza física segura:** remover páginas de redirect e artefatos
históricos que a prova de dependências classificar como descartáveis, mantendo
os quatro redirects oficiais e sem tocar em módulos operacionais.
