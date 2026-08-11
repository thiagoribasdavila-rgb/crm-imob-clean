# Atlas One V3000 — Fase 15: piloto operacional restrito

## Resultado

A Fase 15 transforma a estabilidade comprovada da Fase 14 em uma autorização
humana, limitada e auditável para um piloto com três a cinco usuários. O gate
não publica, não cria usuários, não altera o banco, não executa bootstrap e não
expande a operação automaticamente.

O artefato permanece `atlas-one-v3000-phase-10-proven.zip`, SHA-256
`80170576910f3681b50a5a5a43bd24ce0cc29153b9a8d7b22235d9f701336715`.

## Estado factual atual

| Gate | Estado |
| --- | --- |
| Artefato imutável | aprovado |
| Fechamento da release (Fase 13) | aguardando evidência real |
| Observação operacional (Fase 14) | bloqueada até a Fase 13 |
| Piloto controlado (Fase 15) | bloqueado de forma segura |
| Expansão geral de produção | não autorizada |

Sem as evidências reais anteriores, o comando retorna
`pilotStatus=awaiting-operational-observation`. Nenhum usuário ou resultado é
simulado.

## Escopo mínimo do piloto

- três a cinco usuários, sem nomes ou e-mails na evidência;
- papéis Diretor, Gerente e Corretor cobertos;
- isolamento por organização preservado;
- responsável operacional e canal de suporte definidos;
- monitoramento e rollback mantidos;
- zero incidente crítico;
- aprovação humana explícita.

Use uma cópia privada de
`docs/evidence/V3000_PHASE_15_CONTROLLED_PILOT_TEMPLATE.json`. Nunca registre
senha, token, cookie, e-mail, telefone ou valor de variável de ambiente.

## Comando no estado atual

```bash
npm run v3000:phase-15:check -- \
  --zip=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip \
  --checksum=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip.sha256 \
  --proof=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip.proof.json
```

## Comando após todas as provas reais

```bash
npm run v3000:phase-15:check -- \
  --zip=/caminho/atlas-one-v3000-phase-10-proven.zip \
  --checksum=/caminho/atlas-one-v3000-phase-10-proven.zip.sha256 \
  --proof=/caminho/atlas-one-v3000-phase-10-proven.zip.proof.json \
  --production-evidence=/caminho/FASE_11_APROVADA.json \
  --release-evidence=/caminho/FASE_13_APROVADA.json \
  --observation-evidence=/caminho/FASE_14_APROVADA.json \
  --pilot-evidence=/caminho/FASE_15_APROVADA.json
```

## Limites preservados

- o gate não cadastra nem ativa usuários;
- não consulta nem altera o Supabase;
- não publica na Hostinger;
- não recompõe o ZIP aprovado;
- não autoriza expansão geral de produção;
- rollback e qualquer ampliação continuam decisões humanas separadas.
