# Atlas One V3000 — Fase 24: prontidão para execução do próximo ciclo

## Objetivo

Transformar o plano aprovado na Fase 23 em uma autorização humana limitada
para uma única execução manual do próximo ciclo. A Fase 24 não executa o ciclo,
não publica código, não altera banco, não cria usuários, não amplia a coorte e
não executa rollback.

## Continuidade da cadeia de evidências

A revisão registra `nextCyclePlanningEvidenceSha256`, calculado sobre a
representação JSON canônica da evidência da Fase 23. O gate exige a mesma
identidade de release, artefato e ciclo comprovada nas fases anteriores.

O responsável pela prontidão deve ser diferente do responsável pelo
planejamento e de quem aprovou o plano. A autorização final deve ser feita por
outra pessoa, depois da revisão de prontidão. A janela autorizada precisa estar
integralmente dentro da janela planejada e começar somente depois da
autorização humana.

## O que a autorização permite

Somente uma execução manual, posterior e rastreável, respeitando exatamente:

- a coorte máxima aprovada;
- os papéis `DIRETOR`, `GERENTE` e `CORRETOR`;
- as jornadas e metas aprovadas;
- tolerância zero para falhas obrigatórias e incidentes críticos ou graves;
- o teto de custo aprovado;
- a janela autorizada;
- monitoramento, suporte, privacidade e rollback prontos.

A execução real deverá produzir uma nova evidência em uma fase posterior. A
aprovação da Fase 24 não é prova de execução.

## Estados do gate

- `awaiting-next-cycle-plan`: a Fase 23 ainda não aprovou o plano;
- `awaiting-next-cycle-execution-review`: falta a revisão humana da Fase 24;
- `next-cycle-execution-authorized`: execução manual autorizada, ainda não
  realizada.

## Evidência

Preencha uma cópia de:

`docs/evidence/V3000_PHASE_24_NEXT_CYCLE_EXECUTION_READINESS_TEMPLATE.json`

Use somente identificadores e referências sanitizadas. Não registre nomes,
e-mails, telefones, dados de leads, credenciais, tokens ou outras informações
pessoais.

Para gerar o hash canônico da evidência da Fase 23:

```bash
node -e "import('./scripts/check-v3000-phase-24-next-cycle-execution-readiness.mjs').then(({ canonicalEvidenceSha256 }) => console.log(canonicalEvidenceSha256(JSON.parse(require('node:fs').readFileSync('/caminho/fase-23.json', 'utf8')))))"
```

## Verificação

```bash
npm run v3000:phase-24:test

npm run v3000:phase-24:check -- \
  --zip /caminho/atlas-one-v3000-phase-10-proven.zip \
  --checksum /caminho/atlas-one-v3000-phase-10-proven.zip.sha256 \
  --proof /caminho/atlas-one-v3000-phase-10-proven.zip.proof.json \
  --production-evidence /caminho/fase-11.json \
  --release-evidence /caminho/fase-13.json \
  --observation-evidence /caminho/fase-14.json \
  --pilot-evidence /caminho/fase-15.json \
  --pilot-validation-evidence /caminho/fase-16.json \
  --expansion-evidence /caminho/fase-17.json \
  --execution-evidence /caminho/fase-18.json \
  --expanded-cohort-validation-evidence /caminho/fase-19.json \
  --sustained-operation-evidence /caminho/fase-20.json \
  --sustained-operation-validation-evidence /caminho/fase-21.json \
  --continuous-operation-review-evidence /caminho/fase-22.json \
  --next-cycle-planning-evidence /caminho/fase-23.json \
  --next-cycle-execution-readiness-evidence /caminho/fase-24.json
```

Sem a cadeia integral de evidências, o comando permanece pendente e não produz
efeitos externos.

## Garantias do gate

- nenhum deploy é executado;
- nenhuma migration ou mutação de negócio é aplicada;
- nenhum usuário é criado ou ativado;
- o bootstrap não é executado;
- nenhum segredo ou dado pessoal é armazenado na evidência;
- nenhuma expansão ou reversão automática é permitida.
