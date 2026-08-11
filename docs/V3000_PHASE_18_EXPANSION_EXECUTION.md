# Atlas One V3000 — Fase 18: execução manual da expansão

## Objetivo

A Fase 18 comprova que a expansão autorizada na Fase 17 foi executada
manualmente, com o mesmo artefato e dentro do limite de 6 a 10 usuários. O gate
valida apenas evidências agregadas e sanitizadas: ele não cria contas, não
publica código e não altera o banco.

## Aprovação factual

Para concluir a fase, a evidência deve comprovar:

- autorização válida da Fase 17;
- total expandido exatamente igual ao total autorizado;
- quantidade de novos usuários coerente com o piloto anterior;
- validação de acesso para todo o grupo ampliado;
- preservação dos papéis `DIRETOR`, `GERENTE` e `CORRETOR`;
- isolamento por organização, monitoramento, suporte e rollback ativos;
- ausência de incidente crítico ou grave em aberto;
- execução dentro da janela humana autorizada, por pelo menos 30 minutos;
- ausência de dados pessoais e segredos na evidência.

## Segurança

O verificador nunca provisiona usuários nem executa deploy, bootstrap,
migrations, rollback ou mutações comerciais. O campo
`usersProvisionedByGate` deve continuar igual a zero, mesmo que a equipe tenha
feito o onboarding manual fora do gate.

## Validação

```bash
npm run v3000:phase-18:check -- \
  --zip /caminho/atlas-one-v3000.zip \
  --checksum /caminho/atlas-one-v3000.zip.sha256 \
  --proof /caminho/atlas-one-v3000.zip.proof.json \
  --production-evidence /caminho/fase-11.json \
  --release-evidence /caminho/fase-13.json \
  --observation-evidence /caminho/fase-14.json \
  --pilot-evidence /caminho/fase-15.json \
  --validation-evidence /caminho/fase-16.json \
  --expansion-evidence /caminho/fase-17.json \
  --execution-evidence /caminho/fase-18.json
```

Sem evidência real das fases anteriores, o estado correto é
`awaiting-controlled-expansion-authorization`.

## Resultado aprovado

```json
{
  "expansionExecutionStatus": "controlled-expansion-executed",
  "manualExpansionVerified": true,
  "automaticExpansionAllowed": false,
  "usersProvisionedByGate": 0
}
```
