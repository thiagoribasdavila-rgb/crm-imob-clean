# Atlas One V3000 — Fase 17: expansão controlada

## Objetivo

A Fase 17 transforma a validação factual do piloto da Fase 16 em uma decisão
humana, rastreável e reversível sobre ampliar o grupo operacional. Ela permite
autorizar um total entre 6 e 10 usuários, sem criar contas, publicar código,
executar migrations, alterar o banco ou modificar dados comerciais.

O gate existe para impedir que um piloto tecnicamente aprovado seja ampliado
sem capacidade, suporte, monitoramento, isolamento entre organizações e plano de
rollback revisados.

## O que o gate exige

- piloto controlado da Fase 16 validado;
- decisão humana explícita;
- mesmo artefato, SHA-256, fingerprint e identificador da release;
- total autorizado entre 6 e 10 usuários e maior que o piloto validado;
- somente os papéis `DIRETOR`, `GERENTE` e `CORRETOR`;
- capacidade, acessos e isolamento por organização revisados;
- monitoramento e suporte confirmados para o novo grupo;
- rollback ainda pronto;
- nenhum incidente crítico ou grave não resolvido;
- governança de privacidade e dados revisada;
- janela de expansão aprovada depois do encerramento do piloto;
- evidência sanitizada, sem dados pessoais ou segredos.

## O que o gate nunca faz

- não publica uma nova versão;
- não provisiona usuários;
- não executa bootstrap;
- não executa migrations;
- não altera dados comerciais;
- não grava segredos;
- não amplia a operação automaticamente;
- não executa rollback automaticamente.

Mesmo com a decisão aprovada, o resultado é
`authorized-for-manual-execution`: a equipe responsável ainda deve executar a
expansão de forma manual, observável e dentro da janela autorizada.

## Evidência

Copie
[`V3000_PHASE_17_CONTROLLED_EXPANSION_TEMPLATE.json`](./evidence/V3000_PHASE_17_CONTROLLED_EXPANSION_TEMPLATE.json),
preencha somente depois da decisão humana e preserve a referência sanitizada.
Não inclua nomes, e-mails, telefones, tokens, senhas ou outras informações
pessoais.

## Validação

```bash
npm run v3000:phase-17:check -- \
  --zip /caminho/atlas-one-v3000.zip \
  --checksum /caminho/atlas-one-v3000.zip.sha256 \
  --proof /caminho/atlas-one-v3000.zip.proof.json \
  --production-evidence /caminho/fase-11.json \
  --release-evidence /caminho/fase-13.json \
  --observation-evidence /caminho/fase-14.json \
  --pilot-evidence /caminho/fase-15.json \
  --validation-evidence /caminho/fase-16.json \
  --expansion-evidence /caminho/fase-17.json
```

Sem a cadeia de evidências reais, o estado permanece pendente. Isso é uma
proteção operacional, não uma falha do verificador.

## Critério de conclusão

A fase só está operacionalmente aprovada quando o verificador retorna:

```json
{
  "controlledExpansionStatus": "authorized-for-manual-execution",
  "controlledExpansionAuthorized": true,
  "automaticExpansionAllowed": false,
  "productionExpansionPerformedByGate": false
}
```

A fase seguinte pode acompanhar a execução manual da expansão autorizada e o
início da observação do grupo ampliado. Ela não deve presumir que a expansão
aconteceu apenas porque a Fase 17 foi aprovada.
