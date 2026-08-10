# ATLAS AI OS — Dossiê de decisão para homologação

> Modelo de preflight. Não autoriza aplicar migration, executar `db push`,
> reparar histórico, copiar dados reais, promover produção ou mesclar branch.

## 1. Identificação sanitizada

- Ticket de mudança:
- Lote aprovado:
- SHA-256 do manifesto:
- SHA-256 da migration:
- SHA-256 do teste pgTAP:
- SHA-256 do resultado local:
- SHA-256 da evidência de recuperação:
- SHA-256 do descritor do alvo:

Não registrar project ref, URL, chave, connection string, IDs de fixtures ou
saída bruta.

## 2. Ensaio local

- PostgreSQL 17 comprovado:
- Reset 1:
- pgTAP 1:
- Histórico de migrations:
- Lint:
- Advisor de segurança:
- Advisor de desempenho:
- Delta de catálogo igual à allowlist:
- Reset 2:
- pgTAP 2:
- Idempotência:
- Revisão humana:

## 3. Recuperação

- Restore do banco em ambiente isolado:
- Restore do Storage:
- Artefato V3 anterior imutável:
- Smoke autenticado:
- RTO medido:
- RPO medido:
- Aprovação da diretoria:
- Rollback não depende do V2:

## 4. Alvo de homologação

- Tipo: preview branch ou persistent branch
- Ambiente: homologation
- Isolado de produção:
- Não é main:
- Dados: data-less ou synthetic-only
- Identidade: somente hashes
- Saúde da branch: pendente de preflight manual

## 5. Riscos

| Risco | Severidade | Responsável | Disposição | Evidência |
|---|---|---|---|---|
| Preencher | Preencher | Preencher | aceitar, mitigar ou bloquear | SHA-256 |

Nenhum risco pode ficar sem responsável e disposição explícita.

## 6. Decisão

- [ ] Bloqueado
- [ ] Aprovado somente para preflight manual da homologação

Esta decisão não autoriza aplicação remota.
