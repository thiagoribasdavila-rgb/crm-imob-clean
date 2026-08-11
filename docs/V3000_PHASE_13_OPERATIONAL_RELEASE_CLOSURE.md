# Atlas One V3000 — Fase 13: fechamento operacional da release

## Resultado

A Fase 13 adiciona o último gate humano entre a instalação controlada e a
promoção gradual do template. O gate não publica, não executa migration, não
roda bootstrap e não altera dados. Ele somente fecha a release quando três
provas apontam para o mesmo artefato:

1. identidade e build limpo da Fase 10;
2. homologação autenticada da Fase 11;
3. aceite operacional com release anterior preservada e rollback comprovado.

O artefato continua sendo `atlas-one-v3000-phase-10-proven.zip`, SHA-256
`80170576910f3681b50a5a5a43bd24ce0cc29153b9a8d7b22235d9f701336715`.

## Estado factual atual

| Prova | Estado |
| --- | --- |
| Artefato imutável | aprovado |
| Handoff de instalação | aprovado |
| Deploy autorizado | não comprovado |
| Homologação autenticada | pendente |
| Rollback e aceite humano | pendente |
| Fechamento da release | bloqueado de forma segura |

Sem as duas evidências reais, o comando retorna
`releaseStatus=awaiting-post-deploy-evidence`, sem alegar que produção foi
alterada.

## Coleta segura

Depois de uma instalação expressamente autorizada:

1. preencha uma cópia privada do modelo da Fase 11;
2. valide a rota autenticada e remova o registro seguro de teste;
3. preserve a identificação da release anterior disponível para rollback;
4. preencha uma cópia privada de
   `docs/evidence/V3000_PHASE_13_RELEASE_CLOSURE_TEMPLATE.json`;
5. não inclua cookie, token, senha ou valor de variável nos arquivos;
6. mantenha as evidências preenchidas fora do Git e do ZIP público.

## Comando antes da instalação

```bash
npm run v3000:phase-13:check -- \
  --zip=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip \
  --checksum=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip.sha256 \
  --proof=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip.proof.json
```

## Comando de fechamento

```bash
npm run v3000:phase-13:check -- \
  --zip=/caminho/atlas-one-v3000-phase-10-proven.zip \
  --checksum=/caminho/atlas-one-v3000-phase-10-proven.zip.sha256 \
  --proof=/caminho/atlas-one-v3000-phase-10-proven.zip.proof.json \
  --production-evidence=/caminho/FASE_11_APROVADA.json \
  --release-evidence=/caminho/FASE_13_APROVADA.json
```

O aceite somente é válido quando login, rota autenticada, notificações,
release anterior e comando de rollback foram comprovados, com zero migration,
zero bootstrap, zero mutação comercial e nenhum segredo registrado.

## Limites preservados

- administrador e organização existentes não são tocados;
- Supabase não é consultado nem alterado pelo gate;
- Hostinger não recebe publicação automática;
- o ZIP não é recomposto;
- a promoção permanece deliberada e humana, nunca automática.
