# ATLAS ONE — Fase 354: gate factual do ciclo 350–354

## Resultado desta fase

Foi implementado um gate local e somente leitura para decidir a liberação do ciclo “lead recebida até primeira ação”. Ele não consulta nem altera o Supabase, não executa build, não cria ZIP e não faz deploy.

O ciclo só é aprovado quando os três fatos abaixo estão registrados em artefatos sanitizados:

1. baseline autenticada da fase 350, capturada antes da mudança;
2. persistência autenticada e idempotente da primeira ação na fase 353;
3. medição agregada autenticada posterior da fase 354.

## Regra de decisão

O comando é:

```bash
npm run evolution:phase-354:gate
```

O gate exige redução real de `medianLeadToFirstActionMinutes`. Métrica ausente ou desconhecida permanece `null`; nunca vira zero. A prova de uma única lead não é tratada como mediana operacional, e uma baseline capturada retroativamente não é aceita.

Arquivos esperados:

- `artifacts/runtime/phase-350/lead-intake-baseline.json`
- `artifacts/runtime/phase-353/first-action-evidence.json`
- `artifacts/runtime/phase-354/lead-intake-after.json`

Os caminhos podem ser substituídos localmente por `ATLAS_PHASE_350_EVIDENCE_FILE`, `ATLAS_PHASE_353_EVIDENCE_FILE` e `ATLAS_PHASE_354_AFTER_EVIDENCE_FILE`.

## Coleta segura disponível

Sem enviar credenciais ao chat, configure a conta exclusiva de homologação apenas em `.env.local`. A prova da fase 353 agora grava o artefato sanitizado somente depois de confirmar sessão, RLS, persistência atômica e replay idempotente. A medição posterior é exclusivamente de leitura e grava apenas agregados:

```bash
npm run verify:phase-353:first-action
npm run capture:phase-354:after
npm run evolution:phase-354:gate
```

`capture:phase-354:after` exige administrador ou diretor, confirma a organização retornada, a aplicação da hierarquia e a ausência de dados pessoais. Se faltarem credenciais ou amostra mensurável, nenhum artefato é criado. Nenhum desses comandos fabrica a baseline da fase 350.

## Estado atual

O gate está implementado, mas a release continua bloqueada. A migration remota da fase 352 foi aplicada e auditada em 09/08/2026. Ainda faltam a configuração segura da conta de homologação, a lead explicitamente designada e as três evidências factuais do ciclo. Portanto:

- marcador oficial: **349**;
- ciclo 350–354: **não liberado**;
- build/ZIP/deploy: **não autorizados**.

## Validação local executada em 09/08/2026

- contratos específicos das fases 353–354: **13/13 aprovados**;
- TypeScript: **aprovado**;
- ESLint dos arquivos alterados: **aprovado**;
- varredura de segredos: **4.361 arquivos, zero credenciais detectadas**;
- continuidade do programa 350–399: **aprovada**;
- preflight remoto sem variáveis: **bloqueado sem escrita**, conforme esperado;
- gate factual: **bloqueado**, sem converter métricas ausentes em zero;
- regressão global: **6.136/6.136 aprovada**, sem falhas, cancelamentos ou testes ignorados.

A regressão anterior revelou incompatibilidades entre os nomes publicados pelo produtor da autorização e os campos lidos pelo consumidor, além de fixtures posteriores posicionadas antes da continuação que deveriam observar. Esses defeitos foram corrigidos sem relaxar as regras temporais ou de segurança. A regressão global posterior encerrou com **6.136 testes aprovados e zero falhas** em aproximadamente 899 segundos.

### Correção do contrato legado em 09/08/2026

A cadeia de autorização e consumo possuía uma incompatibilidade factual entre produtor e consumidor: a autorização publicava os campos `nextSubsequentContinuation*`, enquanto o consumidor tentava ler campos inexistentes `followingSubsequentContinuation*`. O consumidor agora mapeia os valores publicados para o seu formato de recibo sem alterar o contrato de saída.

As fixtures também foram alinhadas à janela real da autorização: consumo às 10:51, continuação às 10:52 e expiração às 10:54. Nenhuma regra de segurança foi relaxada.

Validação específica concluída:

- caminho crítico: **8/8 aprovado**;
- contrato completo da cadeia afetada após o alinhamento temporal: **242/242 aprovado** em 147 segundos;
- TypeScript: **aprovado**;
- ESLint dos sete arquivos envolvidos: **aprovado**;
- regressão global: **6.136/6.136 aprovada** em aproximadamente 899 segundos.

Essa evidência remove o defeito conhecido da cadeia legada afetada e aprova a regressão local completa. Ela não substitui as três provas autenticadas exigidas pelo gate.

## Próxima prova necessária

Configurar as variáveis apenas em `.env.local`/ambiente seguro e executar a validação autenticada da fase 353. A baseline da fase 350 precisa ser uma evidência anterior autêntica; não pode ser criada retroativamente. Depois deve ser coletada a medição agregada posterior pelo contrato `/api/v1/analytics/lead-intake`, sem dados pessoais.
