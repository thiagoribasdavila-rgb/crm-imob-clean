# Importação da memória histórica de leads frias

Data: 17/07/2026  
Organização: `8523bec1-1bef-4395-92ee-7458becc9b3f`  
Lote: `1fb6fd73-b74d-4821-96f1-a01bff77434c`

## Resultado reconciliado

- 35.167 linhas encontradas no inventário original.
- 31.326 registros utilizáveis preparados.
- 16.733 contatos únicos importados.
- 14.593 linhas históricas duplicadas consolidadas.
- 0 registros inválidos no conjunto preparado.
- 0 contatos atribuídos automaticamente a corretores.
- 0 contatos liberados para disparo automático.
- 16.733 contatos gravados com status `arquivado`, fora do pipeline e da carteira diária.

## Classificação local inicial

- `focus`: 1.962
- `watch`: 6.125
- `suppress`: 8.646

A classificação usa somente sinais comerciais disponíveis no arquivo preparado. Ela é uma priorização inicial, não uma autorização de contato e não substitui revisão humana.

## Salvaguardas

- Um contato mestre por telefone ou e-mail normalizado.
- Linhas repetidas não criam cards adicionais.
- Dados sensíveis excluídos na preparação não são enviados para IA nem copiados para as notas do CRM.
- A base permanece sem responsável até promoção manual.
- O campo de próxima ação informa que a reativação depende de aprovação humana.
- A importação pode ser simulada novamente em modo `dry-run` antes de qualquer nova carga.

## Comando de auditoria

```bash
ATLAS_IMPORT_ORGANIZATION_ID=8523bec1-1bef-4395-92ee-7458becc9b3f \
ATLAS_IMPORT_ACTOR_ID=e83e62b2-de97-41cf-a0b4-cf271e016a05 \
node --env-file=.env.local scripts/import-cold-lead-memory-legacy.mjs \
tmp/lead-memory/prepared-memory.jsonl dry-run
```

Após a carga, uma nova simulação deve informar zero novos contatos prontos para importar.
