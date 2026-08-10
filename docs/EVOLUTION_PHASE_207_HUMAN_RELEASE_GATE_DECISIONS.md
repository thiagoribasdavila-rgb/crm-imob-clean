# Fase 207 — Decisões humanas dos gates de release

## Objetivo

Registrar a decisão humana explícita de cada gate elegível do dossiê da fase 206. Cada decisão é assinada, justificada e vinculada ao pacote, módulo, revisão, gate, papel revisor e fotografia das evidências aceitas.

## Contrato implementado

- somente um dossiê íntegro e `ready_for_human_review` pode receber decisões;
- apenas gates com evidência completa e vigente são elegíveis;
- cada gate exige o papel revisor definido no plano de evidências;
- o revisor precisa ser um signatário Ed25519 confiável, ativo e dentro da validade;
- o resultado permitido é exclusivamente `approved` ou `rejected`;
- a justificativa é obrigatória e normalizada;
- a decisão precisa ocorrer até 1.800 segundos após o preparo do dossiê;
- o registro precisa ocorrer até 300 segundos depois da decisão;
- pacote, política, módulo, revisão, gate, evidência, ator, papel e resultado entram na assinatura;
- uma única decisão é aceita por módulo e gate;
- a revisão só fecha quando todos os gates elegíveis receberam decisão válida.

## Estados de saída

- `awaiting_human_decisions`: ainda existem gates elegíveis sem decisão;
- `human_review_complete_approved`: todos os gates receberam aprovação humana explícita;
- `human_review_complete_rejected`: ao menos um gate recebeu rejeição humana explícita;
- `rejected`: política, pacote, assinatura, papel, tempo, vínculo ou unicidade são inválidos.

## Separação de responsabilidades

Mesmo no estado `human_review_complete_approved`, esta fase **não** declara a release aprovada e **não** executa gates. O registro mantém `releaseApproved`, `gatesExecuted`, `releaseMemoryUpdated`, `packageGenerated`, `deployExecuted` e `releasePromoted` como `false`. A fase 208 deverá derivar uma autorização de execução separada.

## Estado canônico real

A política canônica de proveniência ainda possui zero signatários confiáveis. Portanto não existe dossiê operacional pronto nem decisão humana real registrada. O assessor retorna `awaiting_trusted_signer_configuration`, sem criar atores, aprovações ou evidências fictícias.

## Segurança e validação

Os testes isolados usam chaves Ed25519 efêmeras somente em memória e cobrem: política, decisão válida, adulteração, papel incorreto, pacote incompleto, revisão parcial, aprovação completa sem efeitos, rejeição explícita, duplicidade e adulteração do registro.

## Limites deliberados

Esta fase não acessa serviços remotos, não altera banco, não aplica migration, não roda build, não cria ZIP, não executa gate, não atualiza memória canônica, não faz deploy e não promove release.

## Próxima fase

Fase 208: autorização explícita e separada para executar somente gates aprovados, mantendo pacote, deploy e promoção bloqueados por padrão.
