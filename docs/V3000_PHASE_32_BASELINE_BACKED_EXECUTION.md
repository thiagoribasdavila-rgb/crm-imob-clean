# ATLAS ONE V3000 — Fase 32: execução manual baseada na baseline

## Objetivo

Comprovar, por evidência sanitizada e encadeada, que a execução manual autorizada na Fase 31 ocorreu dentro da coorte, papéis, janela, custo e limites operacionais aprovados.

Este gate não executa a operação. Ele apenas valida a prova produzida pelos responsáveis humanos. Não faz deploy, não altera a baseline, não executa migration ou bootstrap, não cria usuários e não modifica dados comerciais.

## Estados

- `awaiting-baseline-backed-next-cycle-execution-evidence`: autorização válida, mas prova da execução ainda ausente.
- `baseline-backed-next-cycle-manual-execution-proven`: execução manual comprovada e pronta para validação independente na Fase 33.

## Evidência necessária

Copie `docs/evidence/V3000_PHASE_32_BASELINE_BACKED_EXECUTION_TEMPLATE.json` para um arquivo não versionado e preencha somente referências sanitizadas. A evidência deve confirmar:

- o mesmo artefato, release, ciclo e baseline das Fases 11, 30 e 31;
- execução dentro da janela autorizada;
- coorte e papéis sem expansão;
- jornadas obrigatórias concluídas sem falha;
- disponibilidade e cobertura de monitoramento acima dos mínimos;
- ausência de incidente crítico, incidente grave não resolvido e regressão material;
- custo observado dentro do teto;
- nenhum efeito automático ou mutação feita por este gate.

Não registre e-mail, telefone, nome de cliente, mensagem, chave, token, senha ou outro dado pessoal/segredo.

## Verificação

```bash
npm run v3000:phase-32:check -- \
  --zip /caminho/para/release.zip \
  --checksum /caminho/para/release.sha256 \
  --proof /caminho/para/prova.json \
  --baseline-backed-planning-evidence /caminho/privado/fase-30.json \
  --baseline-backed-execution-readiness-evidence /caminho/privado/fase-31.json \
  --baseline-backed-execution-evidence /caminho/privado/fase-32.json
```

O comando também exige todas as evidências anteriores da cadeia quando executado contra o artefato real. Aprovação da Fase 32 não autoriza expansão, rollback, deploy ou outra execução; ela abre somente a validação independente da Fase 33.
