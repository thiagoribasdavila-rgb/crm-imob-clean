# Fase 183 — adaptador local de captura remota nomeada

## Resultado

Foi criado um adaptador estritamente local que transforma uma futura captura de metadados nominais do ledger remoto no contrato de evidência validado pela fase 182.

O adaptador:

- exige o schema de captura `atlas.read_only_named_migration_metadata_capture.v1`;
- aceita somente metadados `version` e `name` por migration;
- exige identidade do projeto apenas por SHA-256;
- valida proveniência, versão da CLI e hash do comando;
- exige todas as flags de mutação explicitamente falsas;
- rejeita SQL, segredos, campos extras, nomes inconsistentes e registros duplicados;
- resolve os seis arquivos locais pelo nome lógico remoto;
- rejeita mapeamentos ausentes ou ambíguos;
- produz fingerprint determinístico dos metadados de origem;
- revalida a evidência final pelo contrato da fase 182.

Também foi criado um template vazio e seguro para documentar o formato. Ele não simula contato remoto e não contém project ref em claro, SQL ou segredo.

## Limite operacional

Esta fase não criou um coletor remoto e não executou qualquer captura. Nenhum comando conectado ao Supabase foi usado para ler ou escrever o projeto operacional.

Continuam bloqueados:

- aplicação ou push de migrations;
- reparo do histórico;
- renomeação de arquivos;
- reset de banco;
- build;
- ZIP;
- deploy.

Mesmo uma adaptação válida apenas comprova que o documento está bem formado. A reconciliação ainda depende de revisão humana específica.

## Próximo passo seguro

Preparar, isoladamente, o procedimento operacional de captura somente leitura e uso único, sem executá-lo até existir autorização explícita. O procedimento deverá produzir apenas `version` e `name`, registrar proveniência e nunca persistir credenciais ou SQL.

