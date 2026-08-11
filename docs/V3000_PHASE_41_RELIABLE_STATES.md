# V3000 — Fase 41: estados confiáveis e consistentes

## Resultado

Sala de Comando, Leads e Pipeline agora declaram o mesmo contrato operacional
para distinguir sete situações reais: carregando, vazio confirmado, leitura
parcial, dado desatualizado, erro recuperável, bloqueio de permissão e sucesso.

O objetivo não é ornamentar falhas. É impedir decisões erradas: ausência
confirmada pode exibir zero; falha de consulta não pode. Mensagens técnicas de
banco e stack são substituídas por uma orientação segura, sem inventar métrica.

## Base canônica

- `ReliableState` concentra semântica, acessibilidade, ação e proteção do texto;
- `LoadingState`, `EmptyState` e `ErrorState` permanecem compatíveis e delegam à
  mesma primitiva;
- o template V3000 declara o contrato para as próximas páginas;
- os estados têm diferenciação textual, estrutural e cromática, sem depender
  somente de cor.

## Regras protegidas

- vazio significa recorte consultado e confirmado;
- erro recuperável exige caminho de recuperação;
- permissão bloqueada não é descrita como indisponibilidade do sistema;
- leitura parcial preserva os dados válidos já carregados;
- nenhuma resposta técnica chega diretamente ao usuário;
- nenhum estado cria valor, porcentagem, previsão ou `NaN`;
- nenhuma API, regra comercial ou estrutura de banco foi alterada.

## Superfícies adotadas

- Sala de Comando (`/dashboard`);
- Leads (`/leads`);
- Pipeline (`/pipeline`).

## Prova automatizada

O gate cobre os sete estados, os adapters, a primitiva server-safe, o template,
a apresentação e as três superfícies. A suíte inclui mutantes para zero
ambíguo, recuperação opcional, vazamento de erro técnico e adoção removida.

```bash
npm run v3000:phase-41:check
npm run v3000:phase-41:test
```

## Não objetivos

Esta fase não muda consulta, persistência, RLS, RBAC, cálculo de score, SLA,
prioridade ou distribuição. Também não gera ZIP nem publica a aplicação.
