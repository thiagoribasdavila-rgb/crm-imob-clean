# Atlas One V3000 — Fase 28: lições aprendidas e baseline controlada

## Objetivo

Revisar formalmente as lições do ciclo encerrado na Fase 27 e registrar uma proposta documental de baseline. Este gate organiza aprendizado factual sem publicar, planejar outro ciclo, executar trabalho, criar usuários ou alterar banco, produção e dados comerciais.

## Estado seguro

- Enquanto uma fase anterior estiver pendente, o respectivo estado é preservado.
- Com a Fase 27 encerrada, mas sem evidência da revisão: `awaiting-lessons-learned-review`.
- Com evidência integral, independente e aprovada: `lessons-learned-baseline-committed`.

O estado final registra a baseline apenas como evidência. Ele exige verificação independente posterior e não autoriza automaticamente planejamento, execução, deploy ou mutação da baseline operacional.

## Evidência obrigatória

Use uma cópia de `docs/evidence/V3000_PHASE_28_LESSONS_LEARNED_BASELINE_TEMPLATE.json`. O template é um formulário vazio, não uma prova. A revisão deve:

1. apontar para o mesmo artefato, release, origem e ciclo encerrados;
2. incluir o hash canônico da evidência da Fase 27;
3. preservar exatamente a coorte, os papéis, as jornadas, a disponibilidade, a cobertura de monitoramento e o custo aceitos;
4. considerar os papéis `DIRETOR`, `GERENTE` e `CORRETOR`;
5. registrar ao menos uma lição factual em cada categoria: jornada, operação, suporte, privacidade e custo;
6. registrar responsáveis e prazos para as ações aceitas;
7. manter tolerância zero para incidentes críticos, incidentes graves abertos, regressões materiais e falhas de jornadas obrigatórias;
8. usar decisor e testemunha independentes do encerramento da Fase 27;
9. durar pelo menos vinte minutos e respeitar a cronologia da cadeia;
10. não conter segredos nem dados pessoais e comprovar ausência de efeitos colaterais automáticos.

## Comando

```bash
npm run v3000:phase-28:check -- \
  --zip=/caminho/release.zip \
  --checksum=/caminho/release.sha256 \
  --proof=/caminho/proof.json \
  --next-cycle-execution-evidence=/caminho/fase-25.json \
  --next-cycle-validation-evidence=/caminho/fase-26.json \
  --next-cycle-closure-evidence=/caminho/fase-27.json \
  --lessons-learned-evidence=/caminho/fase-28.json
```

Quando a cadeia já tiver avançado, as evidências das Fases 11–24 também permanecem obrigatórias.

## Critério de conclusão

Somente `lessons-learned-baseline-committed` conclui a Fase 28. O resultado continua sendo documental e exige uma verificação independente da baseline antes de qualquer novo planejamento. A Fase 29 deverá fazer essa verificação sem inferir aprovação, sem reabrir o ciclo e sem executar alterações operacionais.
