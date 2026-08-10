# Fase 201 — Matriz de evidências dos gates de release

## Resultado

A composição `conversion-core-candidate` agora possui um contrato verificável para as provas que faltam antes de qualquer promoção de release.

- 2 módulos na clausura;
- 8 gates de release;
- 14 evidências obrigatórias;
- 0 gates satisfeitos sem prova;
- nenhuma memória de conclusão alterada;
- nenhum build, ZIP ou deploy executado.

## Evidências exigidas

| Gate | Responsável | Evidências |
| --- | --- | --- |
| `runtimeHomologated` | QA | fluxo autenticado por papel e isolamento entre tenants |
| `cleanBuildVerified` | Engenharia | instalação limpa e build de produção |
| `rollbackReady` | Operações | integridade do backup e ensaio de restauração isolado |
| `directorApproved` | Diretoria | aprovação explícita e vinculada à decisão |

Cada recibo é vinculado ao módulo, revisão, hash da entrada e hash da decisão de composição. Evidência expirada, adulterada, ambígua ou originada de outra decisão não libera gate.

## Limite desta fase

Esta fase define e avalia contratos. Ela não executa homologação, não inventa evidência, não atualiza os gates da memória e não gera pacote. A futura entrada de evidências deverá continuar separada da decisão de promoção.
