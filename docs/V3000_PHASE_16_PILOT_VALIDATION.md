# Atlas One V3000 — Fase 16: validação operacional do piloto

## Resultado da fase

A Fase 16 transforma o piloto controlado da Fase 15 em uma validação operacional
mensurável. Ela não publica, não provisiona usuários, não altera o banco e não
autoriza expansão para produção.

O piloto só é considerado validado quando há evidência sanitizada de pelo menos
24 horas cobrindo os três papéis obrigatórios:

- Diretor: decisão e leitura gerencial;
- Gerente: acompanhamento do time;
- Corretor: jornada comercial e persistência no CRM.

## Proteções do gate

- preserva SHA-256, fingerprint e identificador da release;
- exige exatamente o mesmo grupo de 3 a 5 usuários autorizado na Fase 15;
- exige login e sessão, leitura e gravação do CRM e isolamento por organização;
- bloqueia qualquer incidente crítico, incidente grave não resolvido ou jornada
  obrigatória com falha;
- mantém monitoramento, suporte e rollback prontos;
- proíbe dados pessoais e segredos na evidência;
- não executa deploy, migration, bootstrap, mutação de dados ou criação de usuário;
- exige aprovação humana explícita;
- mantém `productionExpansionAllowed: false` mesmo após aprovação.

## Evidência operacional

Copie
[`V3000_PHASE_16_PILOT_VALIDATION_TEMPLATE.json`](./evidence/V3000_PHASE_16_PILOT_VALIDATION_TEMPLATE.json)
para um arquivo local não versionado e substitua apenas os resultados realmente
observados. Não inclua nomes, e-mails, telefones, mensagens ou qualquer segredo.

O campo `sanitizedFeedbackReference` deve apontar para um registro interno
sanitizado, sem copiar o conteúdo pessoal para o repositório.

## Validação

```bash
npm run v3000:phase-16:test
```

Para avaliar o artefato e toda a cadeia de gates:

```bash
npm run v3000:phase-16:check -- \
  --zip /caminho/atlas-one-v3000.zip \
  --checksum /caminho/atlas-one-v3000.zip.sha256 \
  --proof /caminho/atlas-one-v3000.zip.proof.json \
  --production-evidence /caminho/fase-11.json \
  --release-evidence /caminho/fase-13.json \
  --observation-evidence /caminho/fase-14.json \
  --pilot-evidence /caminho/fase-15.json \
  --validation-evidence /caminho/fase-16.json
```

Sem autorização factual da Fase 15, o resultado correto é
`awaiting-controlled-pilot-authorization`. Com a autorização, mas sem a
evidência operacional, o resultado correto é `awaiting-pilot-validation-evidence`.

## Próximo gate

A expansão para mais usuários deve ser decidida em uma fase posterior, com
aprovação humana e sem transformar esta validação em publicação automática.
