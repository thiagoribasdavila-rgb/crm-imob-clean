# Atlas One V3000 — Fase 27: encerramento formal do ciclo validado

## Objetivo

Encerrar formalmente, por decisão humana rastreável, o ciclo que foi executado na Fase 25 e validado na Fase 26. Este gate não publica, não expande, não reverte, não cria usuários e não altera banco ou dados comerciais.

## Estado seguro

- Sem evidência factual da Fase 26: o estado anterior é preservado.
- Com Fase 26 validada, mas sem aceite da Fase 27: `awaiting-next-cycle-closure-review`.
- Com evidência integral, independente e aprovada: `next-cycle-formally-closed`.

O encerramento não autoriza outro ciclo. A Fase 28 deverá tratar lições aprendidas e atualização controlada da baseline antes de qualquer novo planejamento.

## Evidência obrigatória

Use uma cópia de `docs/evidence/V3000_PHASE_27_NEXT_CYCLE_CLOSURE_TEMPLATE.json`. Não preencha o template canônico com valores estimados. A evidência deve:

1. apontar para o mesmo artefato, release, origem e ciclo;
2. conter o hash canônico da evidência factual da Fase 26;
3. aceitar exatamente a mesma coorte, papéis, jornadas e métricas validadas;
4. registrar decisão de papel `DIRETOR` e testemunha independente;
5. manter tolerância zero para falhas obrigatórias, incidentes críticos, incidentes graves abertos e regressões materiais;
6. não conter segredos nem dados pessoais;
7. comprovar que o gate não realizou ação externa automática.

## Comando

```bash
npm run v3000:phase-27:check -- \
  --zip=/caminho/release.zip \
  --checksum=/caminho/release.sha256 \
  --proof=/caminho/proof.json \
  --next-cycle-execution-evidence=/caminho/fase-25.json \
  --next-cycle-validation-evidence=/caminho/fase-26.json \
  --next-cycle-closure-evidence=/caminho/fase-27.json
```

Os argumentos das evidências das Fases 11–24 continuam obrigatórios quando a cadeia já avançou até elas.

## Critério de conclusão

Somente o resultado `next-cycle-formally-closed` encerra o ciclo. `awaiting-next-cycle-closure-review` é um bloqueio correto, não uma falha técnica e não pode ser convertido em aprovação por inferência.
