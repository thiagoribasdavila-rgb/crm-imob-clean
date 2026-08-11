# Atlas One V3000 — Fase 29: verificação independente da baseline

## Objetivo

Verificar de forma independente a baseline documental comprometida na Fase 28. O gate reconcilia artefato, cadeia de evidências, papéis, lições, jornadas, operação, incidentes, regressões e custo sem publicar, planejar, executar, criar usuários ou alterar banco, produção e dados comerciais.

## Estados seguros

- Enquanto uma fase anterior estiver pendente, o respectivo estado é preservado.
- Com a Fase 28 concluída, mas sem a verificação independente: `awaiting-baseline-verification`.
- Com evidência integral e aprovada: `lessons-learned-baseline-verified`.

Mesmo no estado final, o gate apenas libera uma futura revisão humana de planejamento. Ele não autoriza automaticamente novo ciclo, execução, expansão, deploy ou mutação da baseline.

## Evidência obrigatória

Use uma cópia de `docs/evidence/V3000_PHASE_29_BASELINE_VERIFICATION_TEMPLATE.json`. O template vazio não é prova. A verificação deve:

1. recalcular o hash canônico da evidência da Fase 28;
2. apontar para o mesmo artefato, release, origem, ciclo e referências de baseline;
3. reconciliar exatamente papéis, lições, categorias, ações e mudanças aceitas;
4. reconciliar coorte, jornadas, disponibilidade, monitoramento, incidentes, regressões e custo;
5. manter tolerância zero para falhas de jornadas obrigatórias, incidentes críticos, incidentes graves abertos e regressões materiais;
6. usar decisor e testemunha independentes da Fase 28 e entre si;
7. durar pelo menos vinte minutos e respeitar a cronologia da cadeia;
8. confirmar que a baseline permanece documental;
9. não conter segredos nem dados pessoais;
10. comprovar ausência de migrations, bootstrap, mutações comerciais, provisionamento e ações automáticas.

## Comando

```bash
npm run v3000:phase-29:check -- \
  --zip=/caminho/release.zip \
  --checksum=/caminho/release.sha256 \
  --proof=/caminho/proof.json \
  --next-cycle-closure-evidence=/caminho/fase-27.json \
  --lessons-learned-evidence=/caminho/fase-28.json \
  --baseline-verification-evidence=/caminho/fase-29.json
```

As evidências das Fases 11–26 também permanecem obrigatórias quando a cadeia já tiver avançado.

## Critério de conclusão

Somente `lessons-learned-baseline-verified` conclui a Fase 29. O resultado mantém `nextCyclePlanningAuthorized: false` e exige uma revisão humana específica antes de qualquer planejamento futuro. Uma eventual Fase 30 poderá criar esse gate de planejamento, sem inferir autorização a partir desta verificação.
