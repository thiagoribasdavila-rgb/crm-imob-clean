# ATLAS ONE V3000 — Fase 19: validação da coorte expandida

## Objetivo

Validar, com evidência humana e sanitizada, que a expansão manual comprovada na Fase 18 permanece utilizável para Diretor, Gerente e Corretor durante uma janela mínima de observação.

Esta fase é um **gate de validação**. Ela não publica, não cria usuários, não executa bootstrap, não altera banco, não movimenta leads e não faz rollback automático.

## Pré-condição

A Fase 18 precisa retornar `manualExpansionVerified: true`. Sem essa prova, a Fase 19 permanece em `awaiting-controlled-expansion-execution`.

## Evidência exigida

Copie o modelo `docs/evidence/V3000_PHASE_19_EXPANDED_COHORT_VALIDATION_TEMPLATE.json` para um arquivo local não versionado e registre apenas dados agregados:

- total expandido e total de acessos validados;
- papéis Diretor, Gerente e Corretor;
- jornadas autenticadas mínimas previstas no contrato;
- isolamento da organização e escopo de leads, tarefas e pipeline;
- cobertura de monitoramento, suporte e rollback;
- janela de observação de pelo menos 120 minutos;
- zero incidente crítico ou grave não resolvido;
- nenhuma credencial, telefone, e-mail, nome de cliente ou outro dado pessoal.

## Execução

```bash
npm run v3000:phase-19:check -- \
  --zip /caminho/release.zip \
  --checksum /caminho/release.zip.sha256 \
  --proof /caminho/release.zip.proof.json \
  --production-evidence /caminho/fase-11.json \
  --release-evidence /caminho/fase-13.json \
  --observation-evidence /caminho/fase-14.json \
  --pilot-evidence /caminho/fase-15.json \
  --pilot-validation-evidence /caminho/fase-16.json \
  --expansion-evidence /caminho/fase-17.json \
  --execution-evidence /caminho/fase-18.json \
  --expanded-cohort-validation-evidence /caminho/fase-19.json
```

O gate retorna `expanded-cohort-validated` somente quando toda a cadeia de evidências e a observação humana forem coerentes. A saída aprovada permite preparar a próxima etapa operacional, mas não autoriza expansão ou deploy automático.

## Resultado seguro sem evidência real

Quando os arquivos reais ainda não foram fornecidos, a checagem termina com sucesso técnico e estado pendente factual. Isso evita alegar homologação sem prova e preserva a operação atual.
