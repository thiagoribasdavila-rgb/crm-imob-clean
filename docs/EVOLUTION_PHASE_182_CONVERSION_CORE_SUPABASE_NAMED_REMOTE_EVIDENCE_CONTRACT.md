# Fase 182 — contrato de evidência remota nomeada

## Resultado

Foi criado um contrato local, verificável e **fail-closed** para uma futura captura atual dos nomes das migrations remotas envolvidas nas três colisões locais.

O contrato exige simultaneamente:

- captura atual em modo `remote_metadata_read_only`;
- identidade do projeto por hash, sem persistir o project ref em claro;
- timestamp válido e evidência com no máximo 24 horas;
- proveniência do coletor, versão da CLI e hash do comando;
- declaração explícita de ausência de escrita, push, apply, repair, rename e reset;
- seis mapeamentos nomeados, sem duplicidades;
- correspondência de nome lógico e versão remota;
- fingerprints SHA-256 dos arquivos locais e do conjunto completo.

## Limite de segurança

Esta fase **não coletou** evidência remota. Nenhum comando remoto foi executado, nenhuma migration foi alterada e nenhum ambiente operacional foi tocado.

Mesmo que uma evidência futura passe no contrato, ela apenas prova a consistência documental dos mapeamentos. Continuam bloqueados:

- renomear migrations;
- aplicar migrations;
- reparar histórico;
- push direto;
- build;
- ZIP;
- deploy.

Uma revisão humana específica ainda será necessária antes de qualquer proposta local de reconciliação.

## Próximo passo seguro

Preparar, em fase separada, um adaptador local que transforme uma futura saída de metadados nomeados — obtida somente após autorização operacional explícita — no formato deste contrato, sem executar a coleta agora.
