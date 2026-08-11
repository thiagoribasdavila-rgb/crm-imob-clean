# Atlas One V3000 — Fase 14: observação operacional controlada

## Resultado

A Fase 14 cria uma janela mínima e verificável entre o fechamento da release e
qualquer ampliação futura de uso. Ela não publica, não promove, não executa
migration, não roda bootstrap e não altera dados. O objetivo é provar que a
mesma release aprovada permaneceu estável depois do aceite operacional.

O artefato continua sendo `atlas-one-v3000-phase-10-proven.zip`, SHA-256
`80170576910f3681b50a5a5a43bd24ce0cc29153b9a8d7b22235d9f701336715`.

## Estado factual atual

| Gate | Estado |
| --- | --- |
| Artefato imutável | aprovado |
| Handoff de instalação | aprovado |
| Fechamento da release (Fase 13) | aguardando evidência real |
| Janela operacional de 30 minutos | não iniciada |
| Expansão controlada | bloqueada de forma segura |

Sem as evidências das Fases 11 e 13, o comando retorna
`operationalStatus=awaiting-release-closure`. Nenhum resultado é simulado.

## O que a observação comprova

Durante pelo menos 30 minutos, a evidência privada precisa registrar:

- duas checagens autenticadas;
- duas checagens do dashboard;
- duas checagens da rota de notificações;
- disponibilidade da mesma release;
- integridade dos dados preservada;
- alvo de rollback ainda válido;
- zero incidente crítico;
- aceite humano ao final da janela.

Use uma cópia privada de
`docs/evidence/V3000_PHASE_14_OPERATIONAL_OBSERVATION_TEMPLATE.json`. Nunca
registre cookie, token, senha ou valor de variável de ambiente.

## Comando no estado atual

```bash
npm run v3000:phase-14:check -- \
  --zip=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip \
  --checksum=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip.sha256 \
  --proof=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip.proof.json
```

## Comando após as provas reais

```bash
npm run v3000:phase-14:check -- \
  --zip=/caminho/atlas-one-v3000-phase-10-proven.zip \
  --checksum=/caminho/atlas-one-v3000-phase-10-proven.zip.sha256 \
  --proof=/caminho/atlas-one-v3000-phase-10-proven.zip.proof.json \
  --production-evidence=/caminho/FASE_11_APROVADA.json \
  --release-evidence=/caminho/FASE_13_APROVADA.json \
  --observation-evidence=/caminho/FASE_14_APROVADA.json
```

## Limites preservados

- administrador, organização e dados existentes não são tocados;
- Supabase não é consultado nem alterado pelo gate;
- Hostinger não recebe publicação automática;
- o ZIP aprovado não é recomposto;
- falha de observação não aciona rollback automaticamente;
- expansão posterior continua dependendo de decisão humana explícita.
